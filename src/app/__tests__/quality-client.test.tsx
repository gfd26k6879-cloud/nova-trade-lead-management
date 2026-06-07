import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { LocationCell, LocationMarket, QualityLead, QualitySummary } from "@/lib/db/queries";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams("countryCode=CA&marketId=market-london-ca&locationCellId=cell-ca-london-on-n6h"),
}));

vi.mock("@/lib/leads/actions", () => ({
  addLeadNoteAction: vi.fn(),
  logOutreachEventAction: vi.fn(),
  markLeadQualityBucketAction: vi.fn(),
  queueQualityAiVerificationBatchAction: vi.fn(),
  queueQualityEnrichmentBatchAction: vi.fn(),
  runQualityAiVerificationBatchAction: vi.fn(),
  updateLeadPhoneVerificationStatusAction: vi.fn(),
  updateLeadStatusAction: vi.fn(),
}));

import { QualityClient } from "@/app/(protected)/quality/quality-client";

const summary: QualitySummary = {
  readyToCall: 0,
  aiVerifiedNoWebsite: 0,
  brokenSiteOpportunities: 0,
  needsAiVerify: 130,
  needsManualReview: 0,
  removedBecauseWebsiteFound: 0,
  averageQualityScore: 60,
  estimatedPipelineValue: 0,
};

const markets: LocationMarket[] = [
  {
    id: "market-london-ca",
    name: "London, Ontario",
    country_code: "CA",
    admin_area1: "ON",
    admin_area2: null,
    locality: "London",
    status: "active",
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
  },
];

const cells: LocationCell[] = [
  {
    id: "cell-ca-london-on-n6h",
    market_id: "market-london-ca",
    market_name: "London, Ontario",
    country_code: "CA",
    admin_area1: "ON",
    admin_area2: null,
    locality: "London",
    postal_code: "N6H",
    postal_code_normalized: "N6H",
    cell_type: "postal_fsa",
    cell_label: "London, ON N6H",
    lat: 42.984,
    lng: -81.292,
    radius_meters: 3000,
    is_active: 1,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
  },
];

const lead = {
  id: "lead-1",
  name: "London Plumbing",
  phone: "519-555-0100",
  address: "55 Oxford St W, London, ON N6H 5R8, Canada",
  categories: ["plumber"],
  score: 12,
  website_status: "none",
  rating: null,
  review_count: null,
  last_contacted_at: null,
  reminder_date: null,
  status: "new",
  is_excluded: false,
  exclusion_reason: null,
  selling_niche: null,
  business_type: "plumbing",
  win_probability_score: 0,
  lead_quality_score: 60,
  quality_bucket: "needs_ai_verify",
  easy_build_score: 60,
  cash_speed_score: 60,
  need_score: 60,
  quality_reason: "Needs AI verification.",
  recommended_offer: "starter_site",
  next_best_action: "Queue AI verification.",
  phone_verification_status: "unknown",
  ai_verification_status: "not_checked",
  ai_confidence: 0,
  ai_found_website_url: null,
  ai_recommendation: null,
  ai_checked_at: null,
  ai_website_viability_status: null,
  ai_queue_status: "not_checked",
  qualification_status: "qualified",
  contactability_score: 60,
  estimated_deal_value: 3500,
  raw_opportunity_score: 0,
  verification_score: 0,
  sales_priority_score: 0,
  assigned_to_user_id: null,
  assigned_user_email: null,
  assigned_user_display_name: null,
  demo_slug: null,
  open_website_request_id: null,
  open_quote_request_id: null,
  business_detail_status: null,
  competitive_report_status: null,
  city: "London",
  market_id: "market-london-ca",
  location_cell_id: "cell-ca-london-on-n6h",
  country_code: "CA",
  locality: "London",
  postal_code: "N6H",
  enrichment_status: "pending",
} as QualityLead;

describe("QualityClient", () => {
  it("renders an agile London quality scope with batch queue actions", () => {
    const html = renderToStaticMarkup(
      <QualityClient
        summary={summary}
        leads={[lead]}
        total={1}
        filters={{ countryCode: "CA", marketId: "market-london-ca", locationCellId: "cell-ca-london-on-n6h", page: 1, pageSize: 50, denverOnly: false }}
        businessTypeCounts={[{ id: "plumbing", label: "Plumbing", total: 1, active: 1 }]}
        locationMarkets={markets}
        locationCells={cells}
      />,
    );

    expect(html).toContain("Current scope:");
    expect(html).toContain("London, ON N6H");
    expect(html).toContain("Country filter");
    expect(html).toContain("Send Top 25 to Enrichment");
    expect(html).toContain("Send Top 25 to AI Queue");
    expect(html).toContain("Needs enrichment");
  });
});
