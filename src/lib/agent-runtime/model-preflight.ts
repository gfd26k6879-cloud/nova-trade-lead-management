import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

export type ModelDataClassification =
  | "public_business_facts"
  | "tenant_business_materials"
  | "unpublished_product_technical_data"
  | "customer_lists_account_data"
  | "business_contact_role_data"
  | "personal_sensitive_data"
  | "credentials_secrets"
  | "auth_security_data"
  | "malware_quarantined_content"
  | "audit_operational_metadata"
  | "prompts_model_outputs";

export type ModelAccessPreflightCode =
  | "OK_PROPOSAL"
  | "AI_PROVIDER_DISABLED"
  | "REJECTED_SCOPE_TENANT_MISMATCH"
  | "REJECTED_SECRET"
  | "REJECTED_PERSONAL_DEFAULT"
  | "REJECTED_QUARANTINE"
  | "REJECTED_INJECTION"
  | "REJECTED_LOG_REDACTION"
  | "REJECTED_COST_CAP"
  | "REJECTED_MODEL_DISALLOWED"
  | "REJECTED_MODEL_VERSION_DRIFT"
  | "REJECTED_MODEL_POLICY_GAP"
  | "RUN_CANCELLED"
  | "RUN_REVALIDATE_REQUIRED";

export type ModelAccessPreflightResult =
  | Readonly<{ allowed: false; code: Exclude<ModelAccessPreflightCode, "OK_PROPOSAL"> }>
  | Readonly<{
    allowed: true;
    code: "OK_PROPOSAL";
    envelope: Readonly<{
      provider: "fixture";
      model: "openai-responses-stub";
      policy: Readonly<{ policyKey: string; version: number; policySha256: string }>;
      prompt: Readonly<{
        kind: "trusted_instructions";
        promptKey: string;
        version: number;
        instructions: string;
      }>;
      correlationToken: string;
      executionBindingSha256: string;
      tools: readonly string[];
      requestedOutputTokens: number;
      input: readonly Readonly<{
        kind: "untrusted_data";
        sourceRef: string;
        classification: ModelDataClassification;
        text: string;
      }>[];
    }>;
  }>;

type PlainRecord = Record<string, unknown>;
type Scope = Readonly<{ tenantId: string; workspaceId: string | null }>;

const OUTER_FIELDS = ["version", "run", "prompt", "modelPolicy", "request"] as const;
const RUN_FIELDS = [
  "runId", "tenantId", "workspaceId", "inputHash", "status", "cancelRequestedAt",
  "promptKey", "promptVersion", "policyKey", "policyVersion", "budgetUsd", "usageCostUsd",
] as const;
const PROMPT_FIELDS = [
  "promptKey", "version", "instructionsRef", "instructions", "instructionsSha256",
  "allowedTools", "allowedClassifications",
] as const;
const POLICY_FIELDS = [
  "policyKey", "version", "policySha256", "state", "provider", "model", "allowedTools",
  "allowedClassifications", "maxInputBytes", "maxOutputTokens", "maxRequestCostUsd",
] as const;
const REQUEST_FIELDS = [
  "runId", "tenantId", "workspaceId", "inputHash", "correlationToken", "requestedTools",
  "requestedOutputTokens", "estimatedCostUsd", "tenantRemainingBudgetUsd", "content",
] as const;
const CONTENT_FIELDS = [
  "runId", "tenantId", "workspaceId", "sourceRef", "classification", "text",
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/u;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const HEX_HASH = /^[a-f0-9]{64}$/u;
const CORRELATION = /^corr-[A-Za-z0-9_-]{8,128}$/u;
const MAX_CONTENT_BLOCKS = 64;
const MAX_TOOL_COUNT = 32;
const MAX_CONTENT_BLOCK_CHARS = 100_000;
const MAX_PROMPT_CHARS = 20_000;
const MAX_INPUT_BYTES = 1_048_576;
const MAX_OUTPUT_TOKENS = 32_768;

const CLASSIFICATIONS = new Set<ModelDataClassification>([
  "public_business_facts", "tenant_business_materials", "unpublished_product_technical_data",
  "customer_lists_account_data", "business_contact_role_data", "personal_sensitive_data",
  "credentials_secrets", "auth_security_data", "malware_quarantined_content",
  "audit_operational_metadata", "prompts_model_outputs",
]);
const RUN_STATUSES = new Set(["queued", "running", "retry_wait", "complete", "failed", "dead_letter", "canceled"]);
const POLICY_STATES = new Set(["disabled", "fixture", "implementation_only", "active"]);
const SECRET = /(?:authorization\s*:\s*bearer\s+\S+|\bsk-[A-Za-z0-9_-]{20,}\b|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:^|[^A-Za-z0-9])["']?(?:[A-Za-z0-9]+_)*(?:password|passwd|api[_ -]?key|secret|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret)["']?\s*[:=]\s*["']?\S+)/iu;
const INJECTION = [
  /ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions/iu,
  /reveal\s+(?:the\s+)?system\s+prompt/iu,
  /(?:system|developer)\s+message\s*:/iu,
  /<\|(?:system|developer)\|>/iu,
] as const;

function deny(code: Exclude<ModelAccessPreflightCode, "OK_PROPOSAL">): ModelAccessPreflightResult {
  return Object.freeze({ allowed: false, code });
}

function exactRecord(value: unknown, fields: readonly string[]): PlainRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value) || isProxy(value)) return null;
  try {
    if (Object.getPrototypeOf(value) !== Object.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.length !== fields.length
      || keys.some((key) => typeof key !== "string" || !fields.includes(key))) return null;
    const result: PlainRecord = {};
    for (const field of fields) {
      const descriptor = descriptors[field];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return null;
      result[field] = descriptor.value;
    }
    return result;
  } catch {
    return null;
  }
}

function exactArray(value: unknown, maximum: number): readonly unknown[] | null {
  if (!Array.isArray(value) || isProxy(value)) return null;
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
    const length = descriptors.length?.value;
    if (!Number.isSafeInteger(length) || length < 0 || length > maximum
      || Reflect.ownKeys(descriptors).length !== length + 1) return null;
    const result: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return null;
      result.push(descriptor.value);
    }
    return result;
  } catch {
    return null;
  }
}

function validUnicode(value: string, controlsAllowed: boolean): boolean {
  if (!controlsAllowed && /[\u0000-\u001f\u007f-\u009f]/u.test(value)) return false;
  if (controlsAllowed && /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      if (index + 1 >= value.length) return false;
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

function prose(value: unknown, maximum: number): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= maximum
    && validUnicode(value, true) ? value : null;
}

function reference(value: unknown): string | null {
  return typeof value === "string" && REFERENCE.test(value) ? value : null;
}

function version(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 1_000_000
    ? value : null;
}

function boundedInteger(value: unknown, maximum: number): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= maximum
    ? value : null;
}

function usdMicros(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  const micros = Math.round(value * 1_000_000);
  return Number.isSafeInteger(micros) && Math.abs(micros / 1_000_000 - value) < Number.EPSILON
    ? micros : null;
}

function scope(record: PlainRecord): Scope | null {
  const tenantId = typeof record.tenantId === "string" && UUID.test(record.tenantId) ? record.tenantId : null;
  const workspaceId = record.workspaceId === null
    ? null
    : typeof record.workspaceId === "string" && UUID.test(record.workspaceId) ? record.workspaceId : undefined;
  return tenantId && workspaceId !== undefined ? Object.freeze({ tenantId, workspaceId }) : null;
}

function sameScope(left: Scope, right: Scope): boolean {
  return left.tenantId === right.tenantId && left.workspaceId === right.workspaceId;
}

function stringSet(value: unknown, maximum: number): readonly string[] | null {
  const raw = exactArray(value, maximum);
  if (!raw) return null;
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const parsed = reference(item);
    if (!parsed || seen.has(parsed)) return null;
    seen.add(parsed);
    result.push(parsed);
  }
  return Object.freeze(result.sort());
}

function classificationSet(value: unknown): readonly ModelDataClassification[] | null {
  const raw = exactArray(value, CLASSIFICATIONS.size);
  if (!raw) return null;
  const result: ModelDataClassification[] = [];
  const seen = new Set<ModelDataClassification>();
  for (const item of raw) {
    if (typeof item !== "string" || !CLASSIFICATIONS.has(item as ModelDataClassification)
      || seen.has(item as ModelDataClassification)) return null;
    seen.add(item as ModelDataClassification);
    result.push(item as ModelDataClassification);
  }
  return Object.freeze(result.sort());
}

function exactTimestampOrNull(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 40) return undefined;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value ? value : undefined;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function promptAuthoritySha256(input: Readonly<{
  promptKey: string;
  version: number;
  instructionsRef: string;
  instructions: string;
  allowedTools: readonly string[];
  allowedClassifications: readonly ModelDataClassification[];
}>): string {
  return sha256(JSON.stringify(input));
}

function policyAuthoritySha256(input: Readonly<{
  policyKey: string;
  version: number;
  state: string;
  provider: string;
  model: string;
  allowedTools: readonly string[];
  allowedClassifications: readonly ModelDataClassification[];
  maxInputBytes: number;
  maxOutputTokens: number;
  maxRequestCostUsdMicros: number;
}>): string {
  return sha256(JSON.stringify(input));
}

function containsIdentifier(value: string, identifiers: readonly string[]): boolean {
  const folded = securityFold(value).toLowerCase();
  return identifiers.some((identifier) => {
    const canonical = identifier.toLowerCase();
    return folded.includes(canonical)
      || (UUID.test(canonical) && folded.includes(canonical.replaceAll("-", "")));
  });
}

function securityFold(value: string): string {
  return value.normalize("NFKC").replace(/\p{Cf}/gu, "");
}

export function evaluateModelAccessPreflight(value: unknown): ModelAccessPreflightResult {
  try {
    const outer = exactRecord(value, OUTER_FIELDS);
    if (!outer || outer.version !== 1) return deny("REJECTED_MODEL_POLICY_GAP");
    const run = exactRecord(outer.run, RUN_FIELDS);
    const prompt = exactRecord(outer.prompt, PROMPT_FIELDS);
    const policy = exactRecord(outer.modelPolicy, POLICY_FIELDS);
    const request = exactRecord(outer.request, REQUEST_FIELDS);
    if (!run || !prompt || !policy || !request) return deny("REJECTED_MODEL_POLICY_GAP");

    const runScope = scope(run);
    const requestScope = scope(request);
    if (!runScope || !requestScope || !sameScope(runScope, requestScope)) {
      return deny("REJECTED_SCOPE_TENANT_MISMATCH");
    }

    const runId = reference(run.runId);
    const inputHash = typeof run.inputHash === "string" && HASH.test(run.inputHash) ? run.inputHash : null;
    const promptKey = reference(run.promptKey);
    const promptVersion = version(run.promptVersion);
    const policyKey = reference(run.policyKey);
    const policyVersion = version(run.policyVersion);
    const cancelRequestedAt = exactTimestampOrNull(run.cancelRequestedAt);
    const runBudget = usdMicros(run.budgetUsd);
    const runUsage = usdMicros(run.usageCostUsd);
    if (!runId || !inputHash || !promptKey || promptVersion === null || !policyKey || policyVersion === null
      || typeof run.status !== "string" || !RUN_STATUSES.has(run.status) || cancelRequestedAt === undefined
      || runBudget === null || runUsage === null || runUsage > runBudget) {
      return deny("REJECTED_MODEL_POLICY_GAP");
    }
    if (cancelRequestedAt !== null || run.status === "canceled") return deny("RUN_CANCELLED");
    if (run.status !== "running") return deny("RUN_REVALIDATE_REQUIRED");

    if (request.runId !== runId || request.inputHash !== inputHash) return deny("RUN_REVALIDATE_REQUIRED");
    const correlationToken = typeof request.correlationToken === "string" && CORRELATION.test(request.correlationToken)
      ? request.correlationToken : null;
    if (!correlationToken) return deny("REJECTED_LOG_REDACTION");
    const rawIdentifiers = [runScope.tenantId, runScope.workspaceId, runId]
      .filter((item): item is string => item !== null);
    if (containsIdentifier(correlationToken, rawIdentifiers)) {
      return deny("REJECTED_LOG_REDACTION");
    }

    const registryPromptKey = reference(prompt.promptKey);
    const registryPromptVersion = version(prompt.version);
    const instructionsRef = reference(prompt.instructionsRef);
    const instructions = prose(prompt.instructions, MAX_PROMPT_CHARS);
    const instructionsSha256 = typeof prompt.instructionsSha256 === "string" && HEX_HASH.test(prompt.instructionsSha256)
      ? prompt.instructionsSha256 : null;
    const promptTools = stringSet(prompt.allowedTools, MAX_TOOL_COUNT);
    const promptClassifications = classificationSet(prompt.allowedClassifications);
    if (!registryPromptKey || registryPromptVersion === null || !instructionsRef || !instructions
      || !instructionsSha256 || !promptTools || !promptClassifications) return deny("REJECTED_MODEL_POLICY_GAP");
    if (registryPromptKey !== promptKey || registryPromptVersion !== promptVersion) {
      return deny("REJECTED_MODEL_VERSION_DRIFT");
    }
    if (containsIdentifier(registryPromptKey, rawIdentifiers)) return deny("REJECTED_LOG_REDACTION");
    if (instructionsSha256 !== promptAuthoritySha256({
      promptKey: registryPromptKey,
      version: registryPromptVersion,
      instructionsRef,
      instructions,
      allowedTools: promptTools,
      allowedClassifications: promptClassifications,
    })) return deny("REJECTED_MODEL_VERSION_DRIFT");
    if (INJECTION.some((pattern) => pattern.test(securityFold(instructions)))) return deny("REJECTED_INJECTION");
    if (containsIdentifier(instructions, rawIdentifiers)) {
      return deny("REJECTED_LOG_REDACTION");
    }

    const registryPolicyKey = reference(policy.policyKey);
    const registryPolicyVersion = version(policy.version);
    const policySha256 = typeof policy.policySha256 === "string" && HEX_HASH.test(policy.policySha256)
      ? policy.policySha256 : null;
    const policyTools = stringSet(policy.allowedTools, MAX_TOOL_COUNT);
    const policyClassifications = classificationSet(policy.allowedClassifications);
    const maxInputBytes = boundedInteger(policy.maxInputBytes, MAX_INPUT_BYTES);
    const maxOutputTokens = boundedInteger(policy.maxOutputTokens, MAX_OUTPUT_TOKENS);
    const maxRequestCost = usdMicros(policy.maxRequestCostUsd);
    if (!registryPolicyKey || registryPolicyVersion === null || !policySha256 || !policyTools
      || !policyClassifications || !maxInputBytes || !maxOutputTokens || maxRequestCost === null
      || typeof policy.state !== "string" || !POLICY_STATES.has(policy.state)
      || !reference(policy.provider) || !reference(policy.model)) return deny("REJECTED_MODEL_POLICY_GAP");
    if (registryPolicyKey !== policyKey || registryPolicyVersion !== policyVersion) {
      return deny("REJECTED_MODEL_VERSION_DRIFT");
    }
    if (containsIdentifier(registryPolicyKey, rawIdentifiers)) return deny("REJECTED_LOG_REDACTION");
    if (policySha256 !== policyAuthoritySha256({
      policyKey: registryPolicyKey,
      version: registryPolicyVersion,
      state: policy.state as string,
      provider: policy.provider as string,
      model: policy.model as string,
      allowedTools: policyTools,
      allowedClassifications: policyClassifications,
      maxInputBytes,
      maxOutputTokens,
      maxRequestCostUsdMicros: maxRequestCost,
    })) return deny("REJECTED_MODEL_VERSION_DRIFT");
    if (policy.state === "disabled") return deny("AI_PROVIDER_DISABLED");
    if (policy.state !== "fixture") return deny("REJECTED_MODEL_POLICY_GAP");
    if (policy.provider !== "fixture" || policy.model !== "openai-responses-stub") {
      return deny("REJECTED_MODEL_DISALLOWED");
    }

    const requestedTools = stringSet(request.requestedTools, MAX_TOOL_COUNT);
    const requestedOutputTokens = boundedInteger(request.requestedOutputTokens, MAX_OUTPUT_TOKENS);
    const estimatedCost = usdMicros(request.estimatedCostUsd);
    const tenantRemaining = usdMicros(request.tenantRemainingBudgetUsd);
    const rawContent = exactArray(request.content, MAX_CONTENT_BLOCKS);
    if (!requestedTools || requestedOutputTokens === null || estimatedCost === null
      || tenantRemaining === null || !rawContent) return deny("REJECTED_MODEL_POLICY_GAP");
    if (requestedTools.some((tool) => containsIdentifier(tool, rawIdentifiers))) {
      return deny("REJECTED_LOG_REDACTION");
    }
    if (requestedOutputTokens > maxOutputTokens) return deny("REJECTED_MODEL_POLICY_GAP");
    if (estimatedCost > maxRequestCost || estimatedCost > tenantRemaining
      || estimatedCost > runBudget - runUsage) return deny("REJECTED_COST_CAP");

    const promptToolSet = new Set(promptTools);
    const policyToolSet = new Set(policyTools);
    if (requestedTools.some((tool) => !promptToolSet.has(tool) || !policyToolSet.has(tool))) {
      return deny("REJECTED_MODEL_DISALLOWED");
    }

    const promptClassificationSet = new Set(promptClassifications);
    const policyClassificationSet = new Set(policyClassifications);
    const providerInput: Array<Readonly<{
      kind: "untrusted_data";
      sourceRef: string;
      classification: ModelDataClassification;
      text: string;
    }>> = [];
    const canonicalInputBlocks: Array<Readonly<{
      runId: string;
      tenantId: string;
      workspaceId: string | null;
      sourceRef: string;
      classification: ModelDataClassification;
      text: string;
    }>> = [];
    let inputBytes = 0;
    for (const rawBlock of rawContent) {
      const block = exactRecord(rawBlock, CONTENT_FIELDS);
      if (!block) return deny("REJECTED_MODEL_POLICY_GAP");
      const blockScope = scope(block);
      if (!blockScope || !sameScope(runScope, blockScope)) return deny("REJECTED_SCOPE_TENANT_MISMATCH");
      if (block.runId !== runId) return deny("RUN_REVALIDATE_REQUIRED");
      const sourceRef = reference(block.sourceRef);
      const classification = typeof block.classification === "string"
        && CLASSIFICATIONS.has(block.classification as ModelDataClassification)
        ? block.classification as ModelDataClassification : null;
      const text = prose(block.text, MAX_CONTENT_BLOCK_CHARS);
      if (!sourceRef || !classification || !text) return deny("REJECTED_MODEL_POLICY_GAP");
      if (classification === "credentials_secrets" || classification === "auth_security_data") {
        return deny("REJECTED_SECRET");
      }
      if (classification === "malware_quarantined_content") return deny("REJECTED_QUARANTINE");
      if (classification === "personal_sensitive_data") return deny("REJECTED_PERSONAL_DEFAULT");
      if (!promptClassificationSet.has(classification) || !policyClassificationSet.has(classification)) {
        return deny("REJECTED_MODEL_POLICY_GAP");
      }
      if (SECRET.test(securityFold(text))) return deny("REJECTED_SECRET");
      if (containsIdentifier(text, rawIdentifiers) || containsIdentifier(sourceRef, rawIdentifiers)) {
        return deny("REJECTED_LOG_REDACTION");
      }
      inputBytes += new TextEncoder().encode(text).byteLength;
      if (inputBytes > maxInputBytes) return deny("REJECTED_MODEL_POLICY_GAP");
      providerInput.push(Object.freeze({ kind: "untrusted_data", sourceRef, classification, text }));
      canonicalInputBlocks.push({
        runId,
        tenantId: blockScope.tenantId,
        workspaceId: blockScope.workspaceId,
        sourceRef,
        classification,
        text,
      });
    }

    const canonicalInputHash = `sha256:${sha256(JSON.stringify({
      runId,
      tenantId: requestScope.tenantId,
      workspaceId: requestScope.workspaceId,
      content: canonicalInputBlocks,
    }))}`;
    if (inputHash !== canonicalInputHash || request.inputHash !== canonicalInputHash) {
      return deny("RUN_REVALIDATE_REQUIRED");
    }

    const executionBindingSha256 = sha256(JSON.stringify({
      runId,
      tenantId: runScope.tenantId,
      workspaceId: runScope.workspaceId,
      inputHash,
      promptKey,
      promptVersion,
      promptAuthoritySha256: instructionsSha256,
      policyKey,
      policyVersion,
      policySha256,
      provider: policy.provider,
      model: policy.model,
      correlationToken,
      requestedTools,
      requestedOutputTokens,
      estimatedCostUsdMicros: estimatedCost,
      tenantRemainingBudgetUsdMicros: tenantRemaining,
      runBudgetUsdMicros: runBudget,
      runUsageCostUsdMicros: runUsage,
    }));
    const envelope = Object.freeze({
      provider: "fixture" as const,
      model: "openai-responses-stub" as const,
      policy: Object.freeze({ policyKey, version: policyVersion, policySha256 }),
      prompt: Object.freeze({
        kind: "trusted_instructions" as const,
        promptKey,
        version: promptVersion,
        instructions,
      }),
      correlationToken,
      executionBindingSha256,
      tools: Object.freeze([...requestedTools]),
      requestedOutputTokens,
      input: Object.freeze(providerInput),
    });
    return Object.freeze({ allowed: true, code: "OK_PROPOSAL", envelope });
  } catch {
    return deny("REJECTED_MODEL_POLICY_GAP");
  }
}
