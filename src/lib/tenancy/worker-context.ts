import { AsyncLocalStorage } from "node:async_hooks";
import type { SchedulerWorkerName } from "@/lib/scheduler/worker-metadata";
import type { InternalWorkerAction, TenantWorkerAuthorization } from "@/lib/internal-worker-auth";

export type WorkerPrincipalKind = "cron" | "session";

export interface WorkerTenantContext {
  readonly tenantId: string;
  readonly workspaceId: string | null;
  readonly jobId: string;
  readonly runId: string;
  readonly leaseId: string;
  readonly leaseGeneration: number;
  readonly workerName: SchedulerWorkerName;
  readonly action: InternalWorkerAction;
  readonly sourcePrincipalKind: WorkerPrincipalKind;
  readonly correlationId: string;
}

export class WorkerContextError extends Error {
  code: "WORKER_CONTEXT_INVALID" | "WORKER_CONTEXT_REQUIRED" = "WORKER_CONTEXT_INVALID";

  constructor(message = "The worker context is invalid") {
    super(message);
    this.name = "WorkerContextError";
  }
}

export class WorkerContextRequiredError extends WorkerContextError {
  constructor() {
    super("A worker tenant context is required");
    this.name = "WorkerContextRequiredError";
    this.code = "WORKER_CONTEXT_REQUIRED";
  }
}

const workerContextStorage = new AsyncLocalStorage<WorkerTenantContext>();

function freezeContext(context: WorkerTenantContext): WorkerTenantContext {
  return Object.freeze({ ...context });
}

function sameContext(left: WorkerTenantContext, right: WorkerTenantContext): boolean {
  return left.tenantId === right.tenantId &&
    left.workspaceId === right.workspaceId &&
    left.jobId === right.jobId &&
    left.runId === right.runId &&
    left.leaseId === right.leaseId &&
    left.leaseGeneration === right.leaseGeneration &&
    left.workerName === right.workerName &&
    left.action === right.action &&
    left.sourcePrincipalKind === right.sourcePrincipalKind &&
    left.correlationId === right.correlationId;
}

/** Installs only a server-validated worker scope for this callback lifetime. */
export function runWithWorkerTenantContext<T>(
  authorization: TenantWorkerAuthorization,
  callback: () => T,
): T {
  if (typeof callback !== "function") throw new WorkerContextError();

  const context = freezeContext(authorization.context);
  const current = workerContextStorage.getStore();
  if (current && !sameContext(current, context)) throw new WorkerContextError("The worker context conflicts with the active context");

  return workerContextStorage.run(current ?? context, callback);
}

export function getWorkerTenantContext(): WorkerTenantContext | null {
  return workerContextStorage.getStore() ?? null;
}

export function requireWorkerTenantContext(): WorkerTenantContext {
  const context = getWorkerTenantContext();
  if (!context) throw new WorkerContextRequiredError();
  return context;
}

/** Fails closed if a task tries to continue under a different authorized scope. */
export function assertWorkerTenantContext(expected: WorkerTenantContext): WorkerTenantContext {
  const current = requireWorkerTenantContext();
  if (!sameContext(current, expected)) throw new WorkerContextError("The worker context changed during execution");
  return current;
}
