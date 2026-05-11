import { describe, it, expect } from "vitest";
import { generateOutreachPackage } from "../outreach-package";
import type { Lead } from "../db/queries";

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "test-id",
    place_id: "place-123",
    name: "Joe's Dental",
    address: "123 Main St, Denver, CO 80202",
    phone: "303-555-1234",
    categories: ["dentist"],
    rating: 4.8,
    review_count: 150,
    website_uri: null,
    website_status: "none",
    maps_uri: "https://maps.google.com/test",
    business_status: "OPERATIONAL",
    price_level: null,
    photo_count: 5,
    has_opening_hours: true,
    primary_type: "dentist",
    lat: null,
    lng: null,
    score: 25.5,
    status: "new",
    is_excluded: false,
    exclusion_reason: null,
    excluded_at: null,
    notes: null,
    reminder_date: null,
    enrichment_status: "pending",
    enriched_at: null,
    review_highlights: null,
    editorial_summary: null,
    website_health: null,
    website_checked_at: null,
    verification: {},
    discovered_at: "2026-01-01T00:00:00Z",
    first_contacted_at: null,
    first_reply_at: null,
    meeting_booked_at: null,
    last_contacted_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("generateOutreachPackage", () => {
  it("returns all required fields", async () => {
    const pkg = generateOutreachPackage(makeLead());
    expect(pkg).toHaveProperty("opener");
    expect(pkg).toHaveProperty("websiteIssue");
    expect(pkg).toHaveProperty("valueProps");
    expect(pkg).toHaveProperty("callToAction");
    expect(pkg).toHaveProperty("fullMessage");
    expect(pkg.valueProps).toHaveLength(3);
  });

  it("includes business name in the opener", async () => {
    const pkg = generateOutreachPackage(makeLead({ name: "Acme Plumbing" }));
    expect(pkg.opener).toContain("Acme Plumbing");
  });

  it("generates correct website issue for 'none' status", async () => {
    const pkg = generateOutreachPackage(makeLead({ website_status: "none" }));
    expect(pkg.websiteIssue).toContain("don't currently have a website");
  });

  it("generates correct website issue for 'social' status", async () => {
    const pkg = generateOutreachPackage(makeLead({ website_status: "social" }));
    expect(pkg.websiteIssue).toContain("social media");
  });

  it("generates correct website issue for 'basic' status", async () => {
    const pkg = generateOutreachPackage(makeLead({ website_status: "basic" }));
    expect(pkg.websiteIssue).toContain("basic website");
  });

  it("extracts city from address", async () => {
    const pkg = generateOutreachPackage(makeLead({ address: "456 Elm St, Boulder, CO 80301" }));
    expect(pkg.opener).toContain("Boulder");
  });

  it("includes review data in opener", async () => {
    const pkg = generateOutreachPackage(makeLead({ review_count: 200, rating: 4.9 }));
    expect(pkg.opener).toContain("200 reviews");
    expect(pkg.opener).toContain("4.9");
  });

  it("fullMessage combines all parts", async () => {
    const pkg = generateOutreachPackage(makeLead());
    expect(pkg.fullMessage).toContain(pkg.opener);
    expect(pkg.fullMessage).toContain(pkg.websiteIssue);
    expect(pkg.fullMessage).toContain(pkg.callToAction);
  });
});
