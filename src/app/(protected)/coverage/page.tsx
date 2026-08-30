import type { Metadata } from "next";
import { getTenantSession, requirePermission } from "@/lib/auth";
import { startRouteTiming } from "@/lib/route-timing";
import { assertTenantPermission } from "@/lib/tenancy/authorize";
import { CoverageClient } from "./coverage-client";

export const metadata: Metadata = { title: "Coverage | Nova Trade Lead Management" };

type CoverageSearchParams = { run?: string | string[] };

export default async function CoveragePage({ searchParams }: { searchParams?: CoverageSearchParams | Promise<CoverageSearchParams> }) {
  const logRouteTiming = startRouteTiming("/coverage");
  const legacySession = await requirePermission("crawl:manage");
  let tenantSession: Awaited<ReturnType<typeof getTenantSession>>;
  try {
    tenantSession = await getTenantSession({});
  } catch {
    logRouteTiming(403, { reason: "tenant_scope_unavailable" });
    return <CoverageUnavailable />;
  }

  if (
    !tenantSession
    || tenantSession.userId !== legacySession.userId
    || tenantSession.workspaceId !== null
  ) {
    logRouteTiming(403, { reason: "tenant_scope_unavailable" });
    return <CoverageUnavailable />;
  }

  try {
    await assertTenantPermission(tenantSession, "source:review", { action: "coverage.page.read" });
  } catch {
    logRouteTiming(403, { reason: "tenant_scope_unavailable" });
    return <CoverageUnavailable />;
  }

  const params = await Promise.resolve(searchParams ?? {});
  const selectedRunId = Array.isArray(params.run) ? params.run[0] : params.run ?? null;
  logRouteTiming(200, { mode: "fast_shell" });

  return (
    <CoverageClient
      key={selectedRunId ?? "default"}
      selectedRunId={selectedRunId}
      markets={[]}
      cells={[]}
      discoveryItems={[]}
      loadWarnings={[]}
      run={null}
      progress={null}
      geography={null}
      unitPreview={[]}
    />
  );
}

function CoverageUnavailable() {
  return (
    <section className="glass rounded-3xl p-8" role="alert">
      <div className="max-w-2xl">
        <p className="section-label">Coverage temporarily unavailable</p>
        <h1 className="mt-3 text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Coverage access could not be established.
        </h1>
        <p className="mt-3 text-sm leading-6" style={{ color: "var(--text-secondary)" }}>
          No source, worker, or queue data was requested. Reload the workspace to try again.
        </p>
      </div>
    </section>
  );
}
