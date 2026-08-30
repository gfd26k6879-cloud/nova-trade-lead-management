import "server-only";

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import {
  AgentContextBuilderError,
  buildAgentContext,
  type AgentContextBuildResult,
} from "@/lib/agent-runtime/context-builder";
import {
  evaluateModelAccessPreflight,
  type ModelAccessPreflightCode,
} from "@/lib/agent-runtime/model-preflight";
import {
  validateAgentProposalOutput,
  type AgentProposal,
  type AgentProposalOutputResult,
} from "@/lib/agent-runtime/output";

const INPUT_FIELDS = ["version", "executionMode", "deadlineAt", "context", "modelAccess"] as const;
const OPTIONS_FIELDS = ["signal"] as const;
const CONTEXT_FIELDS = [
  "version", "tenantId", "workspaceId", "maxEvidenceCount", "maxUtf8Bytes", "evidence",
] as const;
const MODEL_ACCESS_FIELDS = ["version", "run", "prompt", "modelPolicy", "request"] as const;
const MODEL_REQUEST_FIELDS = [
  "runId", "tenantId", "workspaceId", "inputHash", "correlationToken", "requestedTools",
  "requestedOutputTokens", "estimatedCostUsd", "tenantRemainingBudgetUsd", "content",
] as const;
const RESPONSE_FIELDS = ["version", "boundaryBindingSha256", "output", "usage"] as const;
const USAGE_FIELDS = ["inputTokens", "outputTokens", "totalTokens", "costUsd"] as const;
const MAX_DEADLINE_MS = 300_000;
const MAX_PROVIDER_TOKENS = 10_000_000;
const MAX_OUTPUT_DEPTH = 12;
const MAX_OUTPUT_NODES = 10_000;
const MAX_OUTPUT_KEYS = 1_000;
const MAX_OUTPUT_ARRAY = 10_000;
const MAX_OUTPUT_STRING = 1_000_000;
const ABORTED_GETTER = Object.getOwnPropertyDescriptor(AbortSignal.prototype, "aborted")?.get;

type PlainRecord = Record<string, unknown>;
type OutputFailureCode = Exclude<AgentProposalOutputResult["code"], "OK_PROPOSAL">;

export interface AgentFixtureModelRequest {
  readonly version: 1;
  readonly provider: "fixture";
  readonly model: "openai-responses-stub";
  readonly boundaryBindingSha256: string;
  readonly deadlineAt: string;
  readonly requestedOutputTokens: number;
  readonly systemPolicy: Readonly<{
    kind: "trusted_system_policy";
    text: string;
  }>;
  readonly prompt: Readonly<{
    kind: "trusted_instructions";
    promptKey: string;
    version: number;
    instructions: string;
  }>;
  readonly context: Readonly<{
    kind: "untrusted_data";
    inputSha256: `sha256:${string}`;
    outputSha256: `sha256:${string}`;
    serialized: string;
  }>;
  readonly tools: readonly [];
  readonly signal: AbortSignal;
}

export interface AgentFixtureModelProvider {
  readonly kind: "fixture";
  readonly execute: (request: AgentFixtureModelRequest) => Promise<unknown>;
}

export interface AgentFixtureExecutionBoundaryOptions {
  readonly provider: AgentFixtureModelProvider;
  readonly clock: () => number;
  readonly maxDeadlineMs: number;
}

export interface AgentFixtureExecutionBoundary {
  readonly execute: (input: unknown, options?: unknown) => Promise<AgentFixtureExecutionResult>;
}

export interface AgentFixtureExecutionUsage {
  readonly providerCalls: 0 | 1;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly costUsd: number;
}

export type AgentFixtureExecutionFailureCode =
  | Exclude<ModelAccessPreflightCode, "OK_PROPOSAL">
  | OutputFailureCode
  | "PROVIDER_FAILED"
  | "PROVIDER_RESPONSE_INVALID"
  | "RUN_DEADLINE_EXCEEDED";

export type AgentFixtureExecutionResult =
  | Readonly<{
    ok: true;
    status: "complete";
    code: "OK_PROPOSAL";
    provider: "fixture";
    model: "openai-responses-stub";
    boundaryBindingSha256: string;
    context: Readonly<{
      inputSha256: `sha256:${string}`;
      outputSha256: `sha256:${string}`;
      selectedEvidenceCount: number;
      droppedEvidenceCount: number;
      truncated: boolean;
    }>;
    proposal: AgentProposal;
    usage: AgentFixtureExecutionUsage;
  }>
  | Readonly<{
    ok: false;
    status: "blocked" | "cancelled";
    code: AgentFixtureExecutionFailureCode;
    provider: "fixture";
    model: "openai-responses-stub";
    usage: AgentFixtureExecutionUsage;
  }>;

interface ParsedProviderResponse {
  readonly output: unknown;
  readonly usage: AgentFixtureExecutionUsage;
}

interface CloneState {
  nodes: number;
  readonly ancestors: WeakSet<object>;
}

type CloneResult = Readonly<{ ok: true; value: unknown }> | Readonly<{ ok: false }>;

function exactRecord(value: unknown, fields: readonly string[]): PlainRecord | null {
  if (typeof value !== "object" || value === null || isProxy(value) || Array.isArray(value)) return null;
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

function safeAbortSignal(value: unknown): AbortSignal | null {
  if (typeof value !== "object" || value === null || isProxy(value)) return null;
  try {
    if (Object.getPrototypeOf(value) !== AbortSignal.prototype || !ABORTED_GETTER
      || Reflect.ownKeys(Object.getOwnPropertyDescriptors(value)).some((key) => typeof key === "string")) {
      return null;
    }
    ABORTED_GETTER.call(value);
    return value as AbortSignal;
  } catch {
    return null;
  }
}

function parseSignal(value: unknown): AbortSignal | null | undefined {
  if (value === undefined) return undefined;
  const options = exactRecord(value, OPTIONS_FIELDS);
  return options ? safeAbortSignal(options.signal) : null;
}

function isAborted(signal: AbortSignal | undefined): boolean {
  if (!signal || !ABORTED_GETTER) return false;
  try {
    return ABORTED_GETTER.call(signal) === true;
  } catch {
    return true;
  }
}

function canonicalTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 40) return null;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value ? value : null;
}

function usdMicros(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  const micros = Math.round(value * 1_000_000);
  return Number.isSafeInteger(micros) && Math.abs(micros / 1_000_000 - value) < Number.EPSILON
    ? micros : null;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function emptyUsage(providerCalls: 0 | 1): AgentFixtureExecutionUsage {
  return Object.freeze({ providerCalls, inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 });
}

function failure(
  code: AgentFixtureExecutionFailureCode,
  providerCalls: 0 | 1,
  usage: AgentFixtureExecutionUsage = emptyUsage(providerCalls),
): AgentFixtureExecutionResult {
  const status = code === "RUN_CANCELLED" || code === "RUN_DEADLINE_EXCEEDED"
    ? "cancelled" as const : "blocked" as const;
  return Object.freeze({
    ok: false as const,
    status,
    code,
    provider: "fixture" as const,
    model: "openai-responses-stub" as const,
    usage,
  });
}

function contextFailure(error: unknown): AgentFixtureExecutionFailureCode {
  if (!(error instanceof AgentContextBuilderError)) return "REJECTED_MODEL_POLICY_GAP";
  if (error.code === "TENANT_SCOPE_MISMATCH") return "REJECTED_SCOPE_TENANT_MISMATCH";
  if (error.code === "FORBIDDEN_SECRET") return "REJECTED_SECRET";
  return "REJECTED_MODEL_POLICY_GAP";
}

function estimatedCostMicros(value: unknown): number | null {
  const outer = exactRecord(value, MODEL_ACCESS_FIELDS);
  const request = outer && exactRecord(outer.request, MODEL_REQUEST_FIELDS);
  return request ? usdMicros(request.estimatedCostUsd) : null;
}

function scopeFromContext(value: unknown): Readonly<{ tenantId: string; workspaceId: string | null }> | null {
  const context = exactRecord(value, CONTEXT_FIELDS);
  if (!context || typeof context.tenantId !== "string"
    || (context.workspaceId !== null && typeof context.workspaceId !== "string")) return null;
  return Object.freeze({
    tenantId: context.tenantId,
    workspaceId: context.workspaceId as string | null,
  });
}

function contextMatchesPreflight(
  context: AgentContextBuildResult,
  envelope: Extract<ReturnType<typeof evaluateModelAccessPreflight>, { allowed: true }>["envelope"],
): boolean {
  if (envelope.tools.length !== 0 || envelope.input.length !== 1) return false;
  const block = envelope.input[0];
  return block?.kind === "untrusted_data"
    && block.classification === "tenant_business_materials"
    && block.sourceRef === `agent-context:${context.outputSha256.slice("sha256:".length)}`
    && block.text === context.serializedContext;
}

function cloneJsonValue(value: unknown, depth: number, state: CloneState): CloneResult {
  if (value === null || typeof value === "boolean") return Object.freeze({ ok: true, value });
  if (typeof value === "string") {
    return value.length <= MAX_OUTPUT_STRING
      ? Object.freeze({ ok: true, value }) : Object.freeze({ ok: false });
  }
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? Object.freeze({ ok: true, value }) : Object.freeze({ ok: false });
  }
  if (typeof value !== "object" || isProxy(value) || depth > MAX_OUTPUT_DEPTH
    || state.nodes >= MAX_OUTPUT_NODES || state.ancestors.has(value)) {
    return Object.freeze({ ok: false });
  }

  state.nodes += 1;
  state.ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) return Object.freeze({ ok: false });
      const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
      const length = descriptors.length?.value;
      if (!Number.isSafeInteger(length) || length < 0 || length > MAX_OUTPUT_ARRAY
        || Reflect.ownKeys(descriptors).length !== length + 1) return Object.freeze({ ok: false });
      const result: unknown[] = [];
      for (let index = 0; index < length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
          return Object.freeze({ ok: false });
        }
        const nested = cloneJsonValue(descriptor.value, depth + 1, state);
        if (!nested.ok) return nested;
        result.push(nested.value);
      }
      return Object.freeze({ ok: true, value: Object.freeze(result) });
    }

    if (Object.getPrototypeOf(value) !== Object.prototype) return Object.freeze({ ok: false });
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.length > MAX_OUTPUT_KEYS || keys.some((key) => typeof key !== "string")) {
      return Object.freeze({ ok: false });
    }
    const result: PlainRecord = {};
    for (const key of keys as string[]) {
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        return Object.freeze({ ok: false });
      }
      const nested = cloneJsonValue(descriptor.value, depth + 1, state);
      if (!nested.ok) return nested;
      Object.defineProperty(result, key, {
        configurable: false,
        enumerable: true,
        writable: false,
        value: nested.value,
      });
    }
    return Object.freeze({ ok: true, value: Object.freeze(result) });
  } catch {
    return Object.freeze({ ok: false });
  } finally {
    state.ancestors.delete(value);
  }
}

function parseProviderResponse(
  value: unknown,
  boundaryBindingSha256: string,
  requestedOutputTokens: number,
  maximumCostMicros: number,
): ParsedProviderResponse | null {
  const response = exactRecord(value, RESPONSE_FIELDS);
  const rawUsage = response && exactRecord(response.usage, USAGE_FIELDS);
  if (!response || response.version !== 1 || response.boundaryBindingSha256 !== boundaryBindingSha256
    || !rawUsage) return null;
  const inputTokens = rawUsage.inputTokens;
  const outputTokens = rawUsage.outputTokens;
  const totalTokens = rawUsage.totalTokens;
  const costMicros = usdMicros(rawUsage.costUsd);
  if (!Number.isSafeInteger(inputTokens) || (inputTokens as number) < 0
    || (inputTokens as number) > MAX_PROVIDER_TOKENS
    || !Number.isSafeInteger(outputTokens) || (outputTokens as number) < 0
    || (outputTokens as number) > requestedOutputTokens
    || !Number.isSafeInteger(totalTokens) || totalTokens !== (inputTokens as number) + (outputTokens as number)
    || costMicros === null || costMicros > maximumCostMicros) return null;
  return Object.freeze({
    output: response.output,
    usage: Object.freeze({
      providerCalls: 1 as const,
      inputTokens: inputTokens as number,
      outputTokens: outputTokens as number,
      totalTokens: totalTokens as number,
      costUsd: costMicros / 1_000_000,
    }),
  });
}

function configuration(value: unknown): Readonly<{
  provider: AgentFixtureModelProvider;
  clock: () => number;
  maxDeadlineMs: number;
}> {
  const config = exactRecord(value, ["provider", "clock", "maxDeadlineMs"]);
  const provider = config && exactRecord(config.provider, ["kind", "execute"]);
  if (!config || !provider || provider.kind !== "fixture"
    || typeof provider.execute !== "function" || isProxy(provider.execute)
    || typeof config.clock !== "function" || isProxy(config.clock)
    || !Number.isSafeInteger(config.maxDeadlineMs) || (config.maxDeadlineMs as number) < 1
    || (config.maxDeadlineMs as number) > MAX_DEADLINE_MS) {
    throw new TypeError("Invalid fixture agent execution boundary configuration.");
  }
  return Object.freeze({
    provider: Object.freeze({
      kind: "fixture" as const,
      execute: provider.execute as AgentFixtureModelProvider["execute"],
    }),
    clock: config.clock as () => number,
    maxDeadlineMs: config.maxDeadlineMs as number,
  });
}

export function createFixtureAgentExecutionBoundary(
  options: AgentFixtureExecutionBoundaryOptions,
): AgentFixtureExecutionBoundary {
  const configured = configuration(options);

  return Object.freeze({
    async execute(inputValue: unknown, executeOptions?: unknown): Promise<AgentFixtureExecutionResult> {
      const input = exactRecord(inputValue, INPUT_FIELDS);
      const signal = parseSignal(executeOptions);
      if (!input || input.version !== 1 || signal === null) {
        return failure("REJECTED_MODEL_POLICY_GAP", 0);
      }
      if (input.executionMode !== "fixture") return failure("AI_PROVIDER_DISABLED", 0);
      if (isAborted(signal)) return failure("RUN_CANCELLED", 0);

      const deadlineAt = canonicalTimestamp(input.deadlineAt);
      if (!deadlineAt) return failure("REJECTED_MODEL_POLICY_GAP", 0);

      let context: AgentContextBuildResult;
      try {
        context = buildAgentContext(input.context);
      } catch (error) {
        return failure(contextFailure(error), 0);
      }
      const scope = scopeFromContext(input.context);
      const maximumCostMicros = estimatedCostMicros(input.modelAccess);
      if (!scope || maximumCostMicros === null) return failure("REJECTED_MODEL_POLICY_GAP", 0);

      const preflight = evaluateModelAccessPreflight(input.modelAccess);
      if (!preflight.allowed) return failure(preflight.code, 0);
      if (!contextMatchesPreflight(context, preflight.envelope)) {
        return failure("RUN_REVALIDATE_REQUIRED", 0);
      }

      let now: number;
      try {
        now = configured.clock();
      } catch {
        return failure("REJECTED_MODEL_POLICY_GAP", 0);
      }
      const deadlineMs = Date.parse(deadlineAt) - now;
      if (!Number.isFinite(now) || !Number.isFinite(deadlineMs) || deadlineMs <= 0
        || deadlineMs > configured.maxDeadlineMs) {
        return failure("RUN_DEADLINE_EXCEEDED", 0);
      }
      if (isAborted(signal)) return failure("RUN_CANCELLED", 0);

      const boundaryBindingSha256 = sha256(JSON.stringify({
        version: 1,
        executionMode: "fixture",
        executionBindingSha256: preflight.envelope.executionBindingSha256,
        contextInputSha256: context.inputSha256,
        contextOutputSha256: context.outputSha256,
        provider: preflight.envelope.provider,
        model: preflight.envelope.model,
        requestedOutputTokens: preflight.envelope.requestedOutputTokens,
        tools: [],
        deadlineAt,
      }));

      const controller = new AbortController();
      let parentCancelled = false;
      let deadlineExpired = false;
      const onParentAbort = () => {
        parentCancelled = true;
        controller.abort();
      };
      if (signal) signal.addEventListener("abort", onParentAbort, { once: true });
      if (isAborted(signal)) onParentAbort();
      const timer = setTimeout(() => {
        deadlineExpired = true;
        controller.abort();
      }, deadlineMs);

      const providerRequest: AgentFixtureModelRequest = Object.freeze({
        version: 1 as const,
        provider: "fixture" as const,
        model: "openai-responses-stub" as const,
        boundaryBindingSha256,
        deadlineAt,
        requestedOutputTokens: preflight.envelope.requestedOutputTokens,
        systemPolicy: Object.freeze({
          kind: "trusted_system_policy" as const,
          text: context.systemPolicy,
        }),
        prompt: Object.freeze({ ...preflight.envelope.prompt }),
        context: Object.freeze({
          kind: "untrusted_data" as const,
          inputSha256: context.inputSha256,
          outputSha256: context.outputSha256,
          serialized: context.serializedContext,
        }),
        tools: Object.freeze([]) as readonly [],
        signal: controller.signal,
      });

      type Outcome =
        | Readonly<{ kind: "provider"; value: unknown }>
        | Readonly<{ kind: "provider_error" }>
        | Readonly<{ kind: "aborted" }>;
      let removeAbortRace: () => void = () => undefined;
      const aborted = new Promise<Outcome>((resolve) => {
        const onAbort = () => resolve(Object.freeze({ kind: "aborted" as const }));
        controller.signal.addEventListener("abort", onAbort, { once: true });
        removeAbortRace = () => controller.signal.removeEventListener("abort", onAbort);
      });
      const provider = Promise.resolve()
        .then(() => configured.provider.execute(providerRequest))
        .then(
          (value): Outcome => Object.freeze({ kind: "provider" as const, value }),
          (): Outcome => Object.freeze({ kind: "provider_error" as const }),
        );

      try {
        const outcome = await Promise.race([provider, aborted]);
        if (deadlineExpired) return failure("RUN_DEADLINE_EXCEEDED", 1);
        if (parentCancelled || isAborted(signal)) return failure("RUN_CANCELLED", 1);
        if (outcome.kind === "aborted") return failure("RUN_CANCELLED", 1);
        if (outcome.kind === "provider_error") return failure("PROVIDER_FAILED", 1);

        const parsed = parseProviderResponse(
          outcome.value,
          boundaryBindingSha256,
          preflight.envelope.requestedOutputTokens,
          maximumCostMicros,
        );
        if (!parsed) return failure("PROVIDER_RESPONSE_INVALID", 1);
        const cloned = cloneJsonValue(parsed.output, 0, {
          nodes: 0,
          ancestors: new WeakSet<object>(),
        });
        if (!cloned.ok) return failure("PROVIDER_RESPONSE_INVALID", 1, parsed.usage);
        const validated = validateAgentProposalOutput(cloned.value, scope);
        if (!validated.accepted) return failure(validated.code, 1, parsed.usage);
        if (deadlineExpired) return failure("RUN_DEADLINE_EXCEEDED", 1, parsed.usage);
        if (parentCancelled || isAborted(signal)) return failure("RUN_CANCELLED", 1, parsed.usage);

        return Object.freeze({
          ok: true as const,
          status: "complete" as const,
          code: "OK_PROPOSAL" as const,
          provider: "fixture" as const,
          model: "openai-responses-stub" as const,
          boundaryBindingSha256,
          context: Object.freeze({
            inputSha256: context.inputSha256,
            outputSha256: context.outputSha256,
            selectedEvidenceCount: context.selectedEvidenceCount,
            droppedEvidenceCount: context.droppedEvidenceCount,
            truncated: context.truncated,
          }),
          proposal: validated.proposal,
          usage: parsed.usage,
        });
      } finally {
        clearTimeout(timer);
        removeAbortRace();
        if (signal) signal.removeEventListener("abort", onParentAbort);
      }
    },
  });
}
