import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { QualificationReviewPanel } from "@/components/qualification/qualification-review-panel";
import {
  qualifyAccount,
  reviewAccountQualification,
  type AccountQualification,
} from "@/lib/qualification/account-qualification";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000001";
const ACCOUNT_ID = "30000000-0000-4000-8000-000000000001";
const REVIEWER_ID = "40000000-0000-4000-8000-000000000001";
const hash = (character: string) => `sha256:${character.repeat(64)}`;

function qualification(): AccountQualification {
  const playContentHash = hash("a");
  const result = qualifyAccount({
    version: 1,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    accountId: ACCOUNT_ID,
    playVersionId: `lead-play-version:${playContentHash.slice("sha256:".length)}`,
    playContentHash,
    evaluatedAt: "2026-08-30T15:10:00.000Z",
    policy: {
      policyVersion: 1,
      policyId: "qualification-policy:industrial-fit-v1",
      qualifiedThreshold: 80,
      reviewThreshold: 50,
      factors: [
        { factorId: "factor:fit", weight: 60 },
        { factorId: "factor:readiness", weight: 40 },
      ],
    },
    observations: [
      {
        observationId: "observation:catalog-1",
        tenantId: TENANT_ID,
        workspaceId: WORKSPACE_ID,
        accountId: ACCOUNT_ID,
        observedAt: "2026-08-30T15:01:00.000Z",
        payloadHash: hash("1"),
        provenanceHash: hash("3"),
      },
      {
        observationId: "observation:catalog-2",
        tenantId: TENANT_ID,
        workspaceId: WORKSPACE_ID,
        accountId: ACCOUNT_ID,
        observedAt: "2026-08-30T15:02:00.000Z",
        payloadHash: hash("2"),
        provenanceHash: hash("4"),
      },
    ],
    factors: [
      {
        factorId: "factor:fit",
        score: 90,
        reason: "The catalog explicitly matches the play's target market.",
        evidenceObservationIds: ["observation:catalog-1"],
        uncertainty: { level: "none", reason: null },
      },
      {
        factorId: "factor:readiness",
        score: 70,
        reason: "A current catalog supports readiness, but timing remains incomplete.",
        evidenceObservationIds: ["observation:catalog-2"],
        uncertainty: { level: "low", reason: "The next procurement date is not stated." },
      },
    ],
    contactContext: null,
  });
  if (!result.ok) throw new Error(result.code);
  return result.qualification;
}

describe("QualificationReviewPanel", () => {
  it("explains the score, deterministic recommendation, weighted factors, uncertainty, and cited observations", () => {
    const current = qualification();
    const html = renderToStaticMarkup(<QualificationReviewPanel state="ready" qualification={current} />);

    expect(html).toContain('data-surface="qualification-review-panel"');
    expect(html).toContain('data-automated-decision="qualified"');
    expect(html).toContain('aria-label="Current decision: Qualified"');
    expect(html).toContain("82<span");
    expect(html).toContain("Deterministic recommendation");
    expect(html).toContain("factor:fit");
    expect(html).toContain("90/100");
    expect(html).toContain("Weight");
    expect(html).toContain("Low uncertainty");
    expect(html).toContain("The next procurement date is not stated.");
    expect(html).toContain('aria-label="Cited evidence for factor:fit"');
    expect(html).toContain("observation:catalog-1");
    expect(html).toContain(`Provenance: ${hash("3")}`);
    expect(html).toContain("Review at");
    expect(html).toContain("Qualify at");
    expect(html).toContain(current.versionId);
  });

  it("renders explicit accessible loading and error states", () => {
    const loading = renderToStaticMarkup(<QualificationReviewPanel state="loading" />);
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Loading account qualification");

    const error = renderToStaticMarkup(
      <QualificationReviewPanel state="error" error="The exact qualification version could not be loaded." />,
    );
    expect(error).toContain('role="alert"');
    expect(error).toContain("Account qualification unavailable");
    expect(error).toContain("The exact qualification version could not be loaded.");
  });

  it("exposes only explicit human confirm and override controls when callbacks are supplied", () => {
    const current = qualification();
    const html = renderToStaticMarkup(
      <QualificationReviewPanel
        state="ready"
        qualification={current}
        onConfirm={() => undefined}
        onOverride={() => undefined}
      />,
    );

    expect(html.match(/<button\b/g)).toHaveLength(3);
    expect(html).toContain("Confirm Qualified");
    expect(html).toContain("Override to Needs review");
    expect(html).toContain("Override to Unqualified");
    expect(html).toContain("These controls request review only.");
    expect(html).toMatch(/<button[^>]*type="button"[^>]*focus-visible:outline-2/u);
    expect(html).not.toMatch(/<(?:form|input|textarea|select)\b/u);
    expect(html).not.toMatch(/>[^<]*(?:send|approve automatically|apply automatically)[^<]*</iu);

    const withoutCallbacks = renderToStaticMarkup(
      <QualificationReviewPanel state="ready" qualification={current} />,
    );
    expect(withoutCallbacks).not.toMatch(/<button\b/u);
  });

  it("shows human confirmation and override history without hiding the deterministic recommendation", () => {
    const current = qualification();
    const confirmed = reviewAccountQualification({
      version: 1,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      accountId: ACCOUNT_ID,
      current,
      expectedQualificationHash: current.qualificationHash,
      action: "confirm",
      decision: "qualified",
      actor: { kind: "human", actorId: REVIEWER_ID },
      at: "2026-08-30T15:11:00.000Z",
      reason: "The cited catalog evidence supports the recommendation.",
    });
    if (!confirmed.ok) throw new Error(confirmed.code);
    const overridden = reviewAccountQualification({
      version: 1,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      accountId: ACCOUNT_ID,
      current: confirmed.qualification,
      expectedQualificationHash: confirmed.qualification.qualificationHash,
      action: "override",
      decision: "unqualified",
      actor: { kind: "human", actorId: REVIEWER_ID },
      at: "2026-08-30T15:12:00.000Z",
      reason: "Human review identified a material fit constraint outside the scored factors.",
    });
    if (!overridden.ok) throw new Error(overridden.code);

    const html = renderToStaticMarkup(
      <QualificationReviewPanel
        state="ready"
        qualification={overridden.qualification}
        onConfirm={() => undefined}
        onOverride={() => undefined}
      />,
    );
    expect(html).toContain('data-review-status="overridden"');
    expect(html).toContain('data-automated-decision="qualified"');
    expect(html).toContain('aria-label="Current decision: Unqualified"');
    expect(html).toContain('aria-label="Human review audit trail"');
    expect(html).toContain("Human confirmed: Qualified → Qualified");
    expect(html).toContain("Human overrode: Qualified → Unqualified");
    expect(html).toContain("Human review identified a material fit constraint outside the scored factors.");
    expect(html).toContain(REVIEWER_ID);
    expect(html).toContain("Confirm Unqualified");
    expect(html).not.toContain("Override to Unqualified");
  });

  it("uses ordered landmarks and responsive, break-safe operational layout", () => {
    const html = renderToStaticMarkup(<QualificationReviewPanel state="ready" qualification={qualification()} />);

    expect(html.match(/<h2\b/g)).toHaveLength(1);
    expect(html.indexOf("<h2")).toBeLessThan(html.indexOf("<h3"));
    expect(html).toContain('aria-labelledby="qualification-review-title"');
    expect(html).toContain('aria-labelledby="qualification-factors-title"');
    expect(html).toContain('aria-label="Qualification decision and audit"');
    expect(html).toContain("xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,.65fr)]");
    expect(html).toContain("md:grid-cols-2");
    expect(html).toMatch(/class="[^"]*break-all[^"]*"[^>]*>factor:fit</u);
  });
});
