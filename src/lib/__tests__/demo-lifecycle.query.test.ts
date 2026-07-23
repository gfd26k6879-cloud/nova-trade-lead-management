import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { createTestDb } from "./test-helpers";

let testDb: Database.Database;
const NOW = "2026-06-16T12:00:00.000Z";

vi.mock("@/lib/db/index", () => ({
  getDb: () => testDb,
  generateId: () => crypto.randomUUID(),
  nowISO: () => NOW,
  withDbTransaction: async <T>(fn: () => Promise<T>) => fn(),
}));

import {
  createDemoForLead,
  getPublishedDemoBySlug,
  publishDemoForLead,
  recordDemoView,
  revokeDemoForLead,
  unpublishDemoForLead,
} from "@/lib/db/queries";

beforeEach(() => {
  testDb = createTestDb();
  testDb.prepare(
    `INSERT INTO leads (
      id, place_id, name, phone, website_status, maps_uri, categories, score,
      selling_niche, recommended_offer, quality_reason
    ) VALUES (
      'lead-1', 'place-1', 'Demo Business', '303-555-0100', 'none',
      'https://maps.example/demo', '["plumber"]', 12, 'home_services',
      'starter_site', 'No clear website presence.'
    )`,
  ).run();
});

afterEach(() => {
  testDb.close();
});

describe("demo lifecycle", () => {
  it("creates demos as drafts by default", async () => {
    const demo = await createDemoForLead("lead-1");

    expect(demo?.is_published).toBe(false);
    expect(await getPublishedDemoBySlug(demo!.slug)).toBeNull();
  });

  it("publishes, records public views, and unpublishes demos", async () => {
    const draft = await createDemoForLead("lead-1");
    const published = await publishDemoForLead("lead-1", "admin-1");

    expect(published?.id).toBe(draft?.id);
    expect(published?.is_published).toBe(true);
    expect(published?.published_by_user_id).toBe("admin-1");
    expect(await getPublishedDemoBySlug(published!.slug)).not.toBeNull();

    await recordDemoView(published!.id);
    const viewed = testDb.prepare("SELECT view_count, last_viewed_at FROM demos WHERE id = ?").get(published!.id) as Record<string, unknown>;
    expect(viewed.view_count).toBe(1);
    expect(viewed.last_viewed_at).toBe(NOW);

    const unpublished = await unpublishDemoForLead("lead-1", "admin-1");
    expect(unpublished?.is_published).toBe(false);
    expect(await getPublishedDemoBySlug(unpublished!.slug)).toBeNull();
  });

  it("revokes published demos from public access", async () => {
    const published = await publishDemoForLead("lead-1", "admin-1");
    const revoked = await revokeDemoForLead("lead-1", "admin-1", "Owner requested removal");

    expect(revoked?.is_published).toBe(false);
    expect(revoked?.revoked_at).toBe(NOW);
    expect(revoked?.revoke_reason).toBe("Owner requested removal");
    expect(await getPublishedDemoBySlug(published!.slug)).toBeNull();
  });
});
