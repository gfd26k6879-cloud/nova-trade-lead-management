import {
  createAuditLog,
  createLeadAiArtifactJob,
  getConfiguredOpenAiApiKey,
  getLatestLeadAiArtifact,
  getLeadById,
  leaseNextLeadAiArtifactJob,
  getSettings,
  logAiUsageEvent,
  markLeadAiArtifactComplete,
  markLeadAiArtifactError,
  markLeadAiArtifactRetry,
  type LeadAiArtifact,
  type LeadAiArtifactType,
  type Settings,
} from "@/lib/db/queries";
import { getConfiguredOpenAIModel, OPENAI_LEAD_VERIFICATION_MODEL } from "@/lib/ai/config";
import {
  buildLeadArtifactContext,
  callOpenAILeadArtifact,
  createLeadArtifactInputHash,
  extractArtifactSources,
  LEAD_INTELLIGENCE_PROMPT_VERSION,
} from "@/lib/ai/lead-intelligence";

export type LeadArtifactWorkerResult =
  | { status: "complete"; leadId: string; leadName: string; artifactType: LeadAiArtifactType; artifactId: string }
  | { status: "queued"; leadId: string; artifactType: LeadAiArtifactType; artifactId: string; skippedExisting: boolean }
  | { status: "idle"; reason?: string }
  | { status: "disabled"; reason: string }
  | { status: "retrying"; artifactId: string; leadId: string; error: string; nextRetryAt: string | null }
  | { status: "error"; artifactId?: string; leadId?: string; error: string };

export async function queueLeadAiArtifact(
  leadId: string,
  artifactType: LeadAiArtifactType,
  options: { force?: boolean; settings?: Settings } = {},
): Promise<LeadArtifactWorkerResult> {
  const settings = options.settings ?? await getSettings();
  if (!settings.ai_enabled) return { status: "disabled", reason: "AI is disabled in Settings." };

  const lead = await getLeadById(leadId);
  if (!lead) return { status: "error", leadId, error: "Lead not found." };
  if (!isLeadEligibleForArtifact(lead)) return { status: "error", leadId, error: "Lead is closed, excluded, or not operational." };

  const context = await buildLeadArtifactContext(lead);
  const inputHash = createLeadArtifactInputHash(artifactType, context);
  const latest = await getLatestLeadAiArtifact(leadId, artifactType);

  if (!options.force && latest && latest.input_hash === inputHash && (latest.status === "queued" || latest.status === "running" || latest.status === "complete")) {
    return {
      status: "queued",
      leadId,
      artifactType,
      artifactId: latest.id,
      skippedExisting: true,
    };
  }

  const artifact = await createLeadAiArtifactJob({
    lead_id: leadId,
    artifact_type: artifactType,
    model: OPENAI_LEAD_VERIFICATION_MODEL,
    input_hash: inputHash,
    prompt_version: LEAD_INTELLIGENCE_PROMPT_VERSION,
  });
  await createAuditLog("lead_ai_artifact_queued", "lead", leadId, { artifactId: artifact.id, artifactType, force: !!options.force });
  return {
    status: "queued",
    leadId,
    artifactType,
    artifactId: artifact.id,
    skippedExisting: false,
  };
}

export async function queueLeadPitchPack(
  leadId: string,
  options: { force?: boolean; settings?: Settings } = {},
): Promise<{ businessDetail: LeadArtifactWorkerResult; competitiveReport: LeadArtifactWorkerResult }> {
  const settings = options.settings ?? await getSettings();
  const businessDetail = await queueLeadAiArtifact(leadId, "business_detail", { ...options, settings });
  const competitiveReport = await queueLeadAiArtifact(leadId, "competitive_report", { ...options, settings });
  return { businessDetail, competitiveReport };
}

export async function processNextLeadArtifactJob(): Promise<LeadArtifactWorkerResult> {
  const settings = await getSettings();
  if (!settings.ai_enabled) return { status: "disabled", reason: "AI is disabled in Settings." };

  const artifact = await leaseNextLeadAiArtifactJob(3);
  if (!artifact) return { status: "idle", reason: "No lead intelligence jobs are queued." };

  const lead = await getLeadById(artifact.lead_id);
  if (!lead) {
    await markArtifactError(artifact, "Lead not found.");
    return { status: "error", artifactId: artifact.id, leadId: artifact.lead_id, error: "Lead not found." };
  }

  const model = getConfiguredOpenAIModel();
  if (model !== OPENAI_LEAD_VERIFICATION_MODEL) {
    const error = "AI model guardrail rejected the configured model.";
    await markArtifactError(artifact, error);
    return { status: "error", artifactId: artifact.id, leadId: lead.id, error };
  }

  try {
    const result = await callOpenAILeadArtifact(lead, artifact.artifact_type, await getConfiguredOpenAiApiKey());
    await markLeadAiArtifactComplete(artifact.id, {
      content_json: result.content as unknown as Record<string, unknown>,
      sources_json: extractArtifactSources(result.content),
      confidence: result.content.confidence,
      usage_input_tokens: result.inputTokens,
      usage_output_tokens: result.outputTokens,
      estimated_cost: result.estimatedCost,
    });
    await logAiUsageEvent({
      lead_id: lead.id,
      model,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      estimated_cost: result.estimatedCost,
      metadata: {
        artifactId: artifact.id,
        artifactType: artifact.artifact_type,
        promptVersion: LEAD_INTELLIGENCE_PROMPT_VERSION,
        inputHash: result.inputHash,
      },
    });
    await createAuditLog("lead_ai_artifact_completed", "lead", lead.id, { artifactId: artifact.id, artifactType: artifact.artifact_type });
    return {
      status: "complete",
      leadId: lead.id,
      leadName: lead.name ?? "Unknown lead",
      artifactType: artifact.artifact_type,
      artifactId: artifact.id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lead intelligence generation failed.";
    const retry = await markArtifactRetry(artifact, message);
    await logAiUsageEvent({
      lead_id: lead.id,
      model,
      success: false,
      estimated_cost: 0,
      metadata: {
        artifactId: artifact.id,
        artifactType: artifact.artifact_type,
        error: message,
      },
    });
    if (retry.status !== "error") {
      return { status: "retrying", artifactId: artifact.id, leadId: lead.id, error: message, nextRetryAt: retry.nextRetryAt };
    }
    return { status: "error", artifactId: artifact.id, leadId: lead.id, error: message };
  }
}

async function markArtifactError(artifact: LeadAiArtifact, message: string): Promise<void> {
  await markLeadAiArtifactError(artifact.id, message);
  await createAuditLog("lead_ai_artifact_failed", "lead", artifact.lead_id, {
    artifactId: artifact.id,
    artifactType: artifact.artifact_type,
    error: message,
  });
}

async function markArtifactRetry(
  artifact: LeadAiArtifact,
  message: string,
): Promise<{ status: "queued" | "error"; nextRetryAt: string | null }> {
  const retry = await markLeadAiArtifactRetry(artifact.id, message, artifact.max_attempts);
  await createAuditLog(retry.status === "error" ? "lead_ai_artifact_failed" : "lead_ai_artifact_retry_scheduled", "lead", artifact.lead_id, {
    artifactId: artifact.id,
    artifactType: artifact.artifact_type,
    error: message,
    attemptCount: retry.attemptCount,
    maxAttempts: retry.maxAttempts,
    nextRetryAt: retry.nextRetryAt,
  });
  return { status: retry.status, nextRetryAt: retry.nextRetryAt };
}

function isLeadEligibleForArtifact(lead: { is_excluded: boolean; status: string; business_status: string | null }): boolean {
  return !lead.is_excluded &&
    lead.status !== "closed_won" &&
    lead.status !== "closed_lost" &&
    lead.business_status !== "CLOSED_PERMANENTLY" &&
    lead.business_status !== "CLOSED_TEMPORARILY";
}
