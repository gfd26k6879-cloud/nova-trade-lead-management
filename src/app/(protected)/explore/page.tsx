import type { Metadata } from "next";
import Link from "next/link";
import { getTenantSession, requirePermission } from "@/lib/auth";
import { isDbStatementTimeoutError, isTransientDbError, withDbStatementTimeout } from "@/lib/db/index";
import { ensureDbReady, getBusinessTypeCounts, getLeads, getScoreBandThresholds } from "@/lib/db/queries";
import { DEFAULT_MAP_POINT_LIMIT, buildExploreQueryState, type ExploreParams } from "@/lib/explore-filters";
import { constrainExploreFiltersForSession } from "@/lib/lead-access";
import { startRouteTiming } from "@/lib/route-timing";
import { ExploreClient } from "./explore-client";

export const metadata: Metadata = { title: "Lead Explorer | Nova Trade Lead Management" };

interface Props {
  searchParams: Promise<ExploreParams>;
}

export default async function ExplorePage({ searchParams }: Props) {
const logRouteTiming = startRouteTiming("/explore");
  const session = await requirePermission("view:workspace");
  const tenantSession = await getTenantSession({});
  const mapScope = tenantSession?.userId === session.userId
    ? { tenantId: tenantSession.tenantId, workspaceId: tenantSession.workspaceId }
    : null;
  const params = await searchParams;
  const queryState = buildExploreQueryState(params);
  const filters = constrainExploreFiltersForSession(session, queryState.filters);
  const { view, mode } = queryState;
  let loaded: {
    scoreThresholds: Awaited<ReturnType<typeof getScoreBandThresholds>>;
    businessTypeCounts: Awaited<ReturnType<typeof getBusinessTypeCounts>>;
    result: Awaited<ReturnType<typeof getLeads>>;
  } | null = null;
  let failureReason: ReturnType<typeof classifyExploreLoadFailure> | null = null;

  try {
    const { scoreThresholds, businessTypeCounts, result } = await withDbStatementTimeout(10_000, async () => {
      await ensureDbReady();
      const scoreThresholds = await getScoreBandThresholds();
      const businessTypeCounts = await getBusinessTypeCounts(filters);
      const result = await getLeads(filters);
      return { scoreThresholds, businessTypeCounts, result };
    });
    loaded = { scoreThresholds, businessTypeCounts, result };
  } catch (error) {
    failureReason = classifyExploreLoadFailure(error);
    logRouteTiming(503, { reason: failureReason, error: getErrorMessage(error) });
  }

  if (!loaded) {
    return <ExploreUnavailable reason={failureReason ?? "explore_load_error"} />;
  }

  logRouteTiming(200);

  return (
    <ExploreClient
      leads={loaded.result.leads}
      total={loaded.result.total}
      mapPoints={[]}
      totalMapped={0}
      mapPointLimit={DEFAULT_MAP_POINT_LIMIT}
      zipCoverage={[]}
      filters={{ ...filters, view, map: params.map, geo: params.geo, mode, archived: params.archived, includeExcluded: params.includeExcluded }}
      scoreThresholds={loaded.scoreThresholds}
      businessTypeCounts={loaded.businessTypeCounts}
      currentUser={{ userId: session.userId, email: session.email, role: session.role }}
      googleMapsApiKey={null}
      mapScope={mapScope}
    />
  );
}

export function classifyExploreLoadFailure(error: unknown): "db_statement_timeout" | "transient_db_error" | "explore_load_error" {
  if (isDbStatementTimeoutError(error)) return "db_statement_timeout";
  if (isTransientDbError(error)) return "transient_db_error";
  return "explore_load_error";
}

function ExploreUnavailable({ reason }: { reason: string }) {
  return (
    <section className="glass rounded-3xl p-8">
      <div className="max-w-2xl">
        <p className="section-label">Explore temporarily unavailable</p>
        <h1 className="mt-3 text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Lead Explorer is taking too long to load.
        </h1>
        <p className="mt-3 text-sm leading-6" style={{ color: "var(--text-secondary)" }}>
          Your account is signed in, but the lead inventory read did not finish fast enough. The rest of the workspace is still available.
        </p>
        <p className="mt-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
          Diagnostic reason: {reason}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/explore" className="btn-primary text-sm">Retry Explore</Link>
          <Link href="/queue" className="btn-glass text-sm">Go to Workbench</Link>
          <Link href="/leads" className="btn-glass text-sm">Open All Leads</Link>
        </div>
      </div>
    </section>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
