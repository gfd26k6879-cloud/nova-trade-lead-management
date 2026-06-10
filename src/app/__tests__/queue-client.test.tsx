import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { QueueLead, ResearcherWorkbench } from "@/lib/db/queries";

let currentParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => currentParams,
}));

vi.mock("@/lib/admin-requests/actions", () => ({
  createAdminRequestAction: vi.fn(),
}));

vi.mock("@/lib/leads/actions", () => ({
  claimLeadAction: vi.fn(),
  logOutreachEventAction: vi.fn(),
  unclaimLeadAction: vi.fn(),
}));

import { QueueClient } from "@/app/(protected)/queue/queue-client";

const scoreThresholds = { high: 80, medium: 50 };
const currentUser = { userId: "user-1", email: "researcher@example.com", role: "researcher" as const };

function renderQueue(workbench: ResearcherWorkbench) {
  return renderToStaticMarkup(
    <QueueClient
      workbench={workbench}
      scoreThresholds={scoreThresholds}
      currentUser={currentUser}
    />,
  );
}

function makeLead(overrides: Partial<QueueLead>): QueueLead {
  return {
    id: "lead-1",
    name: "Owned Dental",
    phone: "303-555-0100",
    address: "123 Main St, Denver, CO 80202",
    categories: ["dentist"],
    score: 88,
    website_status: "none",
    rating: 4.8,
    review_count: 42,
    last_contacted_at: "2026-06-08T12:00:00.000Z",
    reminder_date: "2026-06-10",
    status: "new",
    is_excluded: false,
    exclusion_reason: null,
    selling_niche: null,
    business_type: "dental",
    win_probability_score: 82,
    lead_quality_score: 86,
    quality_bucket: "ready_to_call",
    easy_build_score: 70,
    cash_speed_score: 75,
    need_score: 90,
    quality_reason: "No usable site found.",
    recommended_offer: "starter_site",
    next_best_action: "Call and ask for the owner.",
    phone_verification_status: "unknown",
    ai_verification_status: "no_site_found",
    ai_confidence: 0.91,
    ai_found_website_url: null,
    ai_recommendation: "call",
    ai_checked_at: "2026-06-08T12:00:00.000Z",
    ai_website_viability_status: "directory_only",
    ai_queue_status: "verified",
    qualification_status: "qualified",
    contactability_score: 0.9,
    estimated_deal_value: 2500,
    raw_opportunity_score: 84,
    verification_score: 90,
    sales_priority_score: 91,
    assigned_to_user_id: "user-1",
    assigned_user_email: "researcher@example.com",
    assigned_user_display_name: "Researcher",
    demo_slug: null,
    open_website_request_id: null,
    open_quote_request_id: null,
    business_detail_status: null,
    competitive_report_status: null,
    ...overrides,
  } as QueueLead;
}

function makeWorkbench(): ResearcherWorkbench {
  const ownedLead = makeLead({});
  const unclaimedLead = makeLead({
    id: "lead-2",
    name: "Unclaimed Auto",
    phone: "303-555-0200",
    business_type: "auto_repair",
    assigned_to_user_id: null,
    assigned_user_email: null,
    assigned_user_display_name: null,
  });

  return {
    nextAction: ownedLead,
    myLeads: [ownedLead],
    unclaimedLeads: [unclaimedLead],
    summary: {
      myClaimed: 1,
      dueToday: 1,
      contactedThisWeek: 2,
      bestUnclaimed: 1,
    },
  };
}

describe("QueueClient workbench views", () => {
  it("defaults to the current card workbench", () => {
    currentParams = new URLSearchParams();

    const html = renderQueue(makeWorkbench());

    expect(html).toContain("Workbench view");
    expect(html).toContain("Cards");
    expect(html).toContain("Sheet");
    expect(html).toContain("Your next action");
    expect(html).toContain("My claimed leads");
    expect(html).toContain("Log outcome");
    expect(html).not.toContain("Sheet view");
    expect(html).not.toContain("Business / phone");
  });

  it("renders the URL-backed sheet view with owned rows only", () => {
    currentParams = new URLSearchParams("view=sheet");

    const html = renderQueue(makeWorkbench());

    expect(html).toContain("Sheet view");
    expect(html).toContain("Business / phone");
    expect(html).toContain("Outcome");
    expect(html).toContain("Owned Dental");
    expect(html).toContain("Choose outcome");
    expect(html).toContain("Call and ask for the owner.");
    expect(html).not.toContain("Unclaimed Auto");
    expect(html).not.toContain("Claim first");
    expect(html).not.toContain(">Claim</button>");
    expect(html).not.toContain("Your next action");
    expect(html).not.toContain("Send to Steve");
  });

  it("keeps sheet empty when there are no owned leads even if unclaimed leads exist", () => {
    currentParams = new URLSearchParams("view=sheet");
    const workbench = makeWorkbench();

    const html = renderQueue({
      ...workbench,
      nextAction: null,
      myLeads: [],
      summary: { ...workbench.summary, myClaimed: 0 },
    });

    expect(html).toContain("You have no claimed leads. Use Lead Explorer to claim one.");
    expect(html).not.toContain("Workbench sheet");
    expect(html).not.toContain("Unclaimed Auto");
    expect(html).not.toContain("Claim first");
    expect(html).not.toContain(">Claim</button>");
    expect(html).not.toContain("Website needed");
    expect(html).not.toContain("Quote requested");
  });
});
