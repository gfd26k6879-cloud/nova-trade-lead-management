#!/usr/bin/env node
// L-01 local worker dispatcher: acquires a durable tenant worker lease through
// the restricted issuer role, calls the matching worker route with the lease
// selector, and cancels the lease. Run against a locally seeded database and a
// running app (`npm run dev` or a production `next start`) that has the same
// issuer/resolver lease URLs configured in .env.local.

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { env, exit } from "node:process";
import postgres from "postgres";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const WORKERS = Object.freeze([
  { workerName: "crawl", action: "crawl:process", path: "/api/crawl/process-next" },
  { workerName: "enrichment", action: "enrichment:process", path: "/api/crawl/enrich-next" },
  { workerName: "ai_verification", action: "ai_verification:process", path: "/api/ai/verify-next" },
  { workerName: "artifact", action: "artifact:process", path: "/api/ai/artifacts/process-next" },
  { workerName: "score_recompute", action: "score_recompute:recompute", path: "/api/scores/recompute-stale" },
]);

const ACCEPTABLE_STATUSES = new Set(["idle", "processed", "done", "disabled", "ok"]);

function fail(message) {
  console.error(`[run-local-workers] ${message}`);
  exit(1);
}

function requiredEnv(name) {
  const value = env[name]?.trim();
  if (!value) fail(`${name} is required`);
  return value;
}

function uuid(name, value) {
  if (!UUID_PATTERN.test(value)) fail(`${name} must be a UUID, got ${value}`);
  return value;
}

function hashSelector(selector) {
  return createHash("sha256").update(selector, "utf8").digest("hex");
}

const ACQUIRE_SQL = `SELECT
  kind, selector_hash, tenant_id::text AS "tenantId", workspace_id::text AS "workspaceId",
  job_id::text AS "jobId", run_id::text AS "runId", lease_id::text AS "leaseId",
  lease_generation::text AS "leaseGeneration", worker_name AS "workerName", action,
  not_before::text AS "notBefore", expires_at::text AS "expiresAt", correlation_id AS "correlationId"
FROM public.novatrade_acquire_tenant_worker_lease($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`;

const CANCEL_SQL = `SELECT kind
FROM public.novatrade_cancel_tenant_worker_lease($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`;

async function acquireLease(issuerUrl, input, selector) {
  const sql = postgres(issuerUrl, { max: 1, prepare: false, onnotice: () => undefined });
  try {
    const [row] = await sql.unsafe(ACQUIRE_SQL, [
      hashSelector(selector),
      input.tenantId, input.workspaceId, input.jobId, input.runId,
      input.leaseId, String(input.leaseGeneration), input.workerName, input.action,
      input.notBefore, input.expiresAt, input.correlationId,
    ]);
    return row && row.kind === "created" ? row : null;
  } finally {
    await sql.end({ timeout: 1 });
  }
}

async function cancelLease(issuerUrl, input, selector) {
  const sql = postgres(issuerUrl, { max: 1, prepare: false, onnotice: () => undefined });
  try {
    await sql.unsafe(CANCEL_SQL, [
      hashSelector(selector),
      input.tenantId, input.workspaceId, input.jobId, input.runId,
      input.leaseId, String(input.leaseGeneration), input.workerName, input.action,
      input.notBefore, input.expiresAt, input.correlationId,
    ]);
  } catch (error) {
    console.error(`[run-local-workers] lease cancellation failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await sql.end({ timeout: 1 });
  }
}

async function dispatch(worker, options) {
  const now = Date.now();
  const input = {
    tenantId: options.tenantId,
    workspaceId: options.workspaceId,
    jobId: randomUUID(),
    runId: randomUUID(),
    leaseId: randomUUID(),
    leaseGeneration: 1,
    workerName: worker.workerName,
    action: worker.action,
    notBefore: new Date(now - 5_000).toISOString(),
    expiresAt: new Date(now + options.leaseTtlMs).toISOString(),
    correlationId: `local-dispatch:${worker.workerName}`,
  };
  const selector = randomBytes(32).toString("base64url");

  let lease;
  try {
    lease = await acquireLease(options.issuerUrl, input, selector);
  } catch (error) {
    return { worker, ok: false, phase: "acquire", detail: error instanceof Error ? error.message : String(error) };
  }
  if (!lease) return { worker, ok: false, phase: "acquire", detail: "lease was not created" };

  try {
    const headers = { "x-internal-worker-selector": selector, "content-type": "application/json" };
    if (options.cronSecret) headers.authorization = `Bearer ${options.cronSecret}`;
    const response = await fetch(`${options.baseUrl}${worker.path}`, {
      method: "POST",
      headers,
      body: "{}",
      signal: AbortSignal.timeout(options.requestTimeoutMs),
    });
    let body;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    const status = typeof body?.status === "string" ? body.status : null;
    const acceptable = response.ok && (status === null || ACCEPTABLE_STATUSES.has(status));
    return {
      worker,
      ok: acceptable,
      httpStatus: response.status,
      body,
      phase: acceptable ? "done" : "route",
    };
  } catch (error) {
    return { worker, ok: false, phase: "route", detail: error instanceof Error ? error.message : String(error) };
  } finally {
    await cancelLease(options.issuerUrl, input, selector);
  }
}

async function main() {
  const issuerUrl = requiredEnv("TENANT_WORKER_LEASE_ISSUER_DATABASE_URL");
  const baseUrl = (env.WORKER_ROUTE_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/+$/u, "");
  const tenantId = uuid("LOCAL_TENANT_ID", env.LOCAL_TENANT_ID ?? "10000000-0000-4000-8000-000000000001");
  const workspaceId = uuid("LOCAL_WORKSPACE_ID", env.LOCAL_WORKSPACE_ID ?? "11000000-0000-4000-8000-000000000001");
  const cronSecret = env.WORKER_CRON_SECRET?.trim();
  const leaseTtlMs = Number(env.LOCAL_WORKER_LEASE_TTL_MS ?? 90_000);
  const requestTimeoutMs = Number(env.LOCAL_WORKER_REQUEST_TIMEOUT_MS ?? 70_000);
  if (!Number.isSafeInteger(leaseTtlMs) || leaseTtlMs < 10_000) fail("LOCAL_WORKER_LEASE_TTL_MS must be a number of milliseconds");
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 5_000) fail("LOCAL_WORKER_REQUEST_TIMEOUT_MS must be a number of milliseconds");

  console.log(`[run-local-workers] dispatching ${WORKERS.length} workers to ${baseUrl} for tenant ${tenantId} (workspace ${workspaceId})`);
  const results = [];
  for (const worker of WORKERS) {
    results.push(await dispatch(worker, {
      issuerUrl, baseUrl, tenantId, workspaceId, cronSecret, leaseTtlMs, requestTimeoutMs,
    }));
  }

  let failed = 0;
  for (const result of results) {
    const label = `${result.worker.workerName} ${result.worker.path}`;
    if (result.ok) {
      console.log(`  ok   ${label} -> HTTP ${result.httpStatus} ${JSON.stringify(result.body ?? {})}`);
    } else {
      failed += 1;
      console.error(`  FAIL ${label} phase=${result.phase} ${result.detail ?? `HTTP ${result.httpStatus} ${JSON.stringify(result.body ?? {})}`}`);
    }
  }
  exit(failed === 0 ? 0 : 1);
}

void main();
