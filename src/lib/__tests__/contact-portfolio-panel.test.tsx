import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ContactPortfolioPanel,
  type ContactPortfolioItem,
} from "@/components/contacts/contact-portfolio-panel";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000001";
const SCOPE = { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID } as const;

function contact(overrides: Partial<ContactPortfolioItem> = {}): ContactPortfolioItem {
  return {
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    accountId: "30000000-0000-4000-8000-000000000001",
    stableKey: "contact:synthetic-procurement",
    versionId: `contact-version:${"a".repeat(64)}`,
    identity: {
      kind: "person_candidate",
      displayName: "Synthetic Buyer",
      contactPointClass: "named_business_email",
      contactPoint: "buyer@example.test",
      verification: "source_observed",
    },
    roleHypothesis: {
      status: "hypothesis",
      roleKey: "procurement",
      statement: "The governed source labels this contact as procurement.",
      confidenceBasisPoints: 7_500,
      evidenceReceiptHash: `sha256:${"b".repeat(64)}`,
    },
    source: {
      connectorKey: "customer-list",
      sourceVersionId: "customer-list-version:fixture-v1",
    },
    freshness: {
      state: "KNOWN",
      observedAt: "2026-08-30T12:01:00.000Z",
      expiresAt: "2027-08-30T12:01:00.000Z",
    },
    permittedUse: {
      sourcePolicy: "KNOWN",
      channelAuthorization: "KNOWN",
      consentSignal: "UNKNOWN",
    },
    suppressionDisposition: "clear",
    review: { status: "draft", needed: true },
    actions: { select: "available", review: "available" },
    ...overrides,
  };
}

describe("ContactPortfolioPanel", () => {
  it("renders canonical identity, role hypothesis, provenance, use, suppression, and review summaries", () => {
    const html = renderToStaticMarkup(
      <ContactPortfolioPanel
        state="ready"
        scope={SCOPE}
        contacts={[
          contact(),
          contact({
            stableKey: "contact:verified-role",
            versionId: `contact-version:${"c".repeat(64)}`,
            identity: {
              kind: "role_contact",
              displayName: "Procurement Desk",
              contactPointClass: "business_role_mailbox",
              contactPoint: "procurement@example.test",
              verification: "human_corrected",
            },
            roleHypothesis: null,
            freshness: {
              state: "STALE",
              observedAt: "2025-08-30T12:01:00.000Z",
              expiresAt: "2026-08-30T12:01:00.000Z",
            },
            permittedUse: {
              sourcePolicy: "CONFLICTED",
              channelAuthorization: "UNKNOWN",
              consentSignal: "STALE",
            },
            suppressionDisposition: "do_not_contact",
            review: { status: "approved", needed: false },
            actions: { select: "available", review: "blocked" },
          }),
        ]}
      />,
    );

    expect(html).toContain('data-surface="contact-portfolio-panel"');
    expect(html).toContain('aria-label="Governed contact portfolio"');
    expect(html).toContain("2 contacts · 1 review needed");
    expect(html).toContain("Synthetic Buyer");
    expect(html).toContain("person candidate");
    expect(html).toContain("Source observed");
    expect(html).toContain("Explicit hypothesis");
    expect(html).toContain("75% confidence · not verified fact");
    expect(html).toContain("customer-list-version:fixture-v1");
    expect(html).toContain("Freshness known");
    expect(html).toContain("Consent signal");
    expect(html).toContain('data-governance-state="UNKNOWN"');
    expect(html).toContain('data-suppression="clear"');
    expect(html).toContain("Procurement Desk");
    expect(html).toContain("Human corrected");
    expect(html).toContain("No role hypothesis supplied.");
    expect(html).toContain("Freshness stale");
    expect(html).toContain("Suppression: do not contact");
  });

  it("renders explicit accessible loading, error, and empty states", () => {
    const loading = renderToStaticMarkup(<ContactPortfolioPanel state="loading" />);
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Loading contact portfolio");

    const error = renderToStaticMarkup(<ContactPortfolioPanel state="error" error="Portfolio snapshot unavailable." />);
    expect(error).toContain('role="alert"');
    expect(error).toContain("Contact portfolio unavailable");
    expect(error).toContain("Portfolio snapshot unavailable.");

    const empty = renderToStaticMarkup(<ContactPortfolioPanel state="empty" />);
    expect(empty).toContain('data-state="STATE-EMPTY"');
    expect(empty).toContain("No governed contacts yet");

    const defensiveEmpty = renderToStaticMarkup(<ContactPortfolioPanel state="ready" scope={SCOPE} contacts={[]} />);
    expect(defensiveEmpty).toContain('data-state="STATE-EMPTY"');
  });

  it("shows only supplied state-gated select and review callbacks", () => {
    const html = renderToStaticMarkup(
      <ContactPortfolioPanel
        state="ready"
        scope={SCOPE}
        contacts={[
          contact(),
          contact({
            stableKey: "contact:select-only",
            versionId: `contact-version:${"d".repeat(64)}`,
            review: { status: "approved", needed: false },
            actions: { select: "available", review: "blocked" },
          }),
          contact({
            stableKey: "contact:blocked",
            versionId: `contact-version:${"e".repeat(64)}`,
            actions: { select: "blocked", review: "blocked" },
          }),
          contact({
            stableKey: "contact:review-mismatch",
            versionId: `contact-version:${"f".repeat(64)}`,
            review: { status: "approved", needed: false },
            actions: { select: "blocked", review: "available" },
          }),
        ]}
        onSelect={() => undefined}
        onRequestReview={() => undefined}
      />,
    );

    expect(html.match(/>Open governed contact</g)).toHaveLength(2);
    expect(html.match(/>Review contact</g)).toHaveLength(1);
    expect(html.match(/<button\b/g)).toHaveLength(3);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*focus-visible:outline-2/u);
    expect(html).not.toMatch(/<(?:form|input|textarea|select)\b/u);
    expect(html).not.toMatch(/>[^<]*(?:send|recipient)[^<]*</iu);

    const readOnly = renderToStaticMarkup(<ContactPortfolioPanel state="ready" scope={SCOPE} contacts={[contact()]} />);
    expect(readOnly).not.toMatch(/<button\b/u);
  });

  it("uses one ordered heading hierarchy and responsive, break-safe cards", () => {
    const html = renderToStaticMarkup(
      <ContactPortfolioPanel
        state="ready"
        scope={SCOPE}
        contacts={[contact()]}
        onSelect={() => undefined}
        onRequestReview={() => undefined}
      />,
    );

    expect(html.match(/<h2\b/g)).toHaveLength(1);
    expect(html.indexOf("<h2")).toBeLessThan(html.indexOf("<h3"));
    expect(html).toContain('aria-labelledby="contact-portfolio-title"');
    expect(html).toContain("xl:grid-cols-2");
    expect(html).toContain("lg:grid-cols-2");
    expect(html).toContain("sm:grid-cols-3");
    expect(html).toMatch(/class="[^"]*break-all[^"]*"[^>]*>contact:synthetic-procurement</u);
    expect(html).toContain("min-h-11 w-full");
  });

  it("fails closed without enumerating contacts from a mismatched scope", () => {
    const html = renderToStaticMarkup(
      <ContactPortfolioPanel
        state="ready"
        scope={SCOPE}
        contacts={[contact({ tenantId: "10000000-0000-4000-8000-000000000099" })]}
        onSelect={() => undefined}
      />,
    );

    expect(html).toContain("The contact portfolio scope could not be verified.");
    expect(html).not.toContain("Synthetic Buyer");
    expect(html).not.toMatch(/<button\b/u);
  });
});
