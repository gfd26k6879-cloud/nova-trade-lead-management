import Database from "better-sqlite3";
import { SCHEMA_SQL } from "@/lib/db/schema";
import type { PlaceResult, TextSearchResponse } from "@/lib/google-places";

export function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  return db;
}

export function seedTestZip(
  db: Database.Database,
  zip = "80202",
  city = "Denver",
  lat = 39.75,
  lng = -104.99,
  county = "Denver",
): void {
  db.prepare("INSERT OR IGNORE INTO zip_codes (zip, city, state, county, lat, lng) VALUES (?, ?, 'CO', ?, ?, ?)")
    .run(zip, city, county, lat, lng);
}

export function seedTestRun(db: Database.Database, opts: { id?: string; status?: string } = {}): string {
  const id = opts.id ?? "run-1";
  db.prepare("INSERT INTO crawl_runs (id, status, categories) VALUES (?, ?, '[]')").run(id, opts.status ?? "running");
  return id;
}

export function seedTestUnit(
  db: Database.Database,
  opts: { id?: string; runId?: string; zip?: string; category?: string; nextPageToken?: string | null } = {},
): string {
  const id = opts.id ?? "unit-1";
  db.prepare(
    "INSERT INTO crawl_units (id, crawl_run_id, zip, category, status, next_page_token) VALUES (?, ?, ?, ?, 'pending', ?)",
  ).run(id, opts.runId ?? "run-1", opts.zip ?? "80202", opts.category ?? "dentist", opts.nextPageToken ?? null);
  return id;
}

export function makePlaceResult(overrides: Partial<PlaceResult> = {}): PlaceResult {
  return {
    id: overrides.id ?? `places/${crypto.randomUUID()}`,
    displayName: overrides.displayName ?? { text: "Test Business" },
    formattedAddress: overrides.formattedAddress ?? "123 Test St, Denver, CO 80202",
    nationalPhoneNumber: overrides.nationalPhoneNumber ?? "303-555-0100",
    websiteUri: overrides.websiteUri ?? undefined,
    rating: overrides.rating ?? 4.5,
    userRatingCount: overrides.userRatingCount ?? 30,
    types: overrides.types ?? ["dentist"],
    businessStatus: overrides.businessStatus ?? "OPERATIONAL",
    primaryType: overrides.primaryType ?? "dentist",
    location: overrides.location ?? { latitude: 39.75, longitude: -104.99 },
    ...overrides,
  };
}

export function mockTextSearchResponse(places: PlaceResult[], nextPageToken?: string): TextSearchResponse {
  return { places, nextPageToken };
}
