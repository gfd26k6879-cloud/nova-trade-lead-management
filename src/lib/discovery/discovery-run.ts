import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import type { DiscoveryPlan, DiscoveryTask } from "@/lib/discovery/discovery-plan";

export const DISCOVERY_RUN_VERSION = 1 as const;

type Scope = Readonly<{ tenantId: string; workspaceId: string | null }>;
type SafeValue = null | boolean | number | string | readonly SafeValue[] | SafeObject;
interface SafeObject { readonly [key: string]: SafeValue }

export type DiscoveryObservation = Readonly<{
  observationVersion: 1;
  observationId: string;
  accountRef: string;
  sourceKey: string;
  observedAt: string;
  fields: SafeObject;
}>;

export type DiscoveryBatchReceipt = Readonly<{
  batchId: string;
  batchHash: string;
  cursor: string | null;
  nextCursor: string | null;
  complete: boolean;
  appendedAt: string;
  providerRequests: number;
  spendCents: number;
  observationIds: readonly string[];
}>;

export type DiscoveryTaskRun = Readonly<{
  taskId: string;
  sourceKey: string;
  cursor: string | null;
  complete: boolean;
  accounts: number;
  providerRequests: number;
  spendCents: number;
  observations: readonly DiscoveryObservation[];
  batches: readonly DiscoveryBatchReceipt[];
}>;

export type DiscoveryRunEvent = Readonly<{
  sequence: number;
  action: "start" | "append" | "complete" | "fail" | "cancel";
  at: string;
  reason: string;
  taskId: string | null;
  batchId: string | null;
}>;

export type DiscoveryRun = Scope & Readonly<{
  runVersion: typeof DISCOVERY_RUN_VERSION;
  runId: string;
  plan: DiscoveryPlan;
  status: "planned" | "running" | "completed" | "failed" | "cancelled";
  createdAt: string;
  updatedAt: string;
  tasks: readonly DiscoveryTaskRun[];
  totals: Readonly<{ accounts: number; providerRequests: number; spendCents: number }>;
  events: readonly DiscoveryRunEvent[];
  runHash: string;
}>;

export type DiscoveryRunFailureCode =
  | "MALFORMED_INPUT"
  | "SCOPE_MISMATCH"
  | "STALE_RUN"
  | "INVALID_TRANSITION"
  | "INVALID_CHRONOLOGY"
  | "TASK_NOT_FOUND"
  | "CHECKPOINT_MISMATCH"
  | "DUPLICATE_OBSERVATION"
  | "BOUNDS_EXCEEDED";

export type DiscoveryRunResult =
  | Readonly<{ ok: true; code:
    | "DISCOVERY_RUN_CREATED"
    | "DISCOVERY_RUN_STARTED"
    | "DISCOVERY_BATCH_APPENDED"
    | "DISCOVERY_BATCH_REPLAYED"
    | "DISCOVERY_RUN_COMPLETED"
    | "DISCOVERY_RUN_FAILED"
    | "DISCOVERY_RUN_CANCELLED"; run: DiscoveryRun }>
  | Readonly<{ ok: false; code: DiscoveryRunFailureCode }>;

type PlainRecord = Record<string, unknown>;
type ParsedPlan = DiscoveryPlan;

const CREATE_FIELDS = ["version", "tenantId", "workspaceId", "plan", "createdAt"] as const;
const TRANSITION_FIELDS = [
  "version", "tenantId", "workspaceId", "current", "expectedRunHash", "action", "at", "reason",
] as const;
const APPEND_FIELDS = ["version", "tenantId", "workspaceId", "current", "expectedRunHash", "batch"] as const;
const PLAN_FIELDS = [
  "planVersion", "planId", "planHash", "status", "tenantId", "workspaceId", "activationStateHash",
  "play", "limits", "tasks",
] as const;
const PLAY_FIELDS = ["stableKey", "versionId", "contentHash", "reviewHash", "revision"] as const;
const LIMIT_FIELDS = ["maxAccounts", "maxProviderRequests", "maxSpendCents"] as const;
const TASK_FIELDS = [
  "taskVersion", "taskId", "sourceKey", "hypothesisId", "queryFamily", "statement", "rationaleRefs",
  "uncertaintyIds", "caps",
] as const;
const REF_FIELDS = ["claimId", "evidenceId"] as const;
const RUN_FIELDS = [
  "runVersion", "runId", "tenantId", "workspaceId", "plan", "status", "createdAt", "updatedAt", "tasks",
  "totals", "events", "runHash",
] as const;
const TASK_RUN_FIELDS = [
  "taskId", "sourceKey", "cursor", "complete", "accounts", "providerRequests", "spendCents", "observations", "batches",
] as const;
const OBSERVATION_FIELDS = [
  "observationVersion", "observationId", "accountRef", "sourceKey", "observedAt", "fields",
] as const;
const BATCH_INPUT_FIELDS = [
  "batchVersion", "batchId", "taskId", "cursor", "nextCursor", "complete", "appendedAt", "providerRequests",
  "spendCents", "observations",
] as const;
const RECEIPT_FIELDS = [
  "batchId", "batchHash", "cursor", "nextCursor", "complete", "appendedAt", "providerRequests", "spendCents",
  "observationIds",
] as const;
const EVENT_FIELDS = ["sequence", "action", "at", "reason", "taskId", "batchId"] as const;
const TOTAL_FIELDS = ["accounts", "providerRequests", "spendCents"] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const REF = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,299}$/u;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const PLAN_ID = /^discovery-plan:[a-f0-9]{64}$/u;
const TASK_ID = /^discovery-task:[a-f0-9]{64}$/u;
const RUN_ID = /^discovery-run:[a-f0-9]{64}$/u;
const PLAY_VERSION = /^lead-play-version:[a-f0-9]{64}$/u;
const SECRET = /(?:authorization\s*:\s*bearer\s+\S+|\bsk-[A-Za-z0-9_-]{20,}\b|(?:api[_ -]?key|password|passwd|secret|access[_ -]?token|refresh[_ -]?token)\s*[:=]\s*\S+)/iu;
const MAX_TASKS = 128;
const MAX_ITEMS = 10_000;
const MAX_EVENTS = 20_001;

function exactRecord(value: unknown, fields: readonly string[]): PlainRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value) || isProxy(value)) return null;
  try {
    if (Object.getPrototypeOf(value) !== Object.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.length !== fields.length || keys.some((key) => typeof key !== "string" || !fields.includes(key))) return null;
    const output: PlainRecord = {};
    for (const field of fields) {
      const descriptor = descriptors[field];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return null;
      output[field] = descriptor.value;
    }
    return output;
  } catch {
    return null;
  }
}

function exactArray(value: unknown, maximum: number): readonly unknown[] | null {
  if (typeof value !== "object" || value === null || !Array.isArray(value) || isProxy(value)) return null;
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
    const length = descriptors.length?.value;
    if (!Number.isSafeInteger(length) || length < 0 || length > maximum
      || Reflect.ownKeys(descriptors).length !== length + 1) return null;
    const output: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return null;
      output.push(descriptor.value);
    }
    return output;
  } catch {
    return null;
  }
}

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function stableValue(value: unknown, budget = { nodes: 0 }, depth = 0): SafeValue | undefined {
  budget.nodes += 1;
  if (budget.nodes > 20_000 || depth > 12) return undefined;
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") return value.length <= 4_000 ? value : undefined;
  if (typeof value !== "object" || isProxy(value)) return undefined;
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) return undefined;
      const items = exactArray(value, MAX_ITEMS);
      if (!items) return undefined;
      const output: SafeValue[] = [];
      for (const item of items) {
        const parsed = stableValue(item, budget, depth + 1);
        if (parsed === undefined) return undefined;
        output.push(parsed);
      }
      return Object.freeze(output);
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) return undefined;
    const keys = Reflect.ownKeys(descriptors);
    if (keys.length > 100 || keys.some((key) => typeof key !== "string" || key.length === 0 || key.length > 200)) return undefined;
    const output: Record<string, SafeValue> = {};
    for (const key of (keys as string[]).sort(compareAscii)) {
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return undefined;
      const parsed = stableValue(descriptor.value, budget, depth + 1);
      if (parsed === undefined) return undefined;
      output[key] = parsed;
    }
    return Object.freeze(output);
  } catch {
    return undefined;
  }
}

function stableHash(value: unknown): string | null {
  const canonical = stableValue(value);
  return canonical === undefined ? null : sha256(canonical);
}

function uuid(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

function workspace(value: unknown): string | null | undefined {
  return value === null ? null : uuid(value) ?? undefined;
}

function reference(value: unknown): string | null {
  return typeof value === "string" && REF.test(value) ? value : null;
}

function integer(value: unknown, minimum: number, maximum: number): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : null;
}

function timestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 40 || value !== value.trim()) return null;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value ? value : null;
}

function cursor(value: unknown): string | null | undefined {
  return value === null ? null : typeof value === "string" && value.length > 0 && value.length <= 4_096
    && value === value.trim() && !/[\u0000-\u001f\u007f-\u009f]|\p{Default_Ignorable_Code_Point}/u.test(value)
    ? value : undefined;
}

function reason(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 8 || value.length > 2_000 || value !== value.trim()
    || /[\u0000-\u001f\u007f-\u009f]|\p{Default_Ignorable_Code_Point}/u.test(value)) return null;
  const securityView = value.normalize("NFKD").replace(/\p{M}+/gu, "").normalize("NFKC");
  return SECRET.test(securityView) ? null : value;
}

function boundedText(value: unknown, maximum: number): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum || value !== value.trim()
    || /[\u0000-\u001f\u007f-\u009f]|\p{Default_Ignorable_Code_Point}/u.test(value)) return null;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (index + 1 >= value.length || next < 0xdc00 || next > 0xdfff) return null;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return null;
  }
  return value;
}

function sameScope(left: Scope, right: Scope): boolean {
  return left.tenantId === right.tenantId && left.workspaceId === right.workspaceId;
}

function parsePlan(value: unknown): ParsedPlan | null {
  const record = exactRecord(value, PLAN_FIELDS);
  const tenantId = record && uuid(record.tenantId);
  const workspaceId = record && workspace(record.workspaceId);
  const planId = record && typeof record.planId === "string" && PLAN_ID.test(record.planId) ? record.planId : null;
  const planHash = record && typeof record.planHash === "string" && HASH.test(record.planHash) ? record.planHash : null;
  const activationStateHash = record && typeof record.activationStateHash === "string" && HASH.test(record.activationStateHash)
    ? record.activationStateHash : null;
  const playRecord = record && exactRecord(record.play, PLAY_FIELDS);
  const stableKey = playRecord && reference(playRecord.stableKey);
  const versionId = playRecord && typeof playRecord.versionId === "string" && PLAY_VERSION.test(playRecord.versionId)
    ? playRecord.versionId : null;
  const contentHash = playRecord && typeof playRecord.contentHash === "string" && HASH.test(playRecord.contentHash)
    ? playRecord.contentHash : null;
  const reviewHash = playRecord && typeof playRecord.reviewHash === "string" && HASH.test(playRecord.reviewHash)
    ? playRecord.reviewHash : null;
  const revision = playRecord && integer(playRecord.revision, 1, 1_000_000);
  const limitsRecord = record && exactRecord(record.limits, LIMIT_FIELDS);
  const maxAccounts = limitsRecord && integer(limitsRecord.maxAccounts, 1, 10_000);
  const maxProviderRequests = limitsRecord && integer(limitsRecord.maxProviderRequests, 1, 10_000);
  const maxSpendCents = limitsRecord && integer(limitsRecord.maxSpendCents, 0, 100_000_000);
  const taskInputs = record && exactArray(record.tasks, MAX_TASKS);
  if (!record || record.planVersion !== 1 || record.status !== "plan_only" || !tenantId || workspaceId === undefined
    || !planId || !planHash || !activationStateHash || !playRecord || !stableKey || !versionId || !contentHash
    || !reviewHash || revision === null || !limitsRecord || maxAccounts === null || maxProviderRequests === null
    || maxSpendCents === null || !taskInputs?.length) return null;
  const tasks: DiscoveryTask[] = [];
  const taskIds = new Set<string>();
  for (const input of taskInputs) {
    const taskRecord = exactRecord(input, TASK_FIELDS);
    const taskId = taskRecord && typeof taskRecord.taskId === "string" && TASK_ID.test(taskRecord.taskId) ? taskRecord.taskId : null;
    const sourceKey = taskRecord && reference(taskRecord.sourceKey);
    const hypothesisId = taskRecord && reference(taskRecord.hypothesisId);
    const queryFamily = taskRecord && reference(taskRecord.queryFamily);
    const statement = taskRecord && boundedText(taskRecord.statement, 2_000);
    const capsRecord = taskRecord && exactRecord(taskRecord.caps, LIMIT_FIELDS);
    const taskAccounts = capsRecord && integer(capsRecord.maxAccounts, 1, 10_000);
    const taskRequests = capsRecord && integer(capsRecord.maxProviderRequests, 1, 10_000);
    const taskSpend = capsRecord && integer(capsRecord.maxSpendCents, 0, 100_000_000);
    const refsInput = taskRecord && exactArray(taskRecord.rationaleRefs, 16);
    const uncertaintyInput = taskRecord && exactArray(taskRecord.uncertaintyIds, 16);
    if (!taskRecord || taskRecord.taskVersion !== 1 || !taskId || !sourceKey || !hypothesisId || !queryFamily
      || !statement || !capsRecord || taskAccounts === null || taskRequests === null || taskSpend === null
      || !refsInput?.length || !uncertaintyInput || taskIds.has(taskId)) return null;
    const rationaleRefs: Array<Readonly<{ claimId: string; evidenceId: string }>> = [];
    const refIds = new Set<string>();
    for (const rawRef of refsInput) {
      const refRecord = exactRecord(rawRef, REF_FIELDS);
      const claimId = refRecord && reference(refRecord.claimId);
      const evidenceId = refRecord && reference(refRecord.evidenceId);
      if (!claimId || !evidenceId || refIds.has(`${claimId}\0${evidenceId}`)) return null;
      refIds.add(`${claimId}\0${evidenceId}`);
      rationaleRefs.push(Object.freeze({ claimId, evidenceId }));
    }
    const uncertaintyIds: string[] = [];
    for (const rawId of uncertaintyInput) {
      const id = reference(rawId);
      if (!id || uncertaintyIds.includes(id)) return null;
      uncertaintyIds.push(id);
    }
    const caps = Object.freeze({ maxAccounts: taskAccounts, maxProviderRequests: taskRequests, maxSpendCents: taskSpend });
    const frozenRefs = Object.freeze(rationaleRefs);
    const frozenUncertainties = Object.freeze(uncertaintyIds);
    const taskPayload = Object.freeze({ taskVersion: 1 as const, playVersionId: versionId, sourceKey, hypothesisId,
      queryFamily, statement, rationaleRefs: frozenRefs, uncertaintyIds: frozenUncertainties, caps });
    if (taskId !== `discovery-task:${sha256(taskPayload).slice("sha256:".length)}`) return null;
    taskIds.add(taskId);
    tasks.push(Object.freeze({ taskVersion: 1, taskId, sourceKey, hypothesisId, queryFamily, statement,
      rationaleRefs: frozenRefs, uncertaintyIds: frozenUncertainties, caps }));
  }
  if (tasks.reduce((sum, task) => sum + task.caps.maxAccounts, 0) !== maxAccounts
    || tasks.reduce((sum, task) => sum + task.caps.maxProviderRequests, 0) !== maxProviderRequests
    || tasks.reduce((sum, task) => sum + task.caps.maxSpendCents, 0) !== maxSpendCents) return null;
  const play = Object.freeze({ stableKey, versionId, contentHash, reviewHash, revision });
  const limits = Object.freeze({ maxAccounts, maxProviderRequests, maxSpendCents });
  const payload = Object.freeze({ planVersion: 1 as const, status: "plan_only" as const, tenantId, workspaceId,
    activationStateHash, play, limits, tasks: Object.freeze(tasks) });
  if (sha256(payload) !== planHash || planId !== `discovery-plan:${planHash.slice("sha256:".length)}`) return null;
  return Object.freeze({ ...payload, planId, planHash });
}

function parseObservation(value: unknown): DiscoveryObservation | null {
  const record = exactRecord(value, OBSERVATION_FIELDS);
  const observationId = record && reference(record.observationId);
  const accountRef = record && reference(record.accountRef);
  const sourceKey = record && reference(record.sourceKey);
  const observedAt = record && timestamp(record.observedAt);
  const fields = record && stableValue(record.fields);
  if (!record || record.observationVersion !== 1 || !observationId || !accountRef || !sourceKey || !observedAt
    || !fields || Array.isArray(fields) || Object.keys(fields).length === 0) return null;
  return Object.freeze({ observationVersion: 1, observationId, accountRef, sourceKey, observedAt,
    fields: fields as SafeObject });
}

type ParsedBatch = Readonly<{
  batchId: string; taskId: string; cursor: string | null; nextCursor: string | null; complete: boolean;
  appendedAt: string; providerRequests: number; spendCents: number; observations: readonly DiscoveryObservation[];
  batchHash: string;
}>;

function parseBatch(value: unknown): ParsedBatch | null {
  const record = exactRecord(value, BATCH_INPUT_FIELDS);
  const batchId = record && reference(record.batchId);
  const taskId = record && typeof record.taskId === "string" && TASK_ID.test(record.taskId) ? record.taskId : null;
  const parsedCursor = record && cursor(record.cursor);
  const nextCursor = record && cursor(record.nextCursor);
  const appendedAt = record && timestamp(record.appendedAt);
  const providerRequests = record && integer(record.providerRequests, 1, 10_000);
  const spendCents = record && integer(record.spendCents, 0, 100_000_000);
  const observationInputs = record && exactArray(record.observations, MAX_ITEMS);
  if (!record || record.batchVersion !== 1 || !batchId || !taskId || parsedCursor === undefined
    || nextCursor === undefined || typeof record.complete !== "boolean" || !appendedAt
    || providerRequests === null || spendCents === null || !observationInputs
    || (record.complete ? nextCursor !== null : nextCursor === null || nextCursor === parsedCursor)) return null;
  const observations = observationInputs.map(parseObservation);
  if (observations.some((item) => !item)) return null;
  const canonical = (observations as DiscoveryObservation[]).sort((left, right) => compareAscii(left.observationId, right.observationId));
  if (canonical.some((item, index) => index > 0 && canonical[index - 1]?.observationId === item.observationId)) return null;
  const payload = Object.freeze({ batchVersion: 1, batchId, taskId, cursor: parsedCursor, nextCursor,
    complete: record.complete, appendedAt, providerRequests, spendCents, observations: Object.freeze(canonical) });
  const batchHash = stableHash(payload);
  return batchHash ? Object.freeze({ ...payload, batchHash }) : null;
}

function totals(tasks: readonly DiscoveryTaskRun[]) {
  return Object.freeze({
    accounts: tasks.reduce((sum, task) => sum + task.accounts, 0),
    providerRequests: tasks.reduce((sum, task) => sum + task.providerRequests, 0),
    spendCents: tasks.reduce((sum, task) => sum + task.spendCents, 0),
  });
}

function buildRun(payload: Omit<DiscoveryRun, "runHash">): DiscoveryRun | null {
  const runHash = stableHash(payload);
  return runHash ? Object.freeze({ ...payload, runHash }) : null;
}

function parseRun(value: unknown): DiscoveryRun | null {
  const record = exactRecord(value, RUN_FIELDS);
  const tenantId = record && uuid(record.tenantId);
  const workspaceId = record && workspace(record.workspaceId);
  const runId = record && typeof record.runId === "string" && RUN_ID.test(record.runId) ? record.runId : null;
  const plan = record && parsePlan(record.plan);
  const createdAt = record && timestamp(record.createdAt);
  const updatedAt = record && timestamp(record.updatedAt);
  const runHash = record && typeof record.runHash === "string" && HASH.test(record.runHash) ? record.runHash : null;
  const status = record?.status === "planned" || record?.status === "running" || record?.status === "completed"
    || record?.status === "failed" || record?.status === "cancelled" ? record.status : null;
  const taskInputs = record && exactArray(record.tasks, MAX_TASKS);
  const eventInputs = record && exactArray(record.events, MAX_EVENTS);
  const totalsRecord = record && exactRecord(record.totals, TOTAL_FIELDS);
  if (!record || record.runVersion !== 1 || !tenantId || workspaceId === undefined || !runId || !plan || !createdAt
    || !updatedAt || !runHash || !status || !taskInputs || !eventInputs || !totalsRecord
    || !sameScope({ tenantId, workspaceId }, plan)) return null;
  const tasks: DiscoveryTaskRun[] = [];
  for (let index = 0; index < taskInputs.length; index += 1) {
    const taskRecord = exactRecord(taskInputs[index], TASK_RUN_FIELDS);
    const planned = plan.tasks[index];
    const taskCursor = taskRecord && cursor(taskRecord.cursor);
    const accounts = taskRecord && integer(taskRecord.accounts, 0, 10_000);
    const providerRequests = taskRecord && integer(taskRecord.providerRequests, 0, 10_000);
    const spendCents = taskRecord && integer(taskRecord.spendCents, 0, 100_000_000);
    const observationInputs = taskRecord && exactArray(taskRecord.observations, MAX_ITEMS);
    const receiptInputs = taskRecord && exactArray(taskRecord.batches, MAX_ITEMS);
    if (!taskRecord || !planned || taskRecord.taskId !== planned.taskId || taskRecord.sourceKey !== planned.sourceKey
      || taskCursor === undefined || typeof taskRecord.complete !== "boolean" || accounts === null
      || providerRequests === null || spendCents === null || !observationInputs || !receiptInputs) return null;
    const observations = observationInputs.map(parseObservation);
    if (observations.some((item) => !item || item.sourceKey !== planned.sourceKey)) return null;
    const seenObservations = new Set<string>();
    const seenAccounts = new Set<string>();
    for (const observation of observations as DiscoveryObservation[]) {
      if (seenObservations.has(observation.observationId) || seenAccounts.has(observation.accountRef)) return null;
      seenObservations.add(observation.observationId);
      seenAccounts.add(observation.accountRef);
    }
    const receipts: DiscoveryBatchReceipt[] = [];
    let replayCursor: string | null = null;
    let replayComplete = false;
    let requests = 0;
    let spend = 0;
    const receiptObservationIds: string[] = [];
    const batchIds = new Set<string>();
    for (const rawReceipt of receiptInputs) {
      const receipt = exactRecord(rawReceipt, RECEIPT_FIELDS);
      const batchId = receipt && reference(receipt.batchId);
      const batchHash = receipt && typeof receipt.batchHash === "string" && HASH.test(receipt.batchHash) ? receipt.batchHash : null;
      const from = receipt && cursor(receipt.cursor);
      const next = receipt && cursor(receipt.nextCursor);
      const appendedAt = receipt && timestamp(receipt.appendedAt);
      const batchRequests = receipt && integer(receipt.providerRequests, 1, 10_000);
      const batchSpend = receipt && integer(receipt.spendCents, 0, 100_000_000);
      const idsInput = receipt && exactArray(receipt.observationIds, MAX_ITEMS);
      if (!receipt || !batchId || !batchHash || from === undefined || next === undefined
        || typeof receipt.complete !== "boolean" || !appendedAt || batchRequests === null || batchSpend === null
        || !idsInput || from !== replayCursor || replayComplete || batchIds.has(batchId)
        || (receipt.complete ? next !== null : next === null || next === from)) return null;
      const observationIds = idsInput.map(reference);
      if (observationIds.some((id) => !id)) return null;
      batchIds.add(batchId);
      replayCursor = next;
      replayComplete = receipt.complete;
      requests += batchRequests;
      spend += batchSpend;
      receiptObservationIds.push(...observationIds as string[]);
      receipts.push(Object.freeze({ batchId, batchHash, cursor: from, nextCursor: next, complete: receipt.complete,
        appendedAt, providerRequests: batchRequests, spendCents: batchSpend,
        observationIds: Object.freeze(observationIds as string[]) }));
    }
    if (seenAccounts.size !== accounts || requests !== providerRequests || spend !== spendCents
      || taskCursor !== replayCursor || taskRecord.complete !== replayComplete
      || receiptObservationIds.length !== observations.length
      || receiptObservationIds.some((id, itemIndex) => id !== observations[itemIndex]?.observationId)
      || accounts > planned.caps.maxAccounts || providerRequests > planned.caps.maxProviderRequests
      || spendCents > planned.caps.maxSpendCents) return null;
    let observationOffset = 0;
    for (const receipt of receipts) {
      const receiptObservations = (observations as DiscoveryObservation[])
        .slice(observationOffset, observationOffset + receipt.observationIds.length);
      observationOffset += receipt.observationIds.length;
      const batchPayload = Object.freeze({ batchVersion: 1, batchId: receipt.batchId, taskId: planned.taskId,
        cursor: receipt.cursor, nextCursor: receipt.nextCursor, complete: receipt.complete,
        appendedAt: receipt.appendedAt, providerRequests: receipt.providerRequests, spendCents: receipt.spendCents,
        observations: Object.freeze(receiptObservations) });
      if (stableHash(batchPayload) !== receipt.batchHash) return null;
    }
    tasks.push(Object.freeze({ taskId: planned.taskId, sourceKey: planned.sourceKey, cursor: taskCursor,
      complete: replayComplete, accounts, providerRequests, spendCents,
      observations: Object.freeze(observations as DiscoveryObservation[]), batches: Object.freeze(receipts) }));
  }
  if (tasks.length !== plan.tasks.length) return null;
  const canonicalTotals = totals(tasks);
  if (totalsRecord.accounts !== canonicalTotals.accounts || totalsRecord.providerRequests !== canonicalTotals.providerRequests
    || totalsRecord.spendCents !== canonicalTotals.spendCents || canonicalTotals.accounts > plan.limits.maxAccounts
    || canonicalTotals.providerRequests > plan.limits.maxProviderRequests
    || canonicalTotals.spendCents > plan.limits.maxSpendCents) return null;
  const events: DiscoveryRunEvent[] = [];
  let lifecycle: DiscoveryRun["status"] = "planned";
  let lastAt = createdAt;
  let receiptIndex = 0;
  const allReceipts = tasks.flatMap((task) => task.batches.map((receipt) => ({ taskId: task.taskId, receipt })))
    .sort((left, right) => compareAscii(left.receipt.appendedAt, right.receipt.appendedAt));
  for (let index = 0; index < eventInputs.length; index += 1) {
    const event = exactRecord(eventInputs[index], EVENT_FIELDS);
    const sequence = event && integer(event.sequence, 1, MAX_EVENTS);
    const action = event?.action === "start" || event?.action === "append" || event?.action === "complete"
      || event?.action === "fail" || event?.action === "cancel" ? event.action : null;
    const at = event && timestamp(event.at);
    const eventReason = event && reason(event.reason);
    const taskId = event?.taskId === null ? null : event && typeof event.taskId === "string" && TASK_ID.test(event.taskId)
      ? event.taskId : undefined;
    const batchId = event?.batchId === null ? null : event ? reference(event.batchId) ?? undefined : undefined;
    if (!event || sequence !== index + 1 || !action || !at || !eventReason || taskId === undefined || batchId === undefined
      || Date.parse(at) <= Date.parse(lastAt)) return null;
    if (action === "start") {
      if (lifecycle !== "planned" || taskId !== null || batchId !== null) return null;
      lifecycle = "running";
    } else if (action === "append") {
      const expected = allReceipts[receiptIndex];
      if (lifecycle !== "running" || !expected || taskId !== expected.taskId || batchId !== expected.receipt.batchId
        || at !== expected.receipt.appendedAt) return null;
      receiptIndex += 1;
    } else {
      if (lifecycle !== "running" || taskId !== null || batchId !== null
        || (action === "complete" && tasks.some((task) => !task.complete))) return null;
      lifecycle = action === "complete" ? "completed" : action === "fail" ? "failed" : "cancelled";
    }
    events.push(Object.freeze({ sequence, action, at, reason: eventReason, taskId, batchId }));
    lastAt = at;
  }
  if (receiptIndex !== allReceipts.length || lifecycle !== status || updatedAt !== lastAt) return null;
  const payload = Object.freeze({ runVersion: 1 as const, runId, tenantId, workspaceId, plan, status, createdAt,
    updatedAt, tasks: Object.freeze(tasks), totals: canonicalTotals, events: Object.freeze(events) });
  const idHash = stableHash({ planId: plan.planId, planHash: plan.planHash, createdAt });
  return idHash && runId === `discovery-run:${idHash.slice("sha256:".length)}` && stableHash(payload) === runHash
    ? Object.freeze({ ...payload, runHash }) : null;
}

function failure(code: DiscoveryRunFailureCode): DiscoveryRunResult {
  return Object.freeze({ ok: false, code });
}

/**
 * Creates a pure run ledger. The caller owns connector execution, observation authenticity,
 * storage, and authorization; this module grants no provider or I/O authority.
 */
export function createDiscoveryRun(value: unknown): DiscoveryRunResult {
  try {
    const input = exactRecord(value, CREATE_FIELDS);
    if (!input || input.version !== 1) return failure("MALFORMED_INPUT");
    const tenantId = uuid(input.tenantId);
    const workspaceId = workspace(input.workspaceId);
    const plan = parsePlan(input.plan);
    const createdAt = timestamp(input.createdAt);
    if (!tenantId || workspaceId === undefined || !plan || !createdAt) return failure("MALFORMED_INPUT");
    if (!sameScope({ tenantId, workspaceId }, plan)) return failure("SCOPE_MISMATCH");
    const idHash = stableHash({ planId: plan.planId, planHash: plan.planHash, createdAt });
    if (!idHash) return failure("MALFORMED_INPUT");
    const tasks = Object.freeze(plan.tasks.map((task) => Object.freeze({ taskId: task.taskId, sourceKey: task.sourceKey,
      cursor: null, complete: false, accounts: 0, providerRequests: 0, spendCents: 0,
      observations: Object.freeze([]) as readonly DiscoveryObservation[],
      batches: Object.freeze([]) as readonly DiscoveryBatchReceipt[] })));
    const payload = Object.freeze({ runVersion: 1 as const,
      runId: `discovery-run:${idHash.slice("sha256:".length)}`, tenantId, workspaceId, plan,
      status: "planned" as const, createdAt, updatedAt: createdAt, tasks, totals: totals(tasks),
      events: Object.freeze([]) as readonly DiscoveryRunEvent[] });
    const run = buildRun(payload);
    return run ? Object.freeze({ ok: true, code: "DISCOVERY_RUN_CREATED", run }) : failure("MALFORMED_INPUT");
  } catch {
    return failure("MALFORMED_INPUT");
  }
}

export function transitionDiscoveryRun(value: unknown): DiscoveryRunResult {
  try {
    const input = exactRecord(value, TRANSITION_FIELDS);
    if (!input || input.version !== 1) return failure("MALFORMED_INPUT");
    const tenantId = uuid(input.tenantId);
    const workspaceId = workspace(input.workspaceId);
    const current = parseRun(input.current);
    const expectedRunHash = typeof input.expectedRunHash === "string" && HASH.test(input.expectedRunHash)
      ? input.expectedRunHash : null;
    const action = input.action === "start" || input.action === "complete" || input.action === "fail"
      || input.action === "cancel" ? input.action : null;
    const at = timestamp(input.at);
    const transitionReason = reason(input.reason);
    if (!tenantId || workspaceId === undefined || !current || !expectedRunHash || !action || !at || !transitionReason) {
      return failure("MALFORMED_INPUT");
    }
    if (!sameScope({ tenantId, workspaceId }, current)) return failure("SCOPE_MISMATCH");
    if (current.runHash !== expectedRunHash) return failure("STALE_RUN");
    if (Date.parse(at) <= Date.parse(current.updatedAt)) return failure("INVALID_CHRONOLOGY");
    if ((action === "start" && current.status !== "planned")
      || (action !== "start" && current.status !== "running")
      || (action === "complete" && current.tasks.some((task) => !task.complete))) return failure("INVALID_TRANSITION");
    const status = action === "start" ? "running" : action === "complete" ? "completed"
      : action === "fail" ? "failed" : "cancelled";
    const event = Object.freeze({ sequence: current.events.length + 1, action, at, reason: transitionReason,
      taskId: null, batchId: null });
    const withoutHash = Object.freeze({ runVersion: 1 as const, runId: current.runId, tenantId, workspaceId,
      plan: current.plan, status, createdAt: current.createdAt, updatedAt: at, tasks: current.tasks,
      totals: current.totals, events: Object.freeze([...current.events, event]) });
    const run = buildRun(withoutHash);
    if (!run) return failure("MALFORMED_INPUT");
    const code = action === "start" ? "DISCOVERY_RUN_STARTED" : action === "complete" ? "DISCOVERY_RUN_COMPLETED"
      : action === "fail" ? "DISCOVERY_RUN_FAILED" : "DISCOVERY_RUN_CANCELLED";
    return Object.freeze({ ok: true, code, run });
  } catch {
    return failure("MALFORMED_INPUT");
  }
}

export function appendDiscoveryObservationBatch(value: unknown): DiscoveryRunResult {
  try {
    const input = exactRecord(value, APPEND_FIELDS);
    if (!input || input.version !== 1) return failure("MALFORMED_INPUT");
    const tenantId = uuid(input.tenantId);
    const workspaceId = workspace(input.workspaceId);
    const current = parseRun(input.current);
    const expectedRunHash = typeof input.expectedRunHash === "string" && HASH.test(input.expectedRunHash)
      ? input.expectedRunHash : null;
    const batch = parseBatch(input.batch);
    if (!tenantId || workspaceId === undefined || !current || !expectedRunHash || !batch) return failure("MALFORMED_INPUT");
    if (!sameScope({ tenantId, workspaceId }, current)) return failure("SCOPE_MISMATCH");
    if (current.runHash !== expectedRunHash) return failure("STALE_RUN");
    if (current.status !== "running") return failure("INVALID_TRANSITION");
    const taskIndex = current.tasks.findIndex((task) => task.taskId === batch.taskId);
    const task = current.tasks[taskIndex];
    const plannedTask = current.plan.tasks[taskIndex];
    if (!task || !plannedTask) return failure("TASK_NOT_FOUND");
    const priorBatch = current.tasks.flatMap((item) => item.batches).find((item) => item.batchId === batch.batchId);
    if (priorBatch) return priorBatch.batchHash === batch.batchHash
      ? Object.freeze({ ok: true, code: "DISCOVERY_BATCH_REPLAYED", run: current })
      : failure("MALFORMED_INPUT");
    if (batch.cursor !== task.cursor || task.complete) return failure("CHECKPOINT_MISMATCH");
    const existingIds = new Set(current.tasks.flatMap((item) => item.observations.map((observation) => observation.observationId)));
    if (batch.observations.some((observation) => existingIds.has(observation.observationId))) return failure("DUPLICATE_OBSERVATION");
    if (Date.parse(batch.appendedAt) <= Date.parse(current.updatedAt)
      || batch.observations.some((observation) => Date.parse(observation.observedAt) <= Date.parse(current.updatedAt)
        || Date.parse(observation.observedAt) > Date.parse(batch.appendedAt))) return failure("INVALID_CHRONOLOGY");
    if (batch.observations.some((observation) => observation.sourceKey !== task.sourceKey)) return failure("MALFORMED_INPUT");
    const accountRefs = new Set(task.observations.map((observation) => observation.accountRef));
    for (const observation of batch.observations) {
      if (accountRefs.has(observation.accountRef)) return failure("DUPLICATE_OBSERVATION");
      accountRefs.add(observation.accountRef);
    }
    const projected = {
      accounts: accountRefs.size,
      providerRequests: task.providerRequests + batch.providerRequests,
      spendCents: task.spendCents + batch.spendCents,
    };
    const projectedTotals = {
      accounts: current.totals.accounts - task.accounts + projected.accounts,
      providerRequests: current.totals.providerRequests + batch.providerRequests,
      spendCents: current.totals.spendCents + batch.spendCents,
    };
    if (projected.accounts > plannedTask.caps.maxAccounts
      || projected.providerRequests > plannedTask.caps.maxProviderRequests
      || projected.spendCents > plannedTask.caps.maxSpendCents
      || projectedTotals.accounts > current.plan.limits.maxAccounts
      || projectedTotals.providerRequests > current.plan.limits.maxProviderRequests
      || projectedTotals.spendCents > current.plan.limits.maxSpendCents) return failure("BOUNDS_EXCEEDED");
    const receipt = Object.freeze({ batchId: batch.batchId, batchHash: batch.batchHash, cursor: batch.cursor,
      nextCursor: batch.nextCursor, complete: batch.complete, appendedAt: batch.appendedAt,
      providerRequests: batch.providerRequests, spendCents: batch.spendCents,
      observationIds: Object.freeze(batch.observations.map((observation) => observation.observationId)) });
    const updatedTask = Object.freeze({ ...task, cursor: batch.nextCursor, complete: batch.complete,
      ...projected, observations: Object.freeze([...task.observations, ...batch.observations]),
      batches: Object.freeze([...task.batches, receipt]) });
    const tasks = current.tasks.map((item, index) => index === taskIndex ? updatedTask : item);
    const event = Object.freeze({ sequence: current.events.length + 1, action: "append" as const,
      at: batch.appendedAt, reason: "Append caller-attested connector observations.",
      taskId: task.taskId, batchId: batch.batchId });
    const withoutHash = Object.freeze({ runVersion: 1 as const, runId: current.runId, tenantId, workspaceId,
      plan: current.plan, status: "running" as const, createdAt: current.createdAt, updatedAt: batch.appendedAt,
      tasks: Object.freeze(tasks), totals: totals(tasks), events: Object.freeze([...current.events, event]) });
    const run = buildRun(withoutHash);
    return run ? Object.freeze({ ok: true, code: "DISCOVERY_BATCH_APPENDED", run }) : failure("MALFORMED_INPUT");
  } catch {
    return failure("MALFORMED_INPUT");
  }
}
