import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  validateOutreachDraftCitations,
} from "@/lib/outreach/citation-validator";

const TENANT_ID = "tenant:fixture-a";
const WORKSPACE_ID = "workspace:revenue";
const ACCOUNT_ID = "account:fixture-001";
const DRAFT_ID = "outreach-draft:fixture-001";
const DRAFT_VERSION_ID = "outreach-draft-version:fixture-001-v1";
const BODY = "Your public catalog lists epoxy systems for industrial flooring.";
const CLAIM_TEXT = "epoxy systems for industrial flooring";
const CLAIM_START = BODY.indexOf(CLAIM_TEXT);
const CLAIM_END = CLAIM_START + CLAIM_TEXT.length;

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function draftContentHash(subject: string, body: string): string {
  return sha256(JSON.stringify({ subject, body }));
}

function request(overrides: Record<string, unknown> = {}) {
  const claimHash = sha256(CLAIM_TEXT);
  return {
    version: 1,
    scope: { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, accountId: ACCOUNT_ID },
    draft: {
      draftVersion: 1,
      draftId: DRAFT_ID,
      draftVersionId: DRAFT_VERSION_ID,
      contentHash: draftContentHash("A possible fit", BODY),
      subject: "A possible fit",
      body: BODY,
      claims: [{
        claimId: "draft-claim:fixture-001",
        field: "body",
        start: CLAIM_START,
        end: CLAIM_END,
        text: CLAIM_TEXT,
        textHash: claimHash,
        claimClass: "compatibility_application",
        material: true,
        citationIds: ["citation:fixture-001"],
        uncertainty: "Application fit still requires the recipient's confirmation.",
      }],
    },
    citations: [{
      citationVersion: 1,
      citationId: "citation:fixture-001",
      evidenceId: "evidence:fixture-001",
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      accountId: ACCOUNT_ID,
      state: "resolved",
      quoteHash: sha256("Industrial flooring epoxy systems"),
      locator: "catalog.pdf#page=4",
    }],
    evidence: [{
      evidenceVersion: 1,
      evidenceId: "evidence:fixture-001",
      sourceKind: "account",
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      accountId: ACCOUNT_ID,
      approvalState: "approved",
      support: "direct",
      freshness: "current",
      conflict: "none",
      revokedAt: null,
      claimTextHash: claimHash,
      quoteHash: sha256("Industrial flooring epoxy systems"),
      citationId: "citation:fixture-001",
    }],
    ...overrides,
  };
}

function mutable<T>(value: T): T {
  return structuredClone(value);
}

describe("F13 cited outreach validation", () => {
  it("returns deterministic deeply immutable material-claim bindings and preserves uncertainty", () => {
    const first = validateOutreachDraftCitations(request());
    const replay = validateOutreachDraftCitations(request());

    expect(first).toEqual(replay);
    expect(first).toMatchObject({ ok: true, code: "OUTREACH_CITATIONS_VALID" });
    if (!first.ok) throw new Error("expected valid citations");
    expect(first.value.claims[0]).toMatchObject({
      text: CLAIM_TEXT,
      uncertainty: "Application fit still requires the recipient's confirmation.",
      evidenceIds: ["evidence:fixture-001"],
    });
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.value)).toBe(true);
    expect(Object.isFrozen(first.value.claims)).toBe(true);
    expect(Object.isFrozen(first.value.claims[0])).toBe(true);
    expect(Object.isFrozen(first.value.claims[0].citationIds)).toBe(true);
    expect(Object.isFrozen(first.value.claims[0].evidenceIds)).toBe(true);
  });

  it("accepts approved tenant knowledge only when its account scope is null", () => {
    const input = mutable(request());
    Object.assign(input.citations[0], { accountId: null });
    Object.assign(input.evidence[0], { sourceKind: "knowledge", accountId: null });
    expect(validateOutreachDraftCitations(input).ok).toBe(true);
  });

  it("requires a resolvable citation for every material claim", () => {
    const noCitation = mutable(request());
    noCitation.draft.claims[0].citationIds = [];
    expect(validateOutreachDraftCitations(noCitation)).toEqual({ ok: false, code: "CITATION_REQUIRED" });

    const missing = mutable(request());
    missing.draft.claims[0].citationIds = ["citation:missing"];
    expect(validateOutreachDraftCitations(missing)).toEqual({ ok: false, code: "CITATION_UNRESOLVABLE" });
  });

  it("requires citations for every declared claim and fails closed on an empty inventory", () => {
    const mislabeled = mutable(request());
    Object.assign(mislabeled.draft.claims[0], { material: false, citationIds: [] });
    expect(validateOutreachDraftCitations(mislabeled)).toEqual({ ok: false, code: "CITATION_REQUIRED" });

    const omitted = mutable(request());
    omitted.draft.claims = [];
    expect(validateOutreachDraftCitations(omitted)).toEqual({ ok: false, code: "CITATION_REQUIRED" });
  });

  it("binds the citation quote hash to evidence", () => {
    const input = mutable(request());
    input.citations[0].quoteHash = sha256("fabricated quote");
    expect(validateOutreachDraftCitations(input)).toEqual({ ok: false, code: "CITATION_UNRESOLVABLE" });
  });

  it.each([
    ["approvalState", "pending", "EVIDENCE_UNAPPROVED"],
    ["freshness", "stale", "EVIDENCE_STALE"],
    ["freshness", "revoked", "EVIDENCE_REVOKED"],
    ["conflict", "conflicted", "EVIDENCE_CONFLICTED"],
    ["support", "inferred", "EVIDENCE_UNSUPPORTED"],
    ["support", "unsupported", "EVIDENCE_UNSUPPORTED"],
  ])("fails closed for %s=%s", (field, value, code) => {
    const input = mutable(request());
    Object.assign(input.evidence[0], { [field]: value });
    expect(validateOutreachDraftCitations(input)).toEqual({ ok: false, code });
  });

  it("treats a revocation timestamp as revoked even when freshness claims current", () => {
    const input = mutable(request());
    Object.assign(input.evidence[0], { revokedAt: "2026-08-30T00:00:00.000Z" });
    expect(validateOutreachDraftCitations(input)).toEqual({ ok: false, code: "EVIDENCE_REVOKED" });
  });

  it.each([
    ["scope", "tenantId", "tenant:other"],
    ["scope", "workspaceId", "workspace:other"],
    ["scope", "accountId", "account:other"],
    ["citation", "tenantId", "tenant:other"],
    ["citation", "workspaceId", "workspace:other"],
    ["citation", "accountId", "account:other"],
    ["evidence", "tenantId", "tenant:other"],
    ["evidence", "workspaceId", "workspace:other"],
    ["evidence", "accountId", "account:other"],
  ])("rejects cross-scope %s.%s", (target, field, value) => {
    const input = mutable(request());
    if (target === "scope") Object.assign(input.scope, { [field]: value });
    if (target === "citation") Object.assign(input.citations[0], { [field]: value });
    if (target === "evidence") Object.assign(input.evidence[0], { [field]: value });
    expect(validateOutreachDraftCitations(input).ok).toBe(false);
  });

  it("rejects an account evidence link presented as tenant knowledge and vice versa", () => {
    const accountWithoutAccount = mutable(request());
    Object.assign(accountWithoutAccount.citations[0], { accountId: null });
    Object.assign(accountWithoutAccount.evidence[0], { accountId: null });
    expect(validateOutreachDraftCitations(accountWithoutAccount)).toEqual({ ok: false, code: "SCOPE_MISMATCH" });

    const knowledgeWithAccount = mutable(request());
    knowledgeWithAccount.evidence[0].sourceKind = "knowledge";
    expect(validateOutreachDraftCitations(knowledgeWithAccount)).toEqual({ ok: false, code: "SCOPE_MISMATCH" });
  });

  it("rejects out-of-scope and unused citation or evidence records", () => {
    const foreign = mutable(request());
    foreign.citations.push({
      ...foreign.citations[0], citationId: "citation:foreign", evidenceId: "evidence:foreign",
      tenantId: "tenant:other", workspaceId: "workspace:other", accountId: "account:other",
    });
    foreign.evidence.push({
      ...foreign.evidence[0], evidenceId: "evidence:foreign", citationId: "citation:foreign",
      tenantId: "tenant:other", workspaceId: "workspace:other", accountId: "account:other",
    });
    expect(validateOutreachDraftCitations(foreign)).toEqual({ ok: false, code: "SCOPE_MISMATCH" });

    const unused = mutable(request());
    unused.citations.push({
      ...unused.citations[0], citationId: "citation:unused", evidenceId: "evidence:unused",
    });
    unused.evidence.push({
      ...unused.evidence[0], evidenceId: "evidence:unused", citationId: "citation:unused",
    });
    expect(validateOutreachDraftCitations(unused)).toEqual({ ok: false, code: "CITATION_UNRESOLVABLE" });
  });

  it("invalidates citations when claim text, its hash, its span, or the draft content changes", () => {
    const cases = [
      (input: ReturnType<typeof request>) => { input.draft.claims[0].text = "industrial flooring"; },
      (input: ReturnType<typeof request>) => { input.draft.claims[0].textHash = sha256("different"); },
      (input: ReturnType<typeof request>) => { input.draft.claims[0].start += 1; },
      (input: ReturnType<typeof request>) => { input.draft.body += " Edited."; },
      (input: ReturnType<typeof request>) => { input.evidence[0].claimTextHash = sha256("different"); },
    ];
    for (const mutate of cases) {
      const input = mutable(request());
      mutate(input);
      expect(validateOutreachDraftCitations(input).ok).toBe(false);
    }
  });

  it("rejects overlapping spans and duplicate identifiers", () => {
    const overlap = mutable(request());
    overlap.draft.claims.push({
      ...overlap.draft.claims[0], claimId: "draft-claim:fixture-002",
    });
    expect(validateOutreachDraftCitations(overlap)).toEqual({ ok: false, code: "CLAIM_SPAN_MISMATCH" });

    const duplicateCitation = mutable(request());
    duplicateCitation.citations.push({ ...duplicateCitation.citations[0] });
    expect(validateOutreachDraftCitations(duplicateCitation)).toEqual({ ok: false, code: "DUPLICATE_ID" });
  });

  it("rejects malformed Unicode and spans that split surrogate pairs", () => {
    const malformed = mutable(request());
    malformed.draft.subject = "Broken \ud83d";
    malformed.draft.contentHash = draftContentHash(malformed.draft.subject, malformed.draft.body);
    expect(validateOutreachDraftCitations(malformed)).toEqual({ ok: false, code: "MALFORMED_INPUT" });

    const split = mutable(request());
    split.draft.body = "X😀Y";
    split.draft.contentHash = draftContentHash(split.draft.subject, split.draft.body);
    split.draft.claims = [{
      ...split.draft.claims[0], start: 1, end: 2, text: "\ud83d", textHash: sha256("\ud83d"),
    }];
    expect(validateOutreachDraftCitations(split).ok).toBe(false);

    const whole = mutable(request());
    whole.draft.body = "X😀Y";
    whole.draft.contentHash = draftContentHash(whole.draft.subject, whole.draft.body);
    whole.draft.claims = [{
      ...whole.draft.claims[0], start: 1, end: 3, text: "😀", textHash: sha256("😀"),
    }];
    whole.evidence[0].claimTextHash = sha256("😀");
    expect(validateOutreachDraftCitations(whole).ok).toBe(true);
  });

  it.each([
    "<script>alert(1)</script>",
    "Click javascript:alert(1)",
    "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456",
    "-----BEGIN PRIVATE KEY-----",
    "ghp_abcdefghijklmnopqrstuvwxyz1234567890",
    "Safe\u034f<script>alert(1)</script>",
    "Send\u200b this automatically",
    "＜ｓｃｒｉｐｔ＞alert(1)＜／ｓｃｒｉｐｔ＞",
    "ｇｈｐ＿abcdefghijklmnopqrstuvwxyz1234567890",
  ])("rejects secrets, active markup, and default-ignorable bypasses", (unsafe) => {
    const input = mutable(request());
    input.draft.body = unsafe;
    input.draft.contentHash = draftContentHash(input.draft.subject, input.draft.body);
    input.draft.claims = [];
    expect(validateOutreachDraftCitations(input)).toEqual({ ok: false, code: "UNSAFE_CONTENT" });
  });

  it.each([
    ["root", "send", true],
    ["root", "recipient", "person@example.test"],
    ["draft", "sendAt", "2026-08-30T00:00:00.000Z"],
    ["draft", "deliveredAt", "2026-08-30T00:00:00.000Z"],
    ["draft", "recipientEmail", "person@example.test"],
  ])("rejects automatic-send and recipient-delivery field %s.%s", (target, field, value) => {
    const input = mutable(request()) as ReturnType<typeof request> & Record<string, unknown>;
    if (target === "root") input[field] = value;
    else Object.assign(input.draft, { [field]: value });
    expect(validateOutreachDraftCitations(input)).toEqual({ ok: false, code: "DELIVERY_FIELD_FORBIDDEN" });
  });

  it("rejects accessors and proxy traps without executing a downstream action", () => {
    let accessed = false;
    const accessor = mutable(request());
    Object.defineProperty(accessor.draft, "body", {
      enumerable: true,
      get() {
        accessed = true;
        return BODY;
      },
    });
    expect(validateOutreachDraftCitations(accessor)).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(accessed).toBe(false);

    let traps = 0;
    const hostileOwnKeys = new Proxy({}, { ownKeys() { traps += 1; throw new Error("trap"); } });
    expect(validateOutreachDraftCitations(hostileOwnKeys)).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    const hostilePrototype = new Proxy({}, { getPrototypeOf() { traps += 1; throw new Error("trap"); } });
    expect(validateOutreachDraftCitations(hostilePrototype)).toEqual({ ok: false, code: "MALFORMED_INPUT" });

    const nested = mutable(request());
    Object.assign(nested, { draft: new Proxy({}, { ownKeys() { traps += 1; throw new Error("nested trap"); } }) });
    expect(validateOutreachDraftCitations(nested)).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(traps).toBe(0);
  });

  it("rejects non-canonical revocation timestamps", () => {
    const input = mutable(request());
    Object.assign(input.evidence[0], { revokedAt: "2026-02-30T00:00:00.000Z" });
    expect(validateOutreachDraftCitations(input)).toEqual({ ok: false, code: "MALFORMED_INPUT" });
  });

  it("does not retain mutable input aliases", () => {
    const input = mutable(request());
    const result = validateOutreachDraftCitations(input);
    if (!result.ok) throw new Error("expected valid citations");
    input.draft.claims[0].uncertainty = "mutated";
    input.draft.claims[0].citationIds[0] = "citation:mutated";
    expect(result.value.claims[0].uncertainty).toContain("recipient's confirmation");
    expect(result.value.claims[0].citationIds).toEqual(["citation:fixture-001"]);
  });
});
