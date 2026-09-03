import { describe, expect, it } from "vitest";
import {
  assertWorkerTenantContext,
  getWorkerTenantContext,
  requireWorkerTenantContext,
  runWithWorkerTenantContext,
  WorkerContextError,
  WorkerContextRequiredError,
} from "@/lib/tenancy/worker-context";
import type { TenantWorkerAuthorization } from "@/lib/internal-worker-auth";

const BASE = {
  workspaceId: null,
  jobId: "20000000-0000-4000-8000-000000000001",
  runId: "30000000-0000-4000-8000-000000000001",
  leaseId: "40000000-0000-4000-8000-000000000001",
  leaseGeneration: 1,
  workerName: "crawl" as const,
  action: "crawl:process" as const,
  sourcePrincipalKind: "cron" as const,
  correlationId: "corr-worker",
};

function authorization(tenantId: string, workspaceId: string | null = null): TenantWorkerAuthorization {
  return {
    source: "cron",
    context: { ...BASE, tenantId, workspaceId },
  };
}

describe("worker tenant context", () => {
  it("stores only the frozen worker scope and cleans up after success", () => {
    let observed: unknown;
    runWithWorkerTenantContext(authorization("00000000-0000-4000-8000-000000000001"), () => {
      observed = requireWorkerTenantContext();
      expect(Object.isFrozen(observed)).toBe(true);
    });

    expect(observed).toMatchObject({ tenantId: "00000000-0000-4000-8000-000000000001", workerName: "crawl" });
    expect(getWorkerTenantContext()).toBeNull();
  });

  it("cleans up after a synchronous throw, async rejection, and nested task failure", async () => {
    expect(() => runWithWorkerTenantContext(authorization("00000000-0000-4000-8000-000000000001"), () => {
      throw new Error("task failed");
    })).toThrow("task failed");
    expect(getWorkerTenantContext()).toBeNull();

    await expect(runWithWorkerTenantContext(authorization("00000000-0000-4000-8000-000000000001"), async () => {
      await Promise.resolve();
      throw new Error("async task failed");
    })).rejects.toThrow("async task failed");
    expect(getWorkerTenantContext()).toBeNull();
  });

  it("prevents a task from switching scope and fails when no context exists", () => {
    expect(() => requireWorkerTenantContext()).toThrow(WorkerContextRequiredError);
    const first = authorization("00000000-0000-4000-8000-000000000001");
    const second = authorization("00000000-0000-4000-8000-000000000002");
    expect(() => runWithWorkerTenantContext(first, () => runWithWorkerTenantContext(second, () => undefined)))
      .toThrow(WorkerContextError);

    runWithWorkerTenantContext(first, () => {
      expect(() => assertWorkerTenantContext({ ...first.context, tenantId: second.context.tenantId }))
        .toThrow(WorkerContextError);
    });
  });

  it("isolates concurrent tenant A and tenant B callbacks", async () => {
    const results = await Promise.all([
      runWithWorkerTenantContext(authorization("00000000-0000-4000-8000-000000000001"), async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return requireWorkerTenantContext().tenantId;
      }),
      runWithWorkerTenantContext(authorization("00000000-0000-4000-8000-000000000002"), async () => {
        await Promise.resolve();
        return requireWorkerTenantContext().tenantId;
      }),
    ]);

    expect(results).toEqual([
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
    ]);
    expect(getWorkerTenantContext()).toBeNull();
  });
});
