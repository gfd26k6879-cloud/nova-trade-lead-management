import {
  createAuditLog,
  createLeadAiArtifactJob,
  getConfiguredOpenAiApiKey,
  getLeadAiArtifactById,
  getLatestLeadAiArtifact,
  getLeadById,
  leaseLeadAiArtifactJobById,
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
import { OpenAIResponseParseError, OpenAIUsageError } from "@/lib/ai/lead-verification";
import { runAiPostSuccessBookkeeping } from "@/lib/ai/post-success-bookkeeping";
import { throwIfWorkerAborted } from "@/lib/worker-abort";

export type LeadArtifactWorkerResult =
  | { status: "complete"; leadId: string; leadName: string; artifactType: LeadAiArtifactType; artifactId: string }
  | { status: "queued"; leadId: string; artifactType: LeadAiArtifactType; artifactId: string; skippedExisting: boolean }
  | { status: "idle"; reason?: string }
  | { status: "disabled"; reason: string }
  | { status: "retrying"; artifactId: string; leadId: string; error: string; nextRetryAt: string | null }
  | { status: "error"; artifactId?: string; leadId?: string; error: string };

export interface LeadArtifactRunOptions {
  force?: boolean;
  settings?: Settings;
  actorUserId?: string | null;
  requestSource?: string | null;
}

export async function queueLeadAiArtifact(
  leadId: string,
  artifactType: LeadAiArtifactType,
  options: LeadArtifactRunOptions = {},
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
    requested_by_user_id: options.actorUserId ?? null,
    request_source: options.requestSource ?? null,
  });
  await createAuditLog("lead_ai_artifact_queued", "lead", leadId, {
    artifactId: artifact.id,
    artifactType,
    force: !!options.force,
    actorUserId: options.actorUserId ?? null,
    requestSource: options.requestSource ?? null,
  });
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
  options: LeadArtifactRunOptions = {},
): Promise<{ businessDetail: LeadArtifactWorkerResult; competitiveReport: LeadArtifactWorkerResult }> {
  const settings = options.settings ?? await getSettings();
  const businessDetail = await queueLeadAiArtifact(leadId, "business_detail", { ...options, settings });
  const competitiveReport = await queueLeadAiArtifact(leadId, "competitive_report", { ...options, settings });
  return { businessDetail, competitiveReport };
}

export async function processNextLeadArtifactJob(signal?: AbortSignal): Promise<LeadArtifactWorkerResult> {
  throwIfWorkerAborted(signal);
  const settings = await getSettings();
  throwIfWorkerAborted(signal);
  if (!settings.ai_enabled) return { status: "disabled", reason: "AI is disabled in Settings." };

  const artifact = await leaseNextLeadAiArtifactJob(3);
  throwIfWorkerAborted(signal);
  if (!artifact) return { status: "idle", reason: "No lead intelligence jobs are queued." };

  return processLeadArtifact(artifact, {}, signal);
}

export async function processLeadArtifactJobById(
  artifactId: string,
  options: { actorUserId?: string | null; requestSource?: string | null; signal?: AbortSignal } = {},
): Promise<LeadArtifactWorkerResult> {
  throwIfWorkerAborted(options.signal);
  const settings = await getSettings();
  throwIfWorkerAborted(options.signal);
  if (!settings.ai_enabled) return { status: "disabled", reason: "AI is disabled in Settings." };

  const existing = await getLeadAiArtifactById(artifactId);
  throwIfWorkerAborted(options.signal);
  if (!existing) return { status: "error", artifactId, error: "Lead intelligence job not found." };
  if (existing.status === "complete") {
    const lead = await getLeadById(existing.lead_id);
    return {
      status: "complete",
      leadId: existing.lead_id,
      leadName: lead?.name ?? "Unknown lead",
      artifactType: existing.artifact_type,
      artifactId: existing.id,
    };
  }
  if (existing.status !== "queued") {
    return { status: "queued", leadId: existing.lead_id, artifactType: existing.artifact_type, artifactId: existing.id, skippedExisting: true };
  }

  const artifact = await leaseLeadAiArtifactJobById(artifactId, 3);
  throwIfWorkerAborted(options.signal);
  if (!artifact) return { status: "idle", reason: "Lead intelligence job is not ready." };
  return processLeadArtifact(artifact, options, options.signal);
}

async function processLeadArtifact(
  artifact: LeadAiArtifact,
  options: { actorUserId?: string | null; requestSource?: string | null } = {},
  signal?: AbortSignal,
): Promise<LeadArtifactWorkerResult> {
  throwIfWorkerAborted(signal);
  const lead = await getLeadById(artifact.lead_id);
  throwIfWorkerAborted(signal);
  if (!lead) {
    await markArtifactError(artifact, "Lead not found.", signal);
    return { status: "error", artifactId: artifact.id, leadId: artifact.lead_id, error: "Lead not found." };
  }

  const model = getConfiguredOpenAIModel();
  if (model !== OPENAI_LEAD_VERIFICATION_MODEL) {
    const error = "AI model guardrail rejected the configured model.";
    await markArtifactError(artifact, error, signal);
    return { status: "error", artifactId: artifact.id, leadId: lead.id, error };
  }

  try {
    throwIfWorkerAborted(signal);
    const apiKey = await getConfiguredOpenAiApiKey();
    throwIfWorkerAborted(signal);
    const result = await callOpenAILeadArtifact(lead, artifact.artifact_type, apiKey, { signal });
    throwIfWorkerAborted(signal);
    await markLeadAiArtifactComplete(artifact.id, {
      content_json: result.content as unknown as Record<string, unknown>,
      sources_json: extractArtifactSources(result.content),
      confidence: result.content.confidence,
      usage_input_tokens: result.inputTokens,
      usage_output_tokens: result.outputTokens,
      estimated_cost: result.estimatedCost,
    });
    throwIfWorkerAborted(signal);
    await runAiPostSuccessBookkeeping(
      {
        operation: "usage_event",
        leadId: lead.id,
        artifactId: artifact.id,
        artifactType: artifact.artifact_type,
      },
      () => logAiUsageEvent({
        lead_id: lead.id,
        model,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
        estimated_cost: result.estimatedCost,
        actor_user_id: options.actorUserId ?? artifact.requested_by_user_id,
        request_source: options.requestSource ?? artifact.request_source,
        metadata: {
          artifactId: artifact.id,
          artifactType: artifact.artifact_type,
          promptVersion: LEAD_INTELLIGENCE_PROMPT_VERSION,
          inputHash: result.inputHash,
        },
      }),
    );
    throwIfWorkerAborted(signal);
    await runAiPostSuccessBookkeeping(
      {
        operation: "completion_audit",
        leadId: lead.id,
        artifactId: artifact.id,
        artifactType: artifact.artifact_type,
      },
      () => createAuditLog("lead_ai_artifact_completed", "lead", lead.id, {
        artifactId: artifact.id,
        artifactType: artifact.artifact_type,
      }),
    );
    throwIfWorkerAborted(signal);
    return {
      status: "complete",
      leadId: lead.id,
      leadName: lead.name ?? "Unknown lead",
      artifactType: artifact.artifact_type,
      artifactId: artifact.id,
    };
  } catch (error) {
    throwIfWorkerAborted(signal);
    const message = error instanceof Error ? error.message : "Lead intelligence generation failed.";
    const failureUsage = error instanceof OpenAIUsageError && error.stage === "artifact_final"
      ? {
          input_tokens: error.inputTokens,
          output_tokens: error.outputTokens,
          estimated_cost: error.estimatedCost,
        }
      : { input_tokens: 0, output_tokens: 0, estimated_cost: 0 };
    const retry = await markArtifactRetry(artifact, message, failureUsage, signal);
    throwIfWorkerAborted(signal);
    await runAiPostSuccessBookkeeping(
      {
        operation: "usage_event",
        leadId: lead.id,
        artifactId: artifact.id,
        artifactType: artifact.artifact_type,
      },
      () => logAiUsageEvent({
        lead_id: lead.id,
        model,
        success: false,
        input_tokens: failureUsage.input_tokens,
        output_tokens: failureUsage.output_tokens,
        estimated_cost: failureUsage.estimated_cost,
        actor_user_id: options.actorUserId ?? artifact.requested_by_user_id,
        request_source: options.requestSource ?? artifact.request_source,
        metadata: {
          artifactId: artifact.id,
          artifactType: artifact.artifact_type,
          error: message,
          parseErrorStage: error instanceof OpenAIResponseParseError ? error.stage : null,
        },
      }),
    );
    throwIfWorkerAborted(signal);
    if (retry.status === "complete") {
      return {
        status: "complete",
        artifactId: artifact.id,
        leadId: lead.id,
        leadName: lead.name ?? "Unknown lead",
        artifactType: artifact.artifact_type,
      };
    }
    if (retry.status !== "error") {
      return { status: "retrying", artifactId: artifact.id, leadId: lead.id, error: message, nextRetryAt: retry.nextRetryAt };
    }
    return { status: "error", artifactId: artifact.id, leadId: lead.id, error: message };
  }
}

async function markArtifactError(artifact: LeadAiArtifact, message: string, signal?: AbortSignal): Promise<void> {
  throwIfWorkerAborted(signal);
  await markLeadAiArtifactError(artifact.id, message);
  throwIfWorkerAborted(signal);
  await createAuditLog("lead_ai_artifact_failed", "lead", artifact.lead_id, {
    artifactId: artifact.id,
    artifactType: artifact.artifact_type,
    error: message,
  });
  throwIfWorkerAborted(signal);
}

async function markArtifactRetry(
  artifact: LeadAiArtifact,
  message: string,
  usage: { input_tokens: number; output_tokens: number; estimated_cost: number },
  signal?: AbortSignal,
): Promise<{ status: "queued" | "error" | "complete"; nextRetryAt: string | null }> {
  throwIfWorkerAborted(signal);
  const retry = await markLeadAiArtifactRetry(artifact.id, message, artifact.max_attempts, usage);
  throwIfWorkerAborted(signal);
  const auditAction = retry.status === "complete"
    ? "lead_ai_artifact_retry_ignored_completed"
    : retry.status === "error"
      ? "lead_ai_artifact_failed"
      : "lead_ai_artifact_retry_scheduled";
  await createAuditLog(auditAction, "lead", artifact.lead_id, {
    artifactId: artifact.id,
    artifactType: artifact.artifact_type,
    error: message,
    attemptCount: retry.attemptCount,
    maxAttempts: retry.maxAttempts,
    nextRetryAt: retry.nextRetryAt,
  });
  throwIfWorkerAborted(signal);
  return { status: retry.status, nextRetryAt: retry.nextRetryAt };
}

function isLeadEligibleForArtifact(lead: { is_excluded: boolean; status: string; business_status: string | null }): boolean {
  return !lead.is_excluded &&
    lead.status !== "closed_won" &&
    lead.status !== "closed_lost" &&
    lead.business_status !== "CLOSED_PERMANENTLY" &&
    lead.business_status !== "CLOSED_TEMPORARILY";
}
