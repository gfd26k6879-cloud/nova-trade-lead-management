import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LeadPlayPanel } from "@/components/strategy/lead-play-panel";
import type { LeadPlayProposal, LeadPlayReviewEvent, LeadPlayReviewStatus } from "@/lib/strategy/lead-play";
import type {
  LeadPlayActivationBinding,
  LeadPlayActivationState,
  LeadPlaySimulationEligibilityReview,
} from "@/lib/strategy/lead-play-activation";
import type { LeadPlaySimulation } from "@/lib/strategy/lead-play-simulation";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000001";
const REVIEWER_ID = "30000000-0000-4000-8000-000000000001";
const hash = (character: string) => `sha256:${character.repeat(64)}`;
const versionId = (character: string) => `lead-play-version:${character.repeat(64)}`;

function reviewEvents(status: LeadPlayReviewStatus): readonly LeadPlayReviewEvent[] {
  if (status === "draft") return [];
  const events: LeadPlayReviewEvent[] = [{
    from: "draft",
    to: "in_review",
    actor: { kind: "human", actorId: REVIEWER_ID },
    at: "2026-08-30T14:01:00.000Z",
    reason: "The bounded play is ready for human review.",
    replacementVersionId: null,
  }];
  if (status === "in_review") return events;
  if (status === "approved" || status === "rejected") {
    events.push({
      from: "in_review",
      to: status,
      actor: { kind: "human", actorId: REVIEWER_ID },
      at: "2026-08-30T14:02:00.000Z",
      reason: status === "approved" ? "Evidence, bounds, and exclusions were reviewed." : "The targeting evidence is insufficient.",
      replacementVersionId: null,
    });
  }
  return events;
}

function proposal(status: LeadPlayReviewStatus = "approved", revision = 1): LeadPlayProposal {
  const id = versionId(String(revision));
  const contentHash = hash(String(revision));
  const supersedesVersionId = revision === 1 ? null : versionId(String(revision - 1));
  const events = reviewEvents(status);
  const reviewHash = hash(status === "approved" ? "a" : status === "in_review" ? "b" : "c");
  return {
    schemaVersion: 1,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    versionId: id,
    stableKey: "lead-play:north-america-industrial",
    revision,
    supersedesVersionId,
    status: "review_required",
    contentHash,
    createdAt: "2026-08-30T14:00:00.000Z",
    icp: {
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      stableKey: "icp:industrial",
      revision: 1,
      supersedesVersionId: null,
      versionId: `icp-version:${"d".repeat(64)}`,
      contentHash: hash("d"),
      reviewHash: hash("e"),
      understandingVersionId: `understanding-version:${"f".repeat(64)}`,
      understandingContentHash: hash("f"),
      understandingClaimSetHash: hash("7"),
      understandingReviewHash: hash("8"),
      authorityHash: hash("9"),
      status: "approved",
    },
    title: "North American industrial renewal",
    objective: "Identify bounded accounts with evidence of current expansion intent.",
    motion: "Research approved public sources, preserve uncertainty, and prepare drafts for human review.",
    searchHypotheses: [{
      hypothesisId: "hypothesis:expansion",
      queryFamily: "industrial-expansion",
      statement: "A current expansion program indicates likely operational demand.",
      rationale: "The approved understanding connects facility growth with the target workflow.",
      rationaleRefs: [{ claimId: "claim:expansion", evidenceId: "evidence:filing" }],
    }],
    sourceAllowlist: ["source:company-filings", "source:company-newsroom"],
    bounds: { maxAccounts: 25, maxProviderRequests: 50, maxSpendCents: 1250 },
    outreachMode: "draft_only",
    rationaleRefs: [{ claimId: "claim:expansion", evidenceId: "evidence:filing" }],
    uncertainties: [{
      uncertaintyId: "uncertainty:timing",
      statement: "Procurement timing is not public.",
      impact: "Do not infer immediate buying intent.",
      relatedClaimIds: ["claim:expansion"],
    }],
    review: {
      reviewVersion: 1,
      versionId: id,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      contentHash,
      stableKey: "lead-play:north-america-industrial",
      revision,
      supersedesVersionId,
      icpVersionId: `icp-version:${"d".repeat(64)}`,
      icpContentHash: hash("d"),
      icpReviewHash: hash("e"),
      icpAuthorityHash: hash("9"),
      understandingVersionId: `understanding-version:${"f".repeat(64)}`,
      understandingContentHash: hash("f"),
      understandingClaimSetHash: hash("7"),
      understandingReviewHash: hash("8"),
      createdAt: "2026-08-30T14:00:00.000Z",
      status,
      events,
      replacementVersionId: null,
      reviewHash,
    },
  };
}

function simulation(play: LeadPlayProposal, disposition: "included" | "excluded" | "needs_review" = "included"): LeadPlaySimulation {
  const included = disposition === "included" ? 1 : 0;
  const excluded = disposition === "excluded" ? 1 : 0;
  const needsReview = disposition === "needs_review" ? 1 : 0;
  return {
    simulationVersion: 1,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    simulationId: `lead-play-simulation:${"4".repeat(64)}`,
    simulationHash: hash("4"),
    playVersionId: play.versionId,
    playContentHash: play.contentHash,
    playReviewHash: play.review.reviewHash,
    estimates: { providerRequests: 4, spendCents: 320 },
    accounts: [{
      accountId: "account:forge-works",
      disposition,
      factors: [],
      rationaleRefs: [{ claimId: "claim:expansion", evidenceId: "evidence:filing" }],
      uncertaintyIds: disposition === "needs_review" ? ["uncertainty:timing"] : [],
    }],
    summary: { total: 1, included, excluded, needsReview, providerRequests: 4, spendCents: 320 },
  };
}

function eligibility(play: LeadPlayProposal, dryRun: LeadPlaySimulation): LeadPlaySimulationEligibilityReview {
  return {
    eligibilityVersion: 1,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    decision: "eligible",
    playVersionId: play.versionId,
    playContentHash: play.contentHash,
    playReviewHash: play.review.reviewHash,
    simulationId: dryRun.simulationId,
    simulationHash: dryRun.simulationHash,
    actor: { kind: "human", actorId: REVIEWER_ID },
    reviewedAt: "2026-08-30T14:03:00.000Z",
    reason: "Every simulated account is supported and within the approved bounds.",
    eligibilityHash: hash("5"),
  };
}

function binding(play: LeadPlayProposal, dryRun: LeadPlaySimulation, review: LeadPlaySimulationEligibilityReview): LeadPlayActivationBinding {
  return {
    versionId: play.versionId,
    contentHash: play.contentHash,
    reviewHash: play.review.reviewHash,
    revision: play.revision,
    supersedesVersionId: play.supersedesVersionId,
    simulationId: dryRun.simulationId,
    simulationHash: dryRun.simulationHash,
    simulationEligibilityHash: review.eligibilityHash,
  };
}

function activation(play: LeadPlayProposal, active: LeadPlayActivationBinding | null = null): LeadPlayActivationState {
  return {
    stateVersion: 1,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    stableKey: play.stableKey,
    createdAt: "2026-08-30T13:59:00.000Z",
    active,
    inactive: [],
    events: [],
    stateHash: hash("6"),
  };
}

describe("LeadPlayPanel", () => {
  it("shows the exact version, evidence, bounds, policies, simulation, exclusions, and review chronology", () => {
    const play = proposal();
    const dryRun = simulation(play, "excluded");
    const html = renderToStaticMarkup(<LeadPlayPanel state="ready" proposal={play} simulation={dryRun} simulationEligibility={null} activation={activation(play)} />);

    expect(html).toContain('data-surface="lead-play-panel"');
    expect(html).toContain(`Exact version: ${play.versionId}`);
    expect(html).toContain("claim:expansion");
    expect(html).toContain("evidence:filing");
    expect(html).toContain("Accounts</dt><dd");
    expect(html).toContain("25</dd>");
    expect(html).toContain("Spend ceiling</dt><dd");
    expect(html).toContain("$12.50");
    expect(html).toContain("Draft only");
    expect(html).toContain("source:company-filings");
    expect(html).toContain("account:forge-works");
    expect(html).toContain("Excluded");
    expect(html).toContain("Review: Draft → In review");
    expect(html).toContain("Review: In review → Approved");
    expect(html).toContain("Approval records review only.");
    expect(html).not.toMatch(/<button\b/u);
  });

  it("renders accessible loading and error states", () => {
    const loading = renderToStaticMarkup(<LeadPlayPanel state="loading" />);
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Loading lead play");

    const error = renderToStaticMarkup(<LeadPlayPanel state="error" error="The exact lead-play version could not be loaded." />);
    expect(error).toContain('role="alert"');
    expect(error).toContain("Lead play unavailable");
    expect(error).toContain("The exact lead-play version could not be loaded.");
  });

  it("offers only valid human review transitions and keeps approval separate from activation", () => {
    const draft = proposal("draft");
    const draftHtml = renderToStaticMarkup(<LeadPlayPanel state="ready" proposal={draft} simulation={null} simulationEligibility={null} activation={activation(draft)} onReview={() => undefined} />);
    expect(draftHtml.match(/<button\b/g)).toHaveLength(1);
    expect(draftHtml).toContain("Submit for review");

    const inReview = proposal("in_review");
    const reviewHtml = renderToStaticMarkup(<LeadPlayPanel state="ready" proposal={inReview} simulation={null} simulationEligibility={null} activation={activation(inReview)} onReview={() => undefined} onActivate={() => undefined} />);
    expect(reviewHtml.match(/<button\b/g)).toHaveLength(2);
    expect(reviewHtml).toContain("Approve exact version");
    expect(reviewHtml).toContain("Reject exact version");
    expect(reviewHtml).not.toContain("Activate exact version");

    const approved = proposal("approved");
    const approvedHtml = renderToStaticMarkup(<LeadPlayPanel state="ready" proposal={approved} simulation={null} simulationEligibility={null} activation={activation(approved)} onReview={() => undefined} onActivate={() => undefined} />);
    expect(approvedHtml).not.toMatch(/<button\b/u);
    expect(approvedHtml).toContain("Activation remains blocked");
  });

  it("offers activation only for the exact approved, eligible, all-included revision lineage", () => {
    const play = proposal();
    const dryRun = simulation(play);
    const reviewed = eligibility(play, dryRun);
    const ready = renderToStaticMarkup(<LeadPlayPanel state="ready" proposal={play} simulation={dryRun} simulationEligibility={reviewed} activation={activation(play)} onActivate={() => undefined} />);
    expect(ready).toContain('data-activation-status="activation_ready"');
    expect(ready).toContain("Human-reviewed simulation is activation eligible.");
    expect(ready.match(/<button\b/g)).toHaveLength(1);
    expect(ready).toContain("Activate exact version");
    expect(ready).not.toMatch(/>[^<]*send[^<]*</iu);

    const excludedRun = simulation(play, "excluded");
    const blocked = renderToStaticMarkup(<LeadPlayPanel state="ready" proposal={play} simulation={excludedRun} simulationEligibility={eligibility(play, excludedRun)} activation={activation(play)} onActivate={() => undefined} />);
    expect(blocked).toContain('data-activation-status="blocked"');
    expect(blocked).toContain("Simulation is not eligible for activation.");
    expect(blocked).not.toMatch(/<button\b/u);
  });

  it("fails closed on stale bindings and permits rollback only to an exact inactive predecessor", () => {
    const v1 = proposal("approved", 1);
    const v1Simulation = simulation(v1);
    const v1Eligibility = eligibility(v1, v1Simulation);
    const staleSimulation = { ...v1Simulation, playContentHash: hash("0") };
    const stale = renderToStaticMarkup(<LeadPlayPanel state="ready" proposal={v1} simulation={staleSimulation} simulationEligibility={v1Eligibility} activation={activation(v1)} onActivate={() => undefined} onRollback={() => undefined} />);
    expect(stale).toContain('role="alert"');
    expect(stale).toContain("One or more exact version bindings do not match");
    expect(stale).not.toMatch(/<button\b/u);

    const v2 = proposal("approved", 2);
    const v2Simulation = simulation(v2);
    const v2Eligibility = eligibility(v2, v2Simulation);
    const v1Binding = binding(v1, v1Simulation, v1Eligibility);
    const v2Binding = binding(v2, v2Simulation, v2Eligibility);
    const rollbackState: LeadPlayActivationState = {
      ...activation(v1, v2Binding),
      inactive: [v1Binding],
      events: [{
        sequence: 1,
        action: "activate",
        fromVersionId: null,
        to: v1Binding,
        actor: { kind: "human", actorId: REVIEWER_ID },
        at: "2026-08-30T14:04:00.000Z",
        reason: "Activate the reviewed initial version.",
      }, {
        sequence: 2,
        action: "activate",
        fromVersionId: v1.versionId,
        to: v2Binding,
        actor: { kind: "human", actorId: REVIEWER_ID },
        at: "2026-08-30T14:05:00.000Z",
        reason: "Activate the reviewed successor version.",
      }],
    };
    const rollback = renderToStaticMarkup(<LeadPlayPanel state="ready" proposal={v1} simulation={v1Simulation} simulationEligibility={v1Eligibility} activation={rollbackState} onActivate={() => undefined} onRollback={() => undefined} />);
    expect(rollback).toContain('data-activation-status="rollback_available"');
    expect(rollback).toContain("Activated to revision 1");
    expect(rollback).toContain("Activated to revision 2");
    expect(rollback.match(/<button\b/g)).toHaveLength(1);
    expect(rollback).toContain("Roll back to revision 1");
    expect(rollback).not.toContain("Activate exact version");
  });

  it("uses ordered landmarks and responsive, break-safe controls", () => {
    const play = proposal("draft");
    const html = renderToStaticMarkup(<LeadPlayPanel state="ready" proposal={play} simulation={null} simulationEligibility={null} activation={activation(play)} onReview={() => undefined} />);
    expect(html.match(/<h2\b/g)).toHaveLength(1);
    expect(html.indexOf("<h2")).toBeLessThan(html.indexOf("<h3"));
    expect(html).toContain('aria-labelledby="lead-play-title"');
    expect(html).toContain('aria-label="Lead play constraints and simulation"');
    expect(html).toContain("xl:grid-cols-[minmax(0,1.3fr)_minmax(19rem,.7fr)]");
    expect(html).toMatch(/<button[^>]*type="button"[^>]*focus-visible:outline-2/u);
    expect(html).not.toMatch(/<(?:form|input|textarea|select)\b/u);
  });
});
