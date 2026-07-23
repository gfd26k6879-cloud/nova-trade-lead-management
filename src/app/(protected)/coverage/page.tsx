import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { startRouteTiming } from "@/lib/route-timing";
import { CoverageClient } from "./coverage-client";

export const metadata: Metadata = { title: "Coverage | Nova Trade Lead Management" };

type CoverageSearchParams = { run?: string | string[] };

export default async function CoveragePage({ searchParams }: { searchParams?: CoverageSearchParams | Promise<CoverageSearchParams> }) {
  const logRouteTiming = startRouteTiming("/coverage");
  await requirePermission("crawl:manage");
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
