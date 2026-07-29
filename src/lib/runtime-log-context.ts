import { getTenantContext } from "@/lib/tenancy/context";
import { getWorkerTenantContext } from "@/lib/tenancy/worker-context";

export type RuntimeLogScopeKind = "tenant" | "worker" | "platform" | "legacy_unscoped";
export type ExplicitRuntimeLogScope = "platform" | "legacy_unscoped";

export interface RuntimeLogContext {
  readonly scopeKind: RuntimeLogScopeKind;
  /** Raw tenancy selectors are permitted here only because this is a controlled internal envelope. */
  readonly tenantId: string | null;
  readonly workspaceId: string | null;
  readonly correlationId: string | null;
  readonly jobId: string | null;
  readonly runId: string | null;
  readonly leaseId: string | null;
  readonly leaseGeneration: number | null;
  readonly workerName: string | null;
  readonly workerAction: string | null;
  readonly sourcePrincipalKind: "cron" | "session" | null;
  readonly vercelEnv: string | null;
  readonly vercelUrl: string | null;
  readonly gitRef: string | null;
  readonly gitSha: string | null;
}

export class RuntimeLogContextError extends Error {
  constructor() {
    super("The runtime log context is invalid or conflicting");
    this.name = "RuntimeLogContextError";
  }
}

const MAX_ENV_VALUE_LENGTH = 256;

function readEnvironmentValue(...names: string[]): string | null {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (!value) continue;
    if (value.length > MAX_ENV_VALUE_LENGTH || /[\u0000-\u001f\u007f]/.test(value)) {
      return null;
    }
    return value;
  }
  return null;
}

function readRuntimeEnvironment(): Pick<RuntimeLogContext, "vercelEnv" | "vercelUrl" | "gitRef" | "gitSha"> {
  const vercelUrl = readEnvironmentValue("VERCEL_URL");
  return {
    vercelEnv: readEnvironmentValue("VERCEL_ENV", "VERCEL_TARGET_ENV"),
    vercelUrl: vercelUrl ? stripUrlQuery(vercelUrl) : null,
    gitRef: readEnvironmentValue("VERCEL_GIT_COMMIT_REF"),
    gitSha: readEnvironmentValue("VERCEL_GIT_COMMIT_SHA")?.slice(0, 12) ?? null,
  };
}

function stripUrlQuery(value: string): string {
  if (!value.includes("://")) return value.split(/[?#]/, 1)[0] || "/";
  try {
    const parsed = new URL(value, "https://runtime.invalid");
    const path = parsed.pathname || "/";
    return `${parsed.origin}${path}`;
  } catch {
    return value.split(/[?#]/, 1)[0] || "/";
  }
}

function sameWorkerTenantScope(
  tenantId: string,
  workspaceId: string | null,
  correlationId: string,
  worker: ReturnType<typeof getWorkerTenantContext>,
): boolean {
  return Boolean(
    worker &&
    worker.tenantId === tenantId &&
    worker.workspaceId === workspaceId &&
    worker.correlationId === correlationId,
  );
}

/**
 * Reads only the accepted T-014/T-017 async-local contexts. The returned
 * envelope is a fresh frozen object, so callers cannot mutate a sibling
 * request's context or override it with event metadata.
 */
export function getRuntimeLogContext(explicitScope?: ExplicitRuntimeLogScope): RuntimeLogContext {
  const tenant = getTenantContext();
  const worker = getWorkerTenantContext();

  if (tenant && worker && !sameWorkerTenantScope(tenant.tenantId, tenant.workspaceId, tenant.correlationId, worker)) {
    throw new RuntimeLogContextError();
  }
  if (explicitScope && (tenant || worker)) throw new RuntimeLogContextError();

  const environment = readRuntimeEnvironment();
  if (worker) {
    return Object.freeze({
      ...environment,
      scopeKind: "worker" as const,
      tenantId: worker.tenantId,
      workspaceId: worker.workspaceId,
      correlationId: worker.correlationId,
      jobId: worker.jobId,
      runId: worker.runId,
      leaseId: worker.leaseId,
      leaseGeneration: worker.leaseGeneration,
      workerName: worker.workerName,
      workerAction: worker.action,
      sourcePrincipalKind: worker.sourcePrincipalKind,
    });
  }
  if (tenant) {
    return Object.freeze({
      ...environment,
      scopeKind: "tenant" as const,
      tenantId: tenant.tenantId,
      workspaceId: tenant.workspaceId,
      correlationId: tenant.correlationId,
      jobId: null,
      runId: null,
      leaseId: null,
      leaseGeneration: null,
      workerName: null,
      workerAction: null,
      sourcePrincipalKind: null,
    });
  }

  return Object.freeze({
    ...environment,
    scopeKind: explicitScope ?? "legacy_unscoped",
    tenantId: null,
    workspaceId: null,
    correlationId: null,
    jobId: null,
    runId: null,
    leaseId: null,
    leaseGeneration: null,
    workerName: null,
    workerAction: null,
    sourcePrincipalKind: null,
  });
}
