import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { createTestDb, seedTestRun, seedTestZip } from "./test-helpers";

let testDb: Database.Database;

vi.mock("@/lib/db/index", () => {
  return {
    getDb: () => testDb,
    generateId: () => crypto.randomUUID(),
    nowISO: () => new Date().toISOString(),
  };
});

import {
  completeWorkerRun,
  getCoverageByZip,
  getSchedulerOperationsSummary,
  getSchedulerHealth,
  markStaleWorkerRunsInterrupted,
  getSettings,
  isSchedulerWorkerEnabled,
  recomputeAllLeadQualityScores,
  startWorkerRun,
  updateLeadAiFeedback,
  updateSettings,
} from "@/lib/db/queries";
import { SCHEDULER_WORKER_METADATA, SCHEDULER_WORKER_NAMES } from "@/lib/scheduler/worker-metadata";

function insertLead(id = "lead-feedback") {
  testDb.prepare(
    `INSERT INTO leads (
      id, place_id, name, phone, categories, website_status, score, status,
      qualification_status, contactability_score, estimated_deal_value,
      ai_verification_status, ai_confidence, ai_website_viability_status, ai_found_website_url,
      quality_bucket, discovered_at, created_at, updated_at
    ) VALUES (
      ?, ?, 'Feedback Plumbing', '303-555-0100', '["plumber"]', 'none', 30, 'new',
      'qualified', 1, 3500,
      'site_found', 0.92, 'usable', 'https://wrong.example',
      'not_a_fit', '2026-05-01T10:00:00.000Z', '2026-05-01T10:00:00.000Z', '2026-05-01T10:00:00.000Z'
    )`
  ).run(id, `place-${id}`);
}

beforeEach(() => {
  testDb = createTestDb();
});

afterEach(() => {
  testDb.close();
});

describe("scheduler v2 query behavior", () => {
  it("defines operations metadata for every scheduler worker", () => {
    expect(SCHEDULER_WORKER_NAMES).toEqual(["crawl", "enrichment", "ai_verification", "artifact", "score_recompute"]);
    for (const worker of SCHEDULER_WORKER_METADATA) {
      expect(worker.endpoint).toMatch(/^\/api\//);
      expect(worker.purpose.length).toBeGreaterThan(20);
      expect(worker.externalApi.length).toBeGreaterThan(3);
      expect(worker.cadenceMinutes).toBeGreaterThan(0);
    }
  });

  it("persists scheduler toggles and reports disabled workers", async () => {
    await updateSettings({ scheduler_artifact_enabled: false });

    const settings = await getSettings();
    expect(isSchedulerWorkerEnabled(settings, "artifact")).toBe(false);
    expect(isSchedulerWorkerEnabled(settings, "ai_verification")).toBe(true);

    const health = await getSchedulerHealth();
    const artifact = health.workers.find((worker) => worker.workerName === "artifact");
    expect(artifact?.enabled).toBe(false);
    expect(artifact?.warning).toContain("Paused in Scheduler Settings");
  });

  it("persists Google discovery safety caps", async () => {
    await updateSettings({
      google_test_run_call_cap: 25.8,
      google_text_search_monthly_cap: 3200.4,
      google_enterprise_monthly_cap: 450.9,
    });

    const settings = await getSettings();
    expect(settings.google_test_run_call_cap).toBe(25);
    expect(settings.google_text_search_monthly_cap).toBe(3200);
    expect(settings.google_enterprise_monthly_cap).toBe(450);

    await updateSettings({
      google_test_run_call_cap: 0,
      google_text_search_monthly_cap: -5,
      google_enterprise_monthly_cap: 0.2,
    });

    const clamped = await getSettings();
    expect(clamped.google_test_run_call_cap).toBe(1);
    expect(clamped.google_text_search_monthly_cap).toBe(1);
    expect(clamped.google_enterprise_monthly_cap).toBe(1);
  });

  it("persists researcher AI safety caps", async () => {
    await updateSettings({
      researcher_ai_daily_run_cap: 12.8,
      researcher_ai_daily_budget_usd: 3.25,
      researcher_ai_monthly_budget_usd: 42.5,
    });

    const settings = await getSettings();
    expect(settings.researcher_ai_daily_run_cap).toBe(12);
    expect(settings.researcher_ai_daily_budget_usd).toBe(3.25);
    expect(settings.researcher_ai_monthly_budget_usd).toBe(42.5);

    await updateSettings({
      researcher_ai_daily_run_cap: 0,
      researcher_ai_daily_budget_usd: 0,
      researcher_ai_monthly_budget_usd: -5,
    });

    const clamped = await getSettings();
    expect(clamped.researcher_ai_daily_run_cap).toBe(1);
    expect(clamped.researcher_ai_daily_budget_usd).toBe(0.01);
    expect(clamped.researcher_ai_monthly_budget_usd).toBe(0.01);
  });

  it("records worker runs for operations health", async () => {
    const run = await startWorkerRun("ai_verification", "cron");
    await completeWorkerRun(run.id, "processed", { status: "processed", leadId: "lead-1" }, 200);

    const health = await getSchedulerHealth();
    const worker = health.workers.find((item) => item.workerName === "ai_verification");
    expect(worker?.lastRun?.status).toBe("processed");
    expect(worker?.lastRun?.result_json).toMatchObject({ leadId: "lead-1" });
    expect(worker?.errors24h).toBe(0);
  });

  it("marks stale worker runs interrupted without touching fresh runs", async () => {
    testDb.prepare(
      `INSERT INTO worker_runs (id, worker_name, status, trigger_source, started_at, created_at)
       VALUES (?, ?, 'running', 'cron', ?, ?)`
    ).run("stale-run", "score_recompute", "2000-01-01T00:00:00.000Z", "2000-01-01T00:00:00.000Z");
    testDb.prepare(
      `INSERT INTO worker_runs (id, worker_name, status, trigger_source, started_at, created_at)
       VALUES (?, ?, 'running', 'cron', ?, ?)`
    ).run("fresh-run", "score_recompute", new Date().toISOString(), new Date().toISOString());

    expect(await markStaleWorkerRunsInterrupted(15)).toBe(1);

    const stale = testDb.prepare("SELECT status, http_status, error, completed_at FROM worker_runs WHERE id = 'stale-run'").get() as Record<string, unknown>;
    const fresh = testDb.prepare("SELECT status, completed_at FROM worker_runs WHERE id = 'fresh-run'").get() as Record<string, unknown>;
    expect(stale.status).toBe("interrupted");
    expect(stale.http_status).toBe(599);
    expect(stale.error).toBe("Worker run interrupted or timed out before completion.");
    expect(stale.completed_at).toBeTruthy();
    expect(fresh.status).toBe("running");
    expect(fresh.completed_at).toBeNull();
  });

  it("counts interrupted worker runs as scheduler errors", async () => {
    const now = new Date().toISOString();
    testDb.prepare(
      `INSERT INTO worker_runs (id, worker_name, status, trigger_source, http_status, error, started_at, completed_at, created_at)
       VALUES (?, ?, 'interrupted', 'cron', 599, ?, ?, ?, ?)`
    ).run("interrupted-run", "score_recompute", "Worker run interrupted or timed out before completion.", now, now, now);

    const health = await getSchedulerHealth();
    const worker = health.workers.find((item) => item.workerName === "score_recompute");
    expect(worker?.lastRun?.status).toBe("interrupted");
    expect(worker?.errors24h).toBe(1);
  });

  it("recomputes only stale lead quality scores", async () => {
    insertLead("stale-score");
    insertLead("fresh-score");
    testDb.prepare(
      `UPDATE leads SET updated_at = ?, last_quality_scored_at = ? WHERE id = ?`
    ).run("2026-05-03T10:00:00.000Z", "2026-05-02T10:00:00.000Z", "stale-score");
    testDb.prepare(
      `UPDATE leads SET updated_at = ?, last_quality_scored_at = ? WHERE id = ?`
    ).run("2026-05-01T10:00:00.000Z", "2026-05-02T10:00:00.000Z", "fresh-score");

    expect(await recomputeAllLeadQualityScores(100)).toBe(1);
  });

  it("builds scheduler operations summary with zero-data cost and backlog defaults", async () => {
    const summary = await getSchedulerOperationsSummary();

    expect(summary.health.workers).toHaveLength(5);
    expect(summary.history).toHaveLength(0);
    expect(summary.costs.googleToday.cost).toBe(0);
    expect(summary.costs.googleMonth.calls).toBe(0);
    expect(summary.backlogs.aiQueue.total).toBe(0);
    expect(summary.backlogs.artifacts.businessDetail.missing).toBe(0);
    expect(summary.backlogs.scores.pending).toBe(0);
  });

  it("keeps corrected AI website findings in manual review after scoring recompute", async () => {
    insertLead();

    await updateLeadAiFeedback("lead-feedback", {
      status: "incorrect",
      correctedWebsiteUrl: "https://correct.example",
      falsePositiveReason: "AI matched a different business.",
      reviewerNotes: "Needs a human check before calling.",
    });

    const row = testDb.prepare(
      `SELECT quality_bucket, ai_recommendation, ai_website_feedback_status, ai_corrected_website_url
       FROM leads WHERE id = 'lead-feedback'`
    ).get() as Record<string, unknown>;

    expect(row.quality_bucket).toBe("needs_manual_review");
    expect(row.ai_recommendation).toBe("manual_review");
    expect(row.ai_website_feedback_status).toBe("incorrect");
    expect(row.ai_corrected_website_url).toBe("https://correct.example");
  });

  it("adds production and activity fields to the ZIP coverage ledger", async () => {
    seedTestZip(testDb, "80202", "Denver", 39.75, -104.99, "Denver");
    const runId = seedTestRun(testDb);
    testDb.prepare(
      `INSERT INTO crawl_units (
        id, crawl_run_id, zip, category, status, attempt_count, discovered_count, started_at, finished_at
      ) VALUES
        ('unit-done', ?, '80202', 'dentist', 'done', 2, 5, '2026-05-01T10:00:00.000Z', '2026-05-01T10:03:00.000Z'),
        ('unit-failed', ?, '80202', 'plumber', 'failed', 1, 0, '2026-05-01T11:00:00.000Z', '2026-05-01T11:02:00.000Z')`
    ).run(runId, runId);

    const rows = await getCoverageByZip(runId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      zip: "80202",
      total: 2,
      done: 1,
      failed: 1,
      leadsFound: 5,
      apiCalls: 3,
      lastRunAt: "2026-05-01T11:02:00.000Z",
    });
  });
});
