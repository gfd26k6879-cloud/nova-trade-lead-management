import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { createTestDb } from "./test-helpers";

let testDb: Database.Database;

vi.mock("@/lib/db/index", () => {
  return {
    getDb: () => testDb,
    generateId: () => crypto.randomUUID(),
    nowISO: () => new Date().toISOString(),
    withDbTransaction: async <T>(fn: () => Promise<T>) => fn(),
  };
});

import {
  createLeadAiArtifactJob,
  getLeadAiArtifacts,
  leaseLeadAiArtifactJobById,
  getNextLeadAiArtifactJob,
  leaseNextLeadAiArtifactJob,
  markLeadAiArtifactComplete,
  markLeadAiArtifactRetry,
  markLeadAiArtifactRunning,
} from "@/lib/db/queries";

function insertLead(id = "lead-1") {
  testDb.prepare(
    `INSERT INTO leads (
      id, place_id, name, address, phone, categories, website_status, score, status,
      qualification_status, contactability_score, estimated_deal_value,
      discovered_at, created_at, updated_at
    ) VALUES (
      ?, ?, 'Gateway Park Dental', '123 Main St, Denver, CO', '303-555-0100', '["dentist"]', 'none', 12, 'new',
      'qualified', 1, 4500,
      '2026-05-01T10:00:00.000Z', '2026-05-01T10:00:00.000Z', '2026-05-01T10:00:00.000Z'
    )`
  ).run(id, `place-${id}`);
}

beforeEach(() => {
  testDb = createTestDb();
  insertLead();
});

afterEach(() => {
  testDb.close();
});

describe("lead AI artifact queries", () => {
  it("queues, leases, completes, and preserves immutable history", async () => {
    const first = await createLeadAiArtifactJob({
      lead_id: "lead-1",
      artifact_type: "business_detail",
      model: "gpt-5.4-mini",
      input_hash: "hash-1",
      prompt_version: "lead-intelligence-v1",
      requested_by_user_id: "researcher-1",
      request_source: "researcher_pitch_pack",
    });
    const second = await createLeadAiArtifactJob({
      lead_id: "lead-1",
      artifact_type: "business_detail",
      model: "gpt-5.4-mini",
      input_hash: "hash-2",
      prompt_version: "lead-intelligence-v1",
    });

    const job = await getNextLeadAiArtifactJob();
    expect(job?.id).toBe(first.id);

    await markLeadAiArtifactRunning(first.id);
    await markLeadAiArtifactComplete(first.id, {
      content_json: { artifact_type: "business_detail", website_generation_prompt: "Build this site." },
      sources_json: [],
      confidence: 0.8,
      usage_input_tokens: 100,
      usage_output_tokens: 80,
      estimated_cost: 0.01,
    });

    const artifacts = await getLeadAiArtifacts("lead-1");
    expect(artifacts).toHaveLength(2);
    expect(artifacts.map((artifact) => artifact.id)).toContain(second.id);
    expect(artifacts.find((artifact) => artifact.id === first.id)?.status).toBe("complete");
    expect(artifacts.find((artifact) => artifact.id === first.id)?.requested_by_user_id).toBe("researcher-1");
    expect(artifacts.find((artifact) => artifact.id === first.id)?.request_source).toBe("researcher_pitch_pack");
  });

  it("atomically leases artifact jobs and schedules retries", async () => {
    const first = await createLeadAiArtifactJob({
      lead_id: "lead-1",
      artifact_type: "business_detail",
      model: "gpt-5.4-mini",
      input_hash: "hash-1",
      prompt_version: "lead-intelligence-v1",
    });
    await createLeadAiArtifactJob({
      lead_id: "lead-1",
      artifact_type: "competitive_report",
      model: "gpt-5.4-mini",
      input_hash: "hash-2",
      prompt_version: "lead-intelligence-v1",
    });

    const leased = await leaseNextLeadAiArtifactJob(3);
    expect(leased?.id).toBe(first.id);
    expect(leased?.attempt_count).toBe(1);

    const retry = await markLeadAiArtifactRetry(first.id, "budget exhausted", 3);
    expect(retry.status).toBe("queued");
    expect(retry.nextRetryAt).toBeTruthy();

    const retryingRow = testDb.prepare("SELECT status, last_error, next_retry_at FROM lead_ai_artifacts WHERE id = ?").get(first.id) as Record<string, unknown>;
    expect(retryingRow.status).toBe("queued");
    expect(retryingRow.last_error).toBe("budget exhausted");
    expect(retryingRow.next_retry_at).toBeTruthy();
  });

  it("leases a specific researcher artifact job without taking the global queue", async () => {
    await createLeadAiArtifactJob({
      lead_id: "lead-1",
      artifact_type: "business_detail",
      model: "gpt-5.4-mini",
      input_hash: "hash-first",
      prompt_version: "lead-intelligence-v1",
    });
    const target = await createLeadAiArtifactJob({
      lead_id: "lead-1",
      artifact_type: "competitive_report",
      model: "gpt-5.4-mini",
      input_hash: "hash-target",
      prompt_version: "lead-intelligence-v1",
      requested_by_user_id: "researcher-1",
      request_source: "researcher_pitch_pack",
    });

    const leased = await leaseLeadAiArtifactJobById(target.id, 3);

    expect(leased?.id).toBe(target.id);
    expect(leased?.attempt_count).toBe(1);
    const globalFirst = await getNextLeadAiArtifactJob();
    expect(globalFirst?.input_hash).toBe("hash-first");
  });
});
