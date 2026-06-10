import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Lead } from "@/lib/db/queries";

let currentParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => currentParams,
}));

vi.mock("@/lib/leads/actions", () => ({
  claimLeadAction: vi.fn(),
}));

import { ExploreClient } from "@/app/(protected)/explore/explore-client";

function renderExplore(role: "admin" | "researcher" = "admin", leads: Lead[] = []) {
  return renderToStaticMarkup(
    <ExploreClient
      leads={leads}
      total={leads.length}
      mapPoints={[]}
      totalMapped={0}
      mapPointLimit={200}
      zipCoverage={[]}
      filters={{ mode: "work_ready", sortBy: "opportunity", view: "cards", archived: "active", includeExcluded: false }}
      scoreThresholds={{ high: 20, medium: 10 }}
      businessTypeCounts={[{ id: "dental", label: "Dental", total: 3, active: 2 }]}
      currentUser={{ userId: "user-1", email: "user@example.com", role }}
      googleMapsApiKey={null}
    />,
  );
}

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    place_id: "place-1",
    name: "Good Plumbing Service Company",
    address: "5401 W 48th Ave, Denver, CO 80212, USA",
    phone: "303-555-0101",
    categories: ["plumber"],
    rating: 4.8,
    review_count: 60,
    website_uri: null,
    website_status: "none",
    maps_uri: null,
    business_status: "OPERATIONAL",
    price_level: null,
    photo_count: 0,
    has_opening_hours: true,
    primary_type: "plumber",
    lat: null,
    lng: null,
    market_id: null,
    location_cell_id: null,
    country_code: "US",
    admin_area1: "CO",
    admin_area2: "Denver",
    locality: "Denver",
    postal_code: "80212",
    score: 36.1,
    status: "new",
    is_excluded: false,
    exclusion_reason: null,
    excluded_at: null,
    archived_at: null,
    archived_by_user_id: null,
    archive_reason: null,
    selling_niche: null,
    business_type: "local_services",
    win_probability_score: 0,
    lead_quality_score: 0,
    quality_bucket: "ready_to_call",
    easy_build_score: 0,
    cash_speed_score: 0,
    need_score: 0,
    quality_reason: null,
    recommended_offer: "starter_site",
    next_best_action: "Call and confirm the owner or decision maker.",
    phone_verification_status: "unknown",
    last_quality_scored_at: null,
    quality_checked_by_user_id: null,
    ai_verification_status: "no_site_found",
    ai_confidence: 0.9,
    ai_found_website_url: null,
    ai_recommendation: null,
    ai_summary: null,
    ai_checked_at: "2026-06-09T00:00:00.000Z",
    ai_website_viability_status: "directory_only",
    ai_website_health: null,
    ai_queue_status: "verified",
    ai_attempt_count: 1,
    ai_last_error: null,
    ai_next_retry_at: null,
    ai_input_hash: null,
    raw_opportunity_score: 0,
    verification_score: 0,
    sales_priority_score: 0,
    pitch_outcome: null,
    objection_reason: null,
    decision_maker_reached: false,
    quoted_amount: 0,
    close_value: 0,
    demo_sent_at: null,
    ai_website_feedback_status: null,
    ai_corrected_website_url: null,
    ai_false_positive_reason: null,
    ai_reviewer_notes: null,
    ai_feedback_at: null,
    assigned_to_user_id: null,
    assigned_user_email: null,
    assigned_user_display_name: null,
    qualification_status: "qualified",
    disqualification_reason: null,
    website_verified_at: null,
    contactability_score: 0,
    estimated_deal_value: 4025,
    notes: null,
    reminder_date: null,
    enrichment_status: "pending",
    enriched_at: null,
    review_highlights: null,
    editorial_summary: null,
    website_health: null,
    website_checked_at: null,
    verification: {},
    discovered_at: "2026-06-09T00:00:00.000Z",
    first_contacted_at: null,
    first_reply_at: null,
    meeting_booked_at: null,
    last_contacted_at: null,
    created_at: "2026-06-09T00:00:00.000Z",
    updated_at: "2026-06-09T00:00:00.000Z",
    ...overrides,
  };
}

describe("ExploreClient search surface", () => {
  it("renders one Lead Finder surface instead of the old filter rows", () => {
    currentParams = new URLSearchParams();
    const html = renderExplore();

    expect(html).toContain("Lead Finder");
    expect(html).toContain("Scope: Work-ready");
    expect(html).toContain("Builder");
    expect(html).not.toContain("Command search");
    expect(html).not.toContain("Quick views");
    expect(html).not.toContain("Active filters");
    expect(html).not.toContain("Advanced filters");
    expect(html).not.toContain("Apply command");
  });

  it("renders active URL filters as search chips without presentation chips", () => {
    currentParams = new URLSearchParams("city=toronto&websiteStatus=none&sortBy=website_need&view=table");
    const html = renderExplore();

    expect(html).toContain("City: Toronto");
    expect(html).toContain("Website: None");
    expect(html).not.toContain("Sort: Website Need");
    expect(html).not.toContain("View: Table");
  });

  it("keeps Add Lead admin-only", () => {
    currentParams = new URLSearchParams();

    expect(renderExplore("admin")).toContain("Add Lead");
    expect(renderExplore("researcher")).not.toContain("Add Lead");
  });

  it("keeps discovery launch links admin-only in the empty state", () => {
    currentParams = new URLSearchParams("city=nowhere");

    const adminHtml = renderExplore("admin");
    const researcherHtml = renderExplore("researcher");

    expect(adminHtml).toContain("Start discovery / harvest");
    expect(researcherHtml).not.toContain("Start discovery / harvest");
    expect(researcherHtml).toContain("Ask an admin to harvest this market");
  });

  it("renders operator-facing lead badges with hover explanations", () => {
    currentParams = new URLSearchParams();
    const html = renderExplore("admin", [makeLead()]);

    expect(html).toContain("No website");
    expect(html).toContain("Ready to call");
    expect(html).toContain("AI: no usable site");
    expect(html).toContain("4.8 rating");
    expect(html).toContain("60 reviews");
    expect(html).toContain("$4,025 est.");
    expect(html).toContain("No official business website is recorded for this lead.");
    expect(html).toContain("Why this is shown: no official website found, strong reviews, and marked ready for outreach.");
    expect(html).toContain('data-role="lead-card-footer"');
    expect(html).toContain('aria-label="Claim lead"');
    expect(html).not.toContain("Website review");
    expect(html).not.toContain("Work update");
    expect(html).not.toContain("Archive");
    expect(html).not.toContain('data-role="lead-card-actions"');
    expect(html).not.toContain(">none</span>");
    expect(html).not.toContain("Why this result:");
  });

  it("does not expose Workbench actions for claimed leads if stale Explore data includes one", () => {
    currentParams = new URLSearchParams();
    const html = renderExplore("researcher", [
      makeLead({
        assigned_to_user_id: "user-1",
        assigned_user_email: "user@example.com",
        assigned_user_display_name: "Researcher",
      }),
    ]);

    expect(html).toContain("Mine");
    expect(html).not.toContain('aria-label="Claim lead"');
    expect(html).not.toContain("Website review");
    expect(html).not.toContain("Work update");
    expect(html).not.toContain("Archive");
  });

  it("uses theme variables for the touched search and Explore panel surfaces", () => {
    const tokenSearch = readFileSync(join(process.cwd(), "src/app/(protected)/explore/explore-token-search.tsx"), "utf8");
    const exploreClient = readFileSync(join(process.cwd(), "src/app/(protected)/explore/explore-client.tsx"), "utf8");

    expect(tokenSearch).toContain("--search-surface");
    expect(tokenSearch).toContain("--suggestion-bg");
    expect(tokenSearch).not.toContain("rgba(255,255,255,0.5)");
    expect(tokenSearch).not.toContain("rgba(255,255,255,0.95)");
    expect(exploreClient).toContain("--search-surface");
    expect(exploreClient).toContain("--chip-bg");
  });

  it("closes the Lead Finder menu when clicking outside the search surface", () => {
    const tokenSearch = readFileSync(join(process.cwd(), "src/app/(protected)/explore/explore-token-search.tsx"), "utf8");

    expect(tokenSearch).toContain('window.addEventListener("pointerdown", handlePointerDown)');
    expect(tokenSearch).toContain("rootRef.current?.contains(target)");
    expect(tokenSearch).toContain("setOpen(false)");
    expect(tokenSearch).toContain("setBuilderOpen(false)");
  });
});
