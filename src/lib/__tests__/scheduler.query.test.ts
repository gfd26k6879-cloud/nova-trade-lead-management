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
  getSettings,
  isSchedulerWorkerEnabled,
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

  it("records worker runs for operations health", async () => {
    const run = await startWorkerRun("ai_verification", "cron");
    await completeWorkerRun(run.id, "processed", { status: "processed", leadId: "lead-1" }, 200);

    const health = await getSchedulerHealth();
    const worker = health.workers.find((item) => item.workerName === "ai_verification");
    expect(worker?.lastRun?.status).toBe("processed");
    expect(worker?.lastRun?.result_json).toMatchObject({ leadId: "lead-1" });
    expect(worker?.errors24h).toBe(0);
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
