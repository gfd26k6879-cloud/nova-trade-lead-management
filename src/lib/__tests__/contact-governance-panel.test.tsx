import { createHash } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ContactGovernancePanel } from "@/components/contacts/contact-governance-panel";
import {
  buildContactRecord,
  transitionContactRecordReview,
  type ContactRecord,
} from "@/lib/contacts/contact-record";

const TENANT = "10000000-0000-4000-8000-000000000001";
const WORKSPACE = "20000000-0000-4000-8000-000000000001";
const ACCOUNT = "30000000-0000-4000-8000-000000000001";
const REVIEWER = "40000000-0000-4000-8000-000000000001";

function sha256(value: unknown): string {
  return `sha256:${createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex")}`;
}

function sourceReceipt(revision: number) {
  const payload = {
    receiptVersion: 1,
    tenantId: TENANT,
    workspaceId: WORKSPACE,
    accountId: ACCOUNT,
    sourceId: "customer-list:fixture",
    sourceVersionId: `customer-list-version:fixture-v${revision}`,
    sourceContentHash: sha256(`synthetic source ${revision}`),
    connectorKey: "customer-list",
    locator: `row=${revision}`,
    observedAt: `2026-08-30T12:0${revision}:00.000Z`,
  } as const;
  return { ...payload, receiptHash: sha256(payload) };
}

function buildDraft(predecessor: ContactRecord | null = null): ContactRecord {
  const revision = predecessor ? predecessor.revision + 1 : 1;
  const receipt = sourceReceipt(revision);
  const built = buildContactRecord({
    version: 1,
    tenantId: TENANT,
    workspaceId: WORKSPACE,
    accountId: ACCOUNT,
    stableKey: "contact:synthetic-procurement",
    revision,
    predecessor: predecessor ? {
      predecessorVersion: 1,
      stableKey: predecessor.stableKey,
      revision: predecessor.revision,
      supersedesVersionId: predecessor.supersedesVersionId,
      record: predecessor,
    } : null,
    createdAt: predecessor ? "2026-08-30T13:03:00.000Z" : "2026-08-30T13:00:00.000Z",
    identity: {
      kind: "person_candidate",
      displayName: "Synthetic Buyer",
      contactPointClass: "named_business_email",
      contactPoint: revision === 1 ? "buyer@example.test" : "corrected@example.test",
      verification: revision === 1 ? "source_observed" : "human_corrected",
    },
    roleHypothesis: {
      status: "hypothesis",
      roleKey: "procurement",
      statement: "The source labels this contact as procurement.",
      confidenceBasisPoints: 7_500,
      evidenceReceiptHash: receipt.receiptHash,
    },
    sourceReceipt: receipt,
    freshness: {
      state: "KNOWN",
      observedAt: receipt.observedAt,
      expiresAt: "2027-08-30T12:02:00.000Z",
    },
    permittedUse: {
      policyVersion: "d012_v2026_07_27_02",
      purpose: "qualification",
      sourcePolicy: "KNOWN",
      jurisdiction: "KNOWN",
      attestation: "KNOWN",
      identity: "KNOWN",
      channelAuthorization: "KNOWN",
      legalBasis: "KNOWN",
      consentSignal: "KNOWN",
    },
    suppressionDisposition: "clear",
  });
  if (!built.ok) throw new Error(built.code);
  return built.record;
}

function transition(current: ContactRecord, to: "in_review" | "approved", at: string): ContactRecord {
  const result = transitionContactRecordReview({
    version: 1,
    tenantId: TENANT,
    workspaceId: WORKSPACE,
    accountId: ACCOUNT,
    current,
    expectedVersionId: current.versionId,
    expectedContentHash: current.contentHash,
    expectedReviewHash: current.review.reviewHash,
    to,
    actor: { kind: "human", actorId: REVIEWER },
    at,
    reason: `Human contact decision: ${to}.`,
  });
  if (!result.ok) throw new Error(result.code);
  return result.record;
}

function approvedCorrection(): ContactRecord {
  const originalReviewing = transition(buildDraft(), "in_review", "2026-08-30T13:01:00.000Z");
  const original = transition(originalReviewing, "approved", "2026-08-30T13:02:00.000Z");
  const correctedReviewing = transition(buildDraft(original), "in_review", "2026-08-30T13:04:00.000Z");
  return transition(correctedReviewing, "approved", "2026-08-30T13:05:00.000Z");
}

describe("ContactGovernancePanel", () => {
  it("renders the governed source, policy, consent, suppression, and human audit trail", () => {
    const record = approvedCorrection();
    const html = renderToStaticMarkup(
      <ContactGovernancePanel state="ready" record={record} asOf="2026-09-01T00:00:00.000Z" />,
    );

    expect(html).toContain('data-surface="contact-governance-panel"');
    expect(html).toContain("Synthetic Buyer");
    expect(html).toContain("customer-list-version:fixture-v2");
    expect(html).toContain("Current at as-of time");
    expect(html).toContain('data-freshness-state="current"');
    expect(html).toContain("Permitted-use checks");
    expect(html).toContain("Consent signal");
    expect(html.match(/data-policy-state="KNOWN"/g)).toHaveLength(7);
    expect(html).toContain('data-suppression="clear"');
    expect(html).toContain("human corrected");
    expect(html).toContain("Correction revision 2");
    expect(html).toContain(`Corrects: ${record.supersedesVersionId}`);
    expect(html).toContain("Human review · draft → in review");
    expect(html).toContain("Human review · in review → approved");
    expect(html).toContain('aria-label="Contact governance history"');
  });

  it("derives expiry at the supplied as-of time and fails closed despite an earlier approval", () => {
    const html = renderToStaticMarkup(
      <ContactGovernancePanel state="ready" record={approvedCorrection()} asOf="2028-01-01T00:00:00.000Z" />,
    );

    expect(html).toContain("Expired at as-of time");
    expect(html).toContain('data-freshness-state="expired-or-unknown"');
    expect(html.match(/data-eligibility="blocked"/g)).toHaveLength(2);
    expect(html).toContain("freshness not current");
    expect(html).toContain("does not authorize an external action");

    const beforeObservation = renderToStaticMarkup(
      <ContactGovernancePanel state="ready" record={approvedCorrection()} asOf="2026-01-01T00:00:00.000Z" />,
    );
    expect(beforeObservation).toContain("Not yet observed at as-of time");
    expect(beforeObservation.match(/data-eligibility="blocked"/g)).toHaveLength(2);
  });

  it("offers only explicit human review and correction callbacks with accessible native controls", () => {
    const draft = buildDraft();
    const html = renderToStaticMarkup(
      <ContactGovernancePanel
        state="ready"
        record={draft}
        asOf="2026-09-01T00:00:00.000Z"
        onReview={() => undefined}
        onCorrect={() => undefined}
      />,
    );

    expect(html.match(/<button\b/g)).toHaveLength(2);
    expect(html).toContain("Open human review");
    expect(html).toContain("Correct this version");
    expect(html).toContain("focus-visible:outline-2");
    expect(html).toContain('aria-describedby="contact-governance-actions-help"');
    expect(html).not.toMatch(/<(?:form|input|textarea|select)\b/u);
    expect(html).not.toMatch(/>[^<]*(?:send|recipient)[^<]*</iu);
  });

  it("renders explicit loading, error, and empty states", () => {
    const loading = renderToStaticMarkup(<ContactGovernancePanel state="loading" />);
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Loading governed contact");

    const error = renderToStaticMarkup(<ContactGovernancePanel state="error" error="Fixture unavailable." />);
    expect(error).toContain('role="alert"');
    expect(error).toContain("Fixture unavailable.");

    const empty = renderToStaticMarkup(<ContactGovernancePanel state="empty" />);
    expect(empty).toContain('data-contact-state="empty"');
    expect(empty).toContain("No governed contact selected");
  });
});
