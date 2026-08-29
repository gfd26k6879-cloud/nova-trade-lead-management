import { isProxy } from "node:util/types";

export type AgentDataClassification =
  | "public_business_facts"
  | "tenant_business_materials";

export interface AgentPromptDefinition {
  readonly id: string;
  readonly version: number;
  readonly instructions: string;
  readonly allowedTools: readonly string[];
  readonly allowedClassifications: readonly AgentDataClassification[];
}

export interface AgentPromptRegistry {
  get(id: string, version: number): AgentPromptDefinition | null;
}

export interface AgentProviderPolicy {
  readonly state: "disabled" | "fixture" | "implementation_only" | "active";
  readonly provider: string;
  readonly model: string;
  readonly allowedClassifications: readonly AgentDataClassification[];
  readonly allowedTools: readonly string[];
}

export interface AgentExecutionInput {
  readonly registry: AgentPromptRegistry;
  readonly prompt: { readonly id: string; readonly version: number };
  readonly provider: AgentProviderPolicy;
  readonly tenantContext: {
    readonly tenantId: string;
    readonly workspaceId: string | null;
    readonly correlationToken: string;
  };
  readonly requestedTools: readonly string[];
  readonly content: readonly {
    readonly tenantId: string;
    readonly classification: AgentDataClassification;
    readonly text: string;
  }[];
}

export type AgentPolicyResult =
  | {
    readonly allowed: false;
    readonly code:
      | "AI_PROVIDER_DISABLED"
      | "REJECTED_SCOPE_TENANT_MISMATCH"
      | "REJECTED_SECRET"
      | "REJECTED_INJECTION"
      | "REJECTED_LOG_REDACTION"
      | "REJECTED_MODEL_POLICY_GAP";
  }
  | {
    readonly allowed: true;
    readonly code: "OK_PROPOSAL";
    readonly envelope: {
      readonly promptId: string;
      readonly promptVersion: number;
      readonly instructions: string;
      readonly correlationToken: string;
      readonly tools: readonly string[];
      readonly input: readonly {
        readonly kind: "untrusted_data";
        readonly classification: AgentDataClassification;
        readonly text: string;
      }[];
    };
  };

export class AgentPolicyError extends Error {
  readonly code = "REJECTED_INJECTION" as const;

  constructor(message: string) {
    super(message);
    this.name = "AgentPolicyError";
  }
}

const INSTRUCTION_INJECTION_PATTERNS = [
  /ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions/i,
  /reveal\s+(?:the\s+)?system\s+prompt/i,
  /(?:system|developer)\s+message\s*:/i,
  /<\|(?:system|developer)\|>/i,
] as const;

const SECRET_PATTERNS = [
  /authorization\s*:\s*bearer\s+\S+/i,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:^|[^A-Za-z0-9])(?:[A-Za-z0-9]+_)*(?:password|passwd|api[_-]?key|secret|access[_-]?token|refresh[_-]?token|client[_-]?secret)\s*[:=]\s*\S+/i,
] as const;

const FIXTURE_PROVIDER_ID = "fixture";
const FIXTURE_MODEL_ID = "openai-responses-stub";
const OPAQUE_CORRELATION_TOKEN = /^corr-[A-Za-z0-9_-]{8,128}$/u;
const CANONICAL_SCOPE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

type TenantContextSnapshot = Readonly<{
  tenantId: unknown;
  workspaceId: unknown;
  correlationToken: unknown;
}>;

function snapshotTenantContext(value: unknown): TenantContextSnapshot | null {
  if (typeof value !== "object" || value === null || isProxy(value)) return null;

  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.length !== 3 || keys.some((key) =>
      typeof key !== "string" || !["tenantId", "workspaceId", "correlationToken"].includes(key)
    )) return null;

    const tenantId = descriptors.tenantId;
    const workspaceId = descriptors.workspaceId;
    const correlationToken = descriptors.correlationToken;
    if (!tenantId || !("value" in tenantId)
      || !workspaceId || !("value" in workspaceId)
      || !correlationToken || !("value" in correlationToken)) return null;

    return Object.freeze({
      tenantId: tenantId.value,
      workspaceId: workspaceId.value,
      correlationToken: correlationToken.value,
    });
  } catch {
    return null;
  }
}

function containsInstructionInjection(value: string): boolean {
  return INSTRUCTION_INJECTION_PATTERNS.some((pattern) => pattern.test(value));
}

function containsSecret(value: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

function registryKey(id: string, version: number): string {
  return `${id}@${version}`;
}

export function createPromptRegistry(definitions: readonly AgentPromptDefinition[]): AgentPromptRegistry {
  const prompts = new Map<string, AgentPromptDefinition>();

  for (const definition of definitions) {
    if (!definition.id.trim() || !Number.isSafeInteger(definition.version) || definition.version <= 0) {
      throw new Error("Invalid prompt definition: id and version are required");
    }
    const key = registryKey(definition.id, definition.version);
    if (prompts.has(key)) {
      throw new Error(`Duplicate prompt definition: ${key}`);
    }
    if (containsInstructionInjection(definition.instructions)) {
      throw new AgentPolicyError(`Prompt ${definition.id}@${definition.version} contains instruction injection`);
    }
    prompts.set(key, Object.freeze({
      ...definition,
      allowedTools: Object.freeze([...definition.allowedTools]),
      allowedClassifications: Object.freeze([...definition.allowedClassifications]),
    }));
  }

  return Object.freeze({
    get(id: string, version: number): AgentPromptDefinition | null {
      return prompts.get(registryKey(id, version)) ?? null;
    },
  });
}

export function prepareAgentExecution(input: AgentExecutionInput): AgentPolicyResult {
  if (input.provider.state === "disabled") {
    return { allowed: false, code: "AI_PROVIDER_DISABLED" };
  }

  if (input.provider.state !== "fixture") {
    return { allowed: false, code: "REJECTED_MODEL_POLICY_GAP" };
  }

  if (input.provider.provider !== FIXTURE_PROVIDER_ID || input.provider.model !== FIXTURE_MODEL_ID) {
    return { allowed: false, code: "REJECTED_MODEL_POLICY_GAP" };
  }

  const prompt = input.registry.get(input.prompt.id, input.prompt.version);
  if (!prompt) {
    return { allowed: false, code: "REJECTED_MODEL_POLICY_GAP" };
  }

  let tenantContextValue: unknown;
  try {
    tenantContextValue = input.tenantContext;
  } catch {
    return { allowed: false, code: "REJECTED_SCOPE_TENANT_MISMATCH" };
  }
  const tenantContext = snapshotTenantContext(tenantContextValue);
  if (!tenantContext) {
    return { allowed: false, code: "REJECTED_SCOPE_TENANT_MISMATCH" };
  }
  const { tenantId, workspaceId, correlationToken } = tenantContext;
  if (typeof tenantId !== "string"
    || !CANONICAL_SCOPE_UUID.test(tenantId)
    || (workspaceId !== null
      && (typeof workspaceId !== "string" || !CANONICAL_SCOPE_UUID.test(workspaceId)))) {
    return { allowed: false, code: "REJECTED_SCOPE_TENANT_MISMATCH" };
  }

  if (input.content.some((block) => block.tenantId !== tenantId)) {
    return { allowed: false, code: "REJECTED_SCOPE_TENANT_MISMATCH" };
  }

  if (input.content.some((block) => containsSecret(block.text))) {
    return { allowed: false, code: "REJECTED_SECRET" };
  }

  const rawScopeIdentifiers = [tenantId, workspaceId]
    .filter((value): value is string => Boolean(value));
  if (typeof correlationToken !== "string"
    || !OPAQUE_CORRELATION_TOKEN.test(correlationToken)
    || rawScopeIdentifiers.some((identifier) => correlationToken.includes(identifier))
    || input.content.some((block) => rawScopeIdentifiers.some((identifier) => block.text.includes(identifier)))) {
    return { allowed: false, code: "REJECTED_LOG_REDACTION" };
  }

  const promptClassifications = new Set(prompt.allowedClassifications);
  const providerClassifications = new Set(input.provider.allowedClassifications);
  if (input.content.some((block) =>
    !promptClassifications.has(block.classification) ||
    !providerClassifications.has(block.classification)
  )) {
    return { allowed: false, code: "REJECTED_MODEL_POLICY_GAP" };
  }

  const promptTools = new Set(prompt.allowedTools);
  const providerTools = new Set(input.provider.allowedTools);
  if (input.requestedTools.some((tool) => !promptTools.has(tool) || !providerTools.has(tool))) {
    return { allowed: false, code: "REJECTED_MODEL_POLICY_GAP" };
  }

  return {
    allowed: true,
    code: "OK_PROPOSAL",
    envelope: Object.freeze({
      promptId: prompt.id,
      promptVersion: prompt.version,
      instructions: prompt.instructions,
      correlationToken,
      tools: Object.freeze([...input.requestedTools]),
      input: Object.freeze(input.content.map((block) => Object.freeze({
        kind: "untrusted_data" as const,
        classification: block.classification,
        text: block.text,
      }))),
    }),
  };
}
