import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  OutcomeEntryPanel,
  type OutcomeEntryContext,
} from "@/components/outcomes/outcome-entry-panel";
import type { OutcomeRecord } from "@/lib/outcomes/outcome-record";

const TENANT = "10000000-0000-4000-8000-000000000001";
const WORKSPACE = "20000000-0000-4000-8000-000000000001";
const ACCOUNT = "30000000-0000-4000-8000-000000000001";
const ACTOR = "40000000-0000-4000-8000-000000000001";
const PLAY = `lead-play-version:${"a".repeat(64)}`;
const DRAFT = `outreach-draft-version:${"b".repeat(64)}`;
const HASH = `sha256:${"c".repeat(64)}`;
const PRIOR = `outcome-version:${"d".repeat(64)}`;
const CURRENT = `outcome-version:${"e".repeat(64)}`;

const context: OutcomeEntryContext = {
  tenantId: TENANT,
  workspaceId: WORKSPACE,
  accountId: ACCOUNT,
  playVersionId: PLAY,
  outreachVersionId: DRAFT,
};

function outcome(overrides: Partial<OutcomeRecord> = {}): OutcomeRecord {
  return {
    schemaVersion: 1,
    tenantId: TENANT,
    workspaceId: WORKSPACE,
    accountId: ACCOUNT,
    playVersionId: PLAY,
    versionId: CURRENT,
    versionHash: HASH,
    stableKey: "outcome:fixture",
    revision: 2,
    supersedesVersionId: PRIOR,
    outcome: "meeting_set",
    channel: "email",
    bounceClassification: null,
    occurredAt: "2026-08-30T12:20:00.000Z",
    recordedAt: "2026-08-30T14:00:00.000Z",
    notes: "Human corrected the reply after reviewing the source.",
    source: {
      sourceVersion: 1,
      tenantId: TENANT,
      workspaceId: WORKSPACE,
      accountId: ACCOUNT,
      kind: "member_observation",
      sourceId: "manual-observation:fixture",
      sourceVersionId: "manual-observation-version:fixture-v2",
      sourceContentHash: HASH,
      sourceReceiptHash: HASH,
      observedAt: "2026-08-30T13:30:00.000Z",
      sourceHash: HASH,
    },
    recordedBy: { kind: "human", actorId: ACTOR },
    outreachDraftVersionRef: {
      draftRefVersion: 1,
      tenantId: TENANT,
      workspaceId: WORKSPACE,
      accountId: ACCOUNT,
      playVersionId: PLAY,
      versionId: DRAFT,
      contentHash: HASH,
      reviewHash: HASH,
      draftRefHash: HASH,
    },
    attribution: {
      kind: "direct",
      confidenceBasisPoints: 8_000,
      rationale: "The operator explicitly linked this meeting to the reviewed draft.",
      attributedAt: "2026-08-30T13:45:00.000Z",
      evidenceRefs: [{ kind: "outreach_draft_version", refId: DRAFT, refHash: HASH }],
    },
    audit: [
      {
        action: "recorded",
        revision: 1,
        supersedesVersionId: null,
        actor: { kind: "human", actorId: ACTOR },
        at: "2026-08-30T13:00:00.000Z",
        reason: "Initial human observation.",
        eventHash: `sha256:${"f".repeat(64)}`,
      },
      {
        action: "corrected",
        revision: 2,
        supersedesVersionId: PRIOR,
        actor: { kind: "human", actorId: ACTOR },
        at: "2026-08-30T14:00:00.000Z",
        reason: "The original classification was incomplete.",
        eventHash: `sha256:${"1".repeat(64)}`,
      },
    ],
    contentHash: HASH,
    ...overrides,
  };
}

describe("outcome entry panel", () => {
  it("binds the current outcome to account, play, and outreach version and shows correction lineage", () => {
    const html = renderToStaticMarkup(
      <OutcomeEntryPanel
        state="ready"
        context={context}
        currentOutcome={outcome()}
        actionAuthorizations={{ record: false, correct: true }}
        actionStates={{ record: "blocked", correct: "available" }}
        onCorrect={vi.fn()}
      />,
    );

    expect(html).toContain("Exact context binding");
    expect(html).toContain(ACCOUNT);
    expect(html).toContain(PLAY);
    expect(html).toContain(DRAFT);
    expect(html).toContain("meeting set");
    expect(html).toContain("Revision 2");
    expect(html).toContain(PRIOR);
    expect(html).toContain("Correction lineage");
    expect(html).toContain("Revision 1 · recorded");
    expect(html).toContain("Revision 2 · corrected");
    expect(html).toContain("Correct current outcome");
    expect(html).not.toContain(">Record outcome<");
  });

  it("offers first recording only for an authorized available empty context", () => {
    const allowed = renderToStaticMarkup(
      <OutcomeEntryPanel
        state="ready"
        context={context}
        currentOutcome={null}
        actionAuthorizations={{ record: true, correct: false }}
        actionStates={{ record: "available", correct: "blocked" }}
        onRecord={vi.fn()}
      />,
    );
    expect(allowed).toContain("No outcome recorded yet");
    expect(allowed).toContain(">Record outcome<");

    const denied = renderToStaticMarkup(
      <OutcomeEntryPanel
        state="ready"
        context={context}
        currentOutcome={null}
        actionAuthorizations={{ record: false, correct: false }}
        actionStates={{ record: "available", correct: "blocked" }}
        onRecord={vi.fn()}
      />,
    );
    expect(denied).not.toContain(">Record outcome<");
    expect(denied).toContain("No outcome action is available");
  });

  it("blocks correction when the supplied current outcome is not bound to the selected context", () => {
    const foreignAccount = "30000000-0000-4000-8000-000000000002";
    const html = renderToStaticMarkup(
      <OutcomeEntryPanel
        state="ready"
        context={context}
        currentOutcome={outcome({ accountId: foreignAccount })}
        actionAuthorizations={{ record: false, correct: true }}
        actionStates={{ record: "blocked", correct: "available" }}
        onCorrect={vi.fn()}
      />,
    );

    expect(html).toContain('data-outcome-entry-state="invalid"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("binding could not be verified");
    expect(html).not.toContain(foreignAccount);
    expect(html).not.toContain("meeting set");
    expect(html).not.toContain(">Correct current outcome<");
  });

  it("renders accessible loading, error, and empty states", () => {
    const loading = renderToStaticMarkup(<OutcomeEntryPanel state="loading" />);
    expect(loading).toContain('data-outcome-entry-state="loading"');
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');

    const error = renderToStaticMarkup(<OutcomeEntryPanel state="error" error="Outcome fixture unavailable." />);
    expect(error).toContain('data-outcome-entry-state="error"');
    expect(error).toContain('role="alert"');
    expect(error).toContain("Outcome fixture unavailable.");

    const empty = renderToStaticMarkup(<OutcomeEntryPanel state="empty" />);
    expect(empty).toContain('data-outcome-entry-state="empty"');
    expect(empty).toContain("Select an account outcome");
  });

  it("keeps bindings and actions responsive and break-safe", () => {
    const html = renderToStaticMarkup(
      <OutcomeEntryPanel
        state="ready"
        context={context}
        currentOutcome={outcome()}
        actionAuthorizations={{ record: false, correct: true }}
        actionStates={{ record: "blocked", correct: "available" }}
        onCorrect={vi.fn()}
      />,
    );

    expect(html).toContain("sm:grid-cols-2 xl:grid-cols-3");
    expect(html).toContain("grid gap-4 xl:grid-cols-2");
    expect(html).toMatch(/class="[^"]*break-all[^"]*"[^>]*>lead-play-version:/);
    expect(html).toContain("min-h-11 w-full");
  });
});
