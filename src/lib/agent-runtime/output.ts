export type AgentProposalClaimKind = "fact" | "success" | "safety" | "regulatory";
export type AgentProposalSupport = "supported" | "unsupported";
export type AgentCitationStatus = "current" | "stale" | "conflicted";

export interface AgentProposalCitation {
  readonly locator: string;
  readonly status: AgentCitationStatus;
}

export interface AgentProposalClaim {
  readonly statement: string;
  readonly kind: AgentProposalClaimKind;
  readonly support: AgentProposalSupport;
  readonly citations: readonly AgentProposalCitation[];
}

export interface AgentProposal {
  readonly version: 1;
  readonly summary: string;
  readonly claims: readonly AgentProposalClaim[];
}

export interface AgentProposalOutputContext {
  readonly tenantId: string;
  readonly workspaceId: string | null;
}

export type AgentProposalOutputResult =
  | { readonly accepted: true; readonly code: "OK_PROPOSAL"; readonly proposal: AgentProposal }
  | {
    readonly accepted: false;
    readonly code:
      | "REVIEW_REQUIRED"
      | "REVIEW_MISSING_EVIDENCE"
      | "REVIEW_STALE_EVIDENCE"
      | "REVIEW_CONFLICT"
      | "REVIEW_MISLEADING_RISK"
      | "REJECTED_SECRET"
      | "REJECTED_OUTPUT_SCHEMA"
      | "REJECTED_LOG_REDACTION";
  };

type PlainRecord = Record<string, unknown>;

interface StructuralScan {
  invalid: boolean;
  secret: boolean;
  logUnsafe: boolean;
}

const SECRET_PATTERNS = [
  /authorization\s*:\s*bearer\s+\S+/i,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:^|[^A-Za-z0-9])(?:[A-Za-z0-9]+_)*(?:password|passwd|api[_-]?key|secret|access[_-]?token|refresh[_-]?token|client[_-]?secret)\s*[:=]\s*\S+/i,
] as const;

const SECRET_FIELD = /^(?:authorization|password|passwd|api[_-]?key|secret|access[_-]?token|refresh[_-]?token|client[_-]?secret)$/i;
const LOG_UNSAFE_FIELDS = new Set([
  "rawprompt",
  "rawoutput",
  "rawcustomerrow",
  "rawcustomerrows",
  "rawidentity",
  "rawidentities",
  "providerpayload",
  "providerrequest",
  "providerresponse",
  "tenantid",
  "workspaceid",
]);

const CLAIM_KINDS = new Set<AgentProposalClaimKind>(["fact", "success", "safety", "regulatory"]);
const SUPPORT_STATES = new Set<AgentProposalSupport>(["supported", "unsupported"]);
const CITATION_STATES = new Set<AgentCitationStatus>(["current", "stale", "conflicted"]);
const MISLEADING_KINDS = new Set<AgentProposalClaimKind>(["success", "safety", "regulatory"]);

function isPlainRecord(value: unknown): value is PlainRecord {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function normalizedFieldName(value: string): string {
  return value.replace(/[-_]/g, "").toLowerCase();
}

function containsSecret(value: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

function scanStructure(
  value: unknown,
  rawScopeIdentifiers: readonly string[],
  ancestors = new WeakSet<object>(),
): StructuralScan {
  const result: StructuralScan = { invalid: false, secret: false, logUnsafe: false };

  if (typeof value === "string") {
    result.secret = containsSecret(value);
    result.logUnsafe = rawScopeIdentifiers.some((identifier) => value.includes(identifier));
    return result;
  }
  if (value === null || typeof value === "boolean") {
    return result;
  }
  if (typeof value === "number") {
    result.invalid = !Number.isFinite(value);
    return result;
  }
  if (typeof value !== "object") {
    result.invalid = true;
    return result;
  }
  if (ancestors.has(value)) {
    result.invalid = true;
    return result;
  }
  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      const ownKeys = Reflect.ownKeys(value);
      if (ownKeys.some((key) => typeof key !== "string" || (key !== "length" && !/^(?:0|[1-9]\d*)$/.test(key)))) {
        result.invalid = true;
        return result;
      }
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !("value" in descriptor)) {
          result.invalid = true;
          return result;
        }
        const nested = scanStructure(descriptor.value, rawScopeIdentifiers, ancestors);
        result.invalid ||= nested.invalid;
        result.secret ||= nested.secret;
        result.logUnsafe ||= nested.logUnsafe;
      }
      return result;
    }
    if (!isPlainRecord(value)) {
      result.invalid = true;
      return result;
    }

    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") {
        result.invalid = true;
        return result;
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        result.invalid = true;
        return result;
      }
      result.secret ||= SECRET_FIELD.test(key);
      result.logUnsafe ||= LOG_UNSAFE_FIELDS.has(normalizedFieldName(key));
      const nested = scanStructure(descriptor.value, rawScopeIdentifiers, ancestors);
      result.invalid ||= nested.invalid;
      result.secret ||= nested.secret;
      result.logUnsafe ||= nested.logUnsafe;
    }
    return result;
  } catch {
    result.invalid = true;
    return result;
  } finally {
    ancestors.delete(value);
  }
}

function hasOnlyKeys(value: PlainRecord, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function hasExactKeys(value: PlainRecord, expected: readonly string[]): boolean {
  return Object.keys(value).length === expected.length && hasOnlyKeys(value, expected);
}

function reject(code: Extract<AgentProposalOutputResult, { accepted: false }>["code"]): AgentProposalOutputResult {
  return Object.freeze({ accepted: false, code });
}

export function validateAgentProposalOutput(
  output: unknown,
  context: AgentProposalOutputContext,
): AgentProposalOutputResult {
  const rawScopeIdentifiers = [context.tenantId, context.workspaceId]
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  const scan = scanStructure(output, rawScopeIdentifiers);

  if (scan.invalid) return reject("REJECTED_OUTPUT_SCHEMA");
  if (scan.secret) return reject("REJECTED_SECRET");
  if (scan.logUnsafe) return reject("REJECTED_LOG_REDACTION");
  if (!isPlainRecord(output) || !hasExactKeys(output, ["version", "summary", "claims"])) {
    return reject("REJECTED_OUTPUT_SCHEMA");
  }
  if (output.version !== 1 || typeof output.summary !== "string" || !output.summary.trim()) {
    return reject("REJECTED_OUTPUT_SCHEMA");
  }
  if (!Array.isArray(output.claims) || output.claims.length === 0) {
    return reject("REJECTED_OUTPUT_SCHEMA");
  }

  const claims: AgentProposalClaim[] = [];
  let hasStaleEvidence = false;
  let needsReview = false;
  let hasMisleadingRisk = false;

  for (const rawClaim of output.claims) {
    if (!isPlainRecord(rawClaim) || !hasOnlyKeys(rawClaim, ["statement", "kind", "support", "citations"])) {
      return reject("REJECTED_OUTPUT_SCHEMA");
    }
    if (!("citations" in rawClaim)) return reject("REVIEW_MISSING_EVIDENCE");
    if (!hasExactKeys(rawClaim, ["statement", "kind", "support", "citations"])
      || typeof rawClaim.statement !== "string"
      || !rawClaim.statement.trim()
      || typeof rawClaim.kind !== "string"
      || !CLAIM_KINDS.has(rawClaim.kind as AgentProposalClaimKind)
      || typeof rawClaim.support !== "string"
      || !SUPPORT_STATES.has(rawClaim.support as AgentProposalSupport)) {
      return reject("REJECTED_OUTPUT_SCHEMA");
    }
    if (!Array.isArray(rawClaim.citations) || rawClaim.citations.length === 0) {
      return reject("REVIEW_MISSING_EVIDENCE");
    }

    const citations: AgentProposalCitation[] = [];
    for (const rawCitation of rawClaim.citations) {
      if (isPlainRecord(rawCitation) && !hasOnlyKeys(rawCitation, ["locator", "status"])) {
        return reject("REJECTED_OUTPUT_SCHEMA");
      }
      if (!isPlainRecord(rawCitation)
        || !hasExactKeys(rawCitation, ["locator", "status"])
        || typeof rawCitation.locator !== "string"
        || !rawCitation.locator.trim()
        || typeof rawCitation.status !== "string"
        || !CITATION_STATES.has(rawCitation.status as AgentCitationStatus)) {
        return reject("REVIEW_MISSING_EVIDENCE");
      }
      const status = rawCitation.status as AgentCitationStatus;
      if (status === "conflicted") return reject("REVIEW_CONFLICT");
      hasStaleEvidence ||= status === "stale";
      citations.push(Object.freeze({ locator: rawCitation.locator, status }));
    }

    const kind = rawClaim.kind as AgentProposalClaimKind;
    const support = rawClaim.support as AgentProposalSupport;
    hasMisleadingRisk ||= support === "unsupported" && MISLEADING_KINDS.has(kind);
    needsReview ||= support === "unsupported";
    claims.push(Object.freeze({
      statement: rawClaim.statement,
      kind,
      support,
      citations: Object.freeze(citations),
    }));
  }

  if (hasStaleEvidence) return reject("REVIEW_STALE_EVIDENCE");
  if (hasMisleadingRisk) return reject("REVIEW_MISLEADING_RISK");
  if (needsReview) return reject("REVIEW_REQUIRED");

  return Object.freeze({
    accepted: true,
    code: "OK_PROPOSAL",
    proposal: Object.freeze({
      version: 1,
      summary: output.summary,
      claims: Object.freeze(claims),
    }),
  });
}
