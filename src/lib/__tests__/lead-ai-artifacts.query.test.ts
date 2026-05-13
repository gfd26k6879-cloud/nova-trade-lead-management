import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { createTestDb } from "./test-helpers";

let testDb: Database.Database;

vi.mock("@/lib/db/index", () => {
  return {
    getDb: () => testDb,
    generateId: () => crypto.randomUUID(),
    nowISO: () => new Date().toISOString(),
  };
});

import {
  createLeadAiArtifactJob,
  getLeadAiArtifacts,
  getNextLeadAiArtifactJob,
  markLeadAiArtifactComplete,
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
  });
});
