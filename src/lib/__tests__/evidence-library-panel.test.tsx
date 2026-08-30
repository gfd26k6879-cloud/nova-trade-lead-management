import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  EvidenceLibraryPanel,
  type EvidenceLibraryItem,
} from "@/components/knowledge/evidence-library-panel";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000001";
const DOCUMENT_ID = "30000000-0000-4000-8000-000000000001";
const VERSION_ID = "40000000-0000-4000-8000-000000000001";
const SCOPE = { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID } as const;

function item(overrides: Partial<EvidenceLibraryItem> = {}): EvidenceLibraryItem {
  return {
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    claim: {
      claimId: `claim:${"a".repeat(64)}`,
      claimVersionId: `claim-version:${"b".repeat(64)}`,
      claimClass: "product_technical_specification",
      statement: "The rated output is 5 kW.",
      reviewState: "proposed",
    },
    source: {
      label: "Private document · Product specification",
      documentId: DOCUMENT_ID,
      documentVersionId: VERSION_ID,
    },
    citation: {
      citationId: `citation:${"c".repeat(64)}`,
      evidenceId: `evidence:${"d".repeat(64)}`,
      state: "resolved",
      locatorLabel: "Page 4 · lines 18–19",
    },
    freshness: "current",
    conflict: "clear",
    actions: { open: "allowed", review: "allowed" },
    ...overrides,
  };
}

describe("EvidenceLibraryPanel", () => {
  it("renders exact scope and canonical claim, source, document, version, locator, health, and review summaries", () => {
    const current = item();
    const conflicted = item({
      claim: { ...current.claim, claimId: `claim:${"e".repeat(64)}`, claimVersionId: `claim-version:${"f".repeat(64)}`, statement: "Operating limit needs confirmation.", reviewState: "accepted" },
      citation: { ...current.citation, citationId: `citation:${"1".repeat(64)}`, evidenceId: `evidence:${"2".repeat(64)}` },
      freshness: "stale",
      conflict: "conflicted",
    });
    const html = renderToStaticMarkup(<EvidenceLibraryPanel state="ready" scope={SCOPE} items={[current, conflicted]} />);

    expect(html).toContain('data-surface="evidence-library-panel"');
    expect(html).toContain('aria-label="Exact evidence-library scope"');
    expect(html).toContain(TENANT_ID);
    expect(html).toContain(WORKSPACE_ID);
    expect(html).toContain("The rated output is 5 kW.");
    expect(html).toContain("Private document · Product specification");
    expect(html).toContain(DOCUMENT_ID);
    expect(html).toContain(VERSION_ID);
    expect(html).toContain("Page 4 · lines 18–19");
    expect(html).toContain("Current");
    expect(html).toContain("Stale");
    expect(html).toContain("Conflicting evidence");
    expect(html).toContain("Awaiting review");
    expect(html).toContain("Human accepted");
    expect(html).toContain("2 citations · 1 awaiting review · 1 conflicted");
  });

  it("shows accessible loading, error, explicit empty, and defensive empty states", () => {
    const loading = renderToStaticMarkup(<EvidenceLibraryPanel state="loading" />);
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Loading evidence library");

    const error = renderToStaticMarkup(<EvidenceLibraryPanel state="error" error="Evidence read model unavailable." />);
    expect(error).toContain('role="alert"');
    expect(error).toContain("Evidence library unavailable");
    expect(error).toContain("Evidence read model unavailable.");

    const empty = renderToStaticMarkup(<EvidenceLibraryPanel state="empty" />);
    const defensiveEmpty = renderToStaticMarkup(<EvidenceLibraryPanel state="ready" scope={SCOPE} items={[]} />);
    expect(empty).toContain("No evidence yet");
    expect(defensiveEmpty).toContain("No evidence yet");
  });

  it("renders only supplied callbacks allowed by canonical action and review state", () => {
    const proposed = item();
    const accepted = item({
      claim: { ...proposed.claim, claimId: `claim:${"3".repeat(64)}`, claimVersionId: `claim-version:${"4".repeat(64)}`, reviewState: "accepted" },
      citation: { ...proposed.citation, citationId: `citation:${"5".repeat(64)}`, evidenceId: `evidence:${"6".repeat(64)}` },
    });
    const blocked = item({
      claim: { ...proposed.claim, claimId: `claim:${"7".repeat(64)}`, claimVersionId: `claim-version:${"8".repeat(64)}` },
      citation: { ...proposed.citation, citationId: `citation:${"9".repeat(64)}`, evidenceId: `evidence:${"0".repeat(64)}` },
      actions: { open: "blocked", review: "blocked" },
    });
    const html = renderToStaticMarkup(
      <EvidenceLibraryPanel state="ready" scope={SCOPE} items={[proposed, accepted, blocked]} onOpen={() => undefined} onReview={() => undefined} />,
    );

    expect(html.match(/data-evidence-library-action="open"/g)).toHaveLength(2);
    expect(html.match(/data-evidence-library-action="review"/g)).toHaveLength(1);
    expect(html.match(/<button\b/g)).toHaveLength(3);
    expect(html).toContain("focus-visible:outline-2");
    expect(html).not.toMatch(/<(?:form|input|textarea|select)\b/u);

    const readOnly = renderToStaticMarkup(<EvidenceLibraryPanel state="ready" scope={SCOPE} items={[proposed]} />);
    expect(readOnly).not.toMatch(/<button\b/u);
  });

  it("fails closed without enumerating tenant or workspace mismatches", () => {
    for (const mismatch of [
      item({ tenantId: "10000000-0000-4000-8000-000000000099" }),
      item({ workspaceId: "20000000-0000-4000-8000-000000000099" }),
    ]) {
      const html = renderToStaticMarkup(<EvidenceLibraryPanel state="ready" scope={SCOPE} items={[mismatch]} onOpen={() => undefined} onReview={() => undefined} />);
      expect(html).toContain("The evidence-library tenant or workspace scope could not be verified.");
      expect(html).not.toContain("The rated output is 5 kW.");
      expect(html).not.toMatch(/<button\b/u);
    }
  });

  it("escapes supplied labels and keeps a responsive, ordered heading hierarchy", () => {
    const unsafe = item({
      claim: { ...item().claim, statement: "<script>alert('claim')</script>" },
      source: { ...item().source, label: "<img src=x onerror=alert('source')>" },
    });
    const html = renderToStaticMarkup(<EvidenceLibraryPanel state="ready" scope={SCOPE} items={[unsafe]} />);

    expect(html).toContain("&lt;script&gt;alert(&#x27;claim&#x27;)&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(&#x27;source&#x27;)&gt;");
    expect(html).not.toMatch(/<(?:script|img)\b/u);
    expect(html.match(/<h2\b/g)).toHaveLength(1);
    expect(html.indexOf("<h2")).toBeLessThan(html.indexOf("<h3"));
    expect(html).toContain("2xl:grid-cols-2");
    expect(html).toContain("sm:grid-cols-2");
    expect(html).toContain("break-all");
  });
});
