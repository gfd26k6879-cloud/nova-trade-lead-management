import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import {
  ensureDbReady,
  getCoverageByZip,
  getCoverageByCounty,
  getCoverageByState,
  getLatestCrawlRun,
} from "@/lib/db/queries";
import { CoverageClient } from "./coverage-client";

export const metadata: Metadata = { title: "Coverage | NoSite Leads" };

export default async function CoveragePage() {
  await requirePermission("crawl:manage");
  await ensureDbReady();
  const run = await getLatestCrawlRun();
  const coverage = run ? await getCoverageByZip(run.id) : [];
  const countyCoverage = run ? await getCoverageByCounty(run.id) : [];
  const stateCoverage = run ? await getCoverageByState(run.id) : [];

  return (
    <CoverageClient
      coverage={coverage}
      countyCoverage={countyCoverage}
      stateCoverage={stateCoverage}
      runId={run?.id ?? null}
      runStatus={run?.status ?? null}
    />
  );
}
