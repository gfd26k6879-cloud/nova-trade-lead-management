import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import {
  ensureDbReady,
  getActiveCrawlRun,
  getCoverageByZip,
  getCoverageByCounty,
  getCoverageByState,
  getCrawlProgress,
  getCrawlUnitPreview,
  getLatestCrawlRun,
  getRunGeographyProgress,
} from "@/lib/db/queries";
import { CoverageClient } from "./coverage-client";

export const metadata: Metadata = { title: "Coverage | NoSite Leads" };

export default async function CoveragePage() {
  await requirePermission("crawl:manage");
  await ensureDbReady();
  const run = (await getActiveCrawlRun()) ?? (await getLatestCrawlRun());
  const coverage = run ? await getCoverageByZip(run.id) : [];
  const countyCoverage = run ? await getCoverageByCounty(run.id) : [];
  const stateCoverage = run ? await getCoverageByState(run.id) : [];
  const progress = run ? await getCrawlProgress(run.id) : null;
  const unitPreview = run ? await getCrawlUnitPreview(run.id, 80) : [];
  const geography = run ? await getRunGeographyProgress(run.id) : null;

  return (
    <CoverageClient
      coverage={coverage}
      countyCoverage={countyCoverage}
      stateCoverage={stateCoverage}
      run={run ? {
        id: run.id,
        status: run.status,
        started_at: run.started_at,
        created_at: run.created_at,
        ended_at: run.ended_at,
        categories: run.categories,
        discovered_count: run.discovered_count,
        api_calls_used: run.api_calls_used,
        last_error: run.last_error,
      } : null}
      progress={progress}
      geography={geography}
      unitPreview={unitPreview}
    />
  );
}
