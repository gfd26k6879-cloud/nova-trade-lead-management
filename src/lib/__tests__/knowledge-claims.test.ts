import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  createCitedKnowledgeClaims,
  transitionCitedKnowledgeClaimReview,
} from "@/lib/knowledge/claims";
import { createKnowledgeEvidenceCitations } from "@/lib/knowledge/evidence-citations";
import { runKnowledgeExtractionPipeline } from "@/lib/knowledge/extraction-pipeline";

const TENANT_ID = "00000000-0000-4000-8000-0000000000a1";
const WORKSPACE_ID = "10000000-0000-4000-8000-0000000000a1";
const DOCUMENT_ID = "20000000-0000-4000-8000-0000000000a1";
const VERSION_ID = "30000000-0000-4000-8000-0000000000a1";
const POLICY_VERSION = "launch-v1";

async function evidenceFixture(source = "Viscosity is 120 mPa·s") {
  const bytes = new TextEncoder().encode(source);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const binding = { versionId: VERSION_ID, checksum, policyVersion: POLICY_VERSION };
  const extracted = await runKnowledgeExtractionPipeline({
    version: 1,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    documentId: DOCUMENT_ID,
    candidate: {
      version: { versionId: VERSION_ID, checksum, state: "clean" },
      immutable: true,
      format: "txt",
      cleanBinding: { ...binding },
      expectedBinding: { ...binding },
      parserMetadata: { ...binding, validated: true },
    },
    mediaType: "text/plain",
    bytes,
    chunking: { algorithmVersion: "structural-v1", maxUtf8Bytes: 4096, maxBlocksPerChunk: 8 },
  });
  if (!extracted.ok) throw new Error(`fixture extraction failed: ${extracted.stage}/${extracted.code}`);
  const artifact = extracted.artifact;
  const linked = createKnowledgeEvidenceCitations({
    version: 1,
    scope: {
      tenantId: artifact.binding.tenantId,
      workspaceId: artifact.binding.workspaceId,
      documentId: artifact.binding.documentId,
      documentVersionId: artifact.binding.documentVersionId,
      checksum: artifact.binding.checksum,
      scannerPolicyVersion: artifact.binding.scannerPolicyVersion,
    },
    extraction: {
      artifactVersion: artifact.artifactVersion,
      binding: artifact.binding,
      blocks: artifact.blocks,
    },
    anchors: artifact.blocks.map((block) => ({
      blockOrdinal: block.ordinal,
      blockContentHash: block.contentHash,
      sourceLocator: block.sourceLocator,
      quoteStart: 0,
      quoteEnd: block.text.length,
      quote: block.text,
      quoteHash: `sha256:${createHash("sha256").update(block.text, "utf8").digest("hex")}`,
    })),
  });
  if (!linked.ok) throw new Error(`fixture evidence failed: ${linked.code}`);
  return linked;
}

function claimInput(linked: Awaited<ReturnType<typeof evidenceFixture>>) {
  return {
    version: 1,
    scope: {
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      documentId: DOCUMENT_ID,
      documentVersionId: VERSION_ID,
      checksum: linked.evidence[0].checksum,
      scannerPolicyVersion: POLICY_VERSION,
    },
    evidence: linked.evidence,
    citations: linked.citations,
    proposals: [{
      claimClass: "product_technical_specification",
      subject: "Epoxy resin ER-120",
      predicate: "viscosity",
      value: "120",
      unit: "mPa·s",
      polarity: "positive",
      material: true,
      confidenceBasisPoints: 7600,
      uncertainty: "The source does not state the test temperature.",
      citationIds: [linked.citations[0].citationId],
    }],
  };
}

type MutableClaimInput = {
  version: number;
  scope: Record<string, unknown>;
  evidence: Array<Record<string, unknown>>;
  citations: Array<Record<string, unknown>>;
  proposals: Array<Record<string, unknown> & { citationIds: string[] }>;
};

function mutableClaimInput(linked: Awaited<ReturnType<typeof evidenceFixture>>): MutableClaimInput {
  return structuredClone(claimInput(linked)) as unknown as MutableClaimInput;
}

describe("cited knowledge claims", () => {
  it("creates a deterministic immutable material claim that remains proposed", async () => {
    const linked = await evidenceFixture();
    const input = claimInput(linked);

    const first = createCitedKnowledgeClaims(input);
    const replay = createCitedKnowledgeClaims(structuredClone(input));

    expect(first).toEqual(replay);
    expect(first).toMatchObject({
      ok: true,
      code: "CLAIMS_PROPOSED",
      claims: [{
        claimVersion: 1,
        claimStatus: "proposed",
        reviewState: "proposed",
        confidenceBasisPoints: 7600,
        uncertainty: "The source does not state the test temperature.",
        citationIds: [linked.citations[0].citationId],
        evidenceIds: [linked.evidence[0].evidenceId],
      }],
    });
    if (!first.ok) return;
    expect(first.claims[0].claimId).toMatch(/^claim:[0-9a-f]{64}$/u);
    expect(first.claims[0].claimVersionId).toMatch(/^claim-version:[0-9a-f]{64}$/u);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.claims)).toBe(true);
    expect(Object.isFrozen(first.claims[0])).toBe(true);
    expect(Object.isFrozen(first.claims[0].citationIds)).toBe(true);
  });

  it("creates a new immutable version only for an explicit accepted review", async () => {
    const linked = await evidenceFixture();
    const proposed = createCitedKnowledgeClaims(claimInput(linked));
    if (!proposed.ok) throw new Error(proposed.code);

    const result = transitionCitedKnowledgeClaimReview({
      version: 1,
      scope: claimInput(linked).scope,
      claim: proposed.claims[0],
      evidence: linked.evidence,
      citations: linked.citations,
      expectedReviewState: "proposed",
      decision: {
        state: "accepted",
        reviewerId: "40000000-0000-4000-8000-0000000000a1",
        reason: "Verified the exact quoted source and preserved the stated limitation.",
      },
    });

    expect(result).toMatchObject({
      ok: true,
      code: "CLAIM_REVIEW_TRANSITIONED",
      claim: {
        claimId: proposed.claims[0].claimId,
        claimVersion: 2,
        supersedesClaimVersionId: proposed.claims[0].claimVersionId,
        reviewState: "accepted",
        confidenceBasisPoints: 7600,
        uncertainty: "The source does not state the test temperature.",
        citationIds: [linked.citations[0].citationId],
        reviewerId: "40000000-0000-4000-8000-0000000000a1",
      },
    });
    if (!result.ok) return;
    expect(result.claim.claimVersionId).not.toBe(proposed.claims[0].claimVersionId);
    expect(proposed.claims[0].reviewState).toBe("proposed");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.claim)).toBe(true);
  });

  it("orders claim versions deterministically regardless of proposal and support order", async () => {
    const linked = await evidenceFixture("First supported fact\nSecond supported fact");
    const input = claimInput(linked);
    const firstProposal = {
      ...input.proposals[0],
      subject: "First subject",
      predicate: "first_fact",
      value: "first",
      citationIds: [linked.citations[0].citationId],
    };
    const secondProposal = {
      ...input.proposals[0],
      subject: "Second subject",
      predicate: "second_fact",
      value: "second",
      citationIds: [linked.citations[1].citationId],
    };

    const first = createCitedKnowledgeClaims({
      ...input,
      proposals: [firstProposal, secondProposal],
    });
    const reordered = createCitedKnowledgeClaims({
      ...input,
      evidence: [...linked.evidence].reverse(),
      citations: [...linked.citations].reverse(),
      proposals: [secondProposal, firstProposal],
    });

    expect(first).toEqual(reordered);
    expect(first.ok && first.claims.map((claim) => claim.claimId)).toEqual(
      first.ok && first.claims.map((claim) => claim.claimId).sort(),
    );
  });

  it("rejects cross-scope, missing, fabricated, drifted, and duplicate support", async () => {
    const linked = await evidenceFixture();
    const cases: Array<readonly [
      string,
      (input: MutableClaimInput) => void,
      "SCOPE_MISMATCH" | "EVIDENCE_MISMATCH" | "MALFORMED_INPUT" | "DUPLICATE_ID" | "CITATION_REQUIRED",
    ]> = [
      ["cross-scope evidence", (input) => {
        input.scope.tenantId = "00000000-0000-4000-8000-0000000000b2";
      }, "SCOPE_MISMATCH"],
      ["cross-scope citation", (input) => {
        input.citations[0].tenantId = "00000000-0000-4000-8000-0000000000b2";
      }, "EVIDENCE_MISMATCH"],
      ["missing material citation", (input) => {
        input.proposals[0].citationIds = [];
      }, "CITATION_REQUIRED"],
      ["fabricated citation", (input) => {
        input.proposals[0].citationIds = [`citation:${"f".repeat(64)}`];
      }, "EVIDENCE_MISMATCH"],
      ["fabricated quote", (input) => {
        input.citations[0].quote = "fabricated";
        input.citations[0].quoteHash = `sha256:${createHash("sha256")
          .update("fabricated", "utf8").digest("hex")}`;
      }, "EVIDENCE_MISMATCH"],
      ["quote hash drift", (input) => {
        input.citations[0].quoteHash = `sha256:${"f".repeat(64)}`;
      }, "MALFORMED_INPUT"],
      ["duplicate evidence ID", (input) => {
        input.evidence.push(structuredClone(input.evidence[0]));
      }, "DUPLICATE_ID"],
      ["duplicate citation ID", (input) => {
        input.citations.push(structuredClone(input.citations[0]));
      }, "DUPLICATE_ID"],
      ["duplicate claim ID", (input) => {
        input.proposals.push(structuredClone(input.proposals[0]));
      }, "DUPLICATE_ID"],
      ["unsafe control text", (input) => {
        input.proposals[0].subject = "unsafe\u0000subject";
      }, "MALFORMED_INPUT"],
    ];

    for (const [label, mutate, code] of cases) {
      const input = mutableClaimInput(linked);
      mutate(input);
      expect(createCitedKnowledgeClaims(input), label).toEqual({ ok: false, code });
    }
  });

  it("rejects proxies and accessors without executing traps or getters", async () => {
    const linked = await evidenceFixture();
    const proposed = createCitedKnowledgeClaims(claimInput(linked));
    if (!proposed.ok) throw new Error(proposed.code);
    let executions = 0;
    const trap = (): never => {
      executions += 1;
      throw new Error("must not execute");
    };

    const topProxy = new Proxy(mutableClaimInput(linked), { getPrototypeOf: trap });
    const evidenceProxy = mutableClaimInput(linked);
    evidenceProxy.evidence[0] = new Proxy(evidenceProxy.evidence[0], { getPrototypeOf: trap });
    const proposalProxy = mutableClaimInput(linked);
    proposalProxy.proposals[0] = new Proxy(proposalProxy.proposals[0], { getPrototypeOf: trap });
    const scopeAccessor = mutableClaimInput(linked);
    Object.defineProperty(scopeAccessor.scope, "tenantId", { enumerable: true, get: trap });

    for (const input of [topProxy, evidenceProxy, proposalProxy, scopeAccessor]) {
      expect(createCitedKnowledgeClaims(input)).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    }

    const transition = {
      version: 1,
      scope: claimInput(linked).scope,
      claim: proposed.claims[0],
      evidence: linked.evidence,
      citations: linked.citations,
      expectedReviewState: "proposed",
      decision: {
        state: "rejected",
        reviewerId: "40000000-0000-4000-8000-0000000000a1",
        reason: "The cited text does not state the test temperature.",
      },
    };
    const claimProxy = structuredClone(transition) as unknown as Record<string, unknown>;
    claimProxy.claim = new Proxy(claimProxy.claim as Record<string, unknown>, { getPrototypeOf: trap });
    const decisionAccessor = structuredClone(transition) as unknown as Record<string, unknown>;
    Object.defineProperty(decisionAccessor.decision, "reason", { enumerable: true, get: trap });
    for (const input of [claimProxy, decisionAccessor]) {
      expect(transitionCitedKnowledgeClaimReview(input)).toEqual({
        ok: false,
        code: "MALFORMED_INPUT",
      });
    }
    expect(executions).toBe(0);
  });

  it("permits proposed to rejected but rejects stale and terminal review rewrites", async () => {
    const linked = await evidenceFixture();
    const proposed = createCitedKnowledgeClaims(claimInput(linked));
    if (!proposed.ok) throw new Error(proposed.code);
    const review = (
      claim: unknown,
      expectedReviewState: "proposed" | "accepted" | "rejected",
      state: "accepted" | "rejected",
    ) => ({
      version: 1,
      scope: claimInput(linked).scope,
      claim,
      evidence: linked.evidence,
      citations: linked.citations,
      expectedReviewState,
      decision: {
        state,
        reviewerId: "40000000-0000-4000-8000-0000000000a1",
        reason: state === "accepted" ? "The exact support was reviewed." : "The uncertainty is too material.",
      },
    });

    const accepted = transitionCitedKnowledgeClaimReview(
      review(proposed.claims[0], "proposed", "accepted"),
    );
    const rejected = transitionCitedKnowledgeClaimReview(
      review(proposed.claims[0], "proposed", "rejected"),
    );
    expect(rejected).toMatchObject({
      ok: true,
      claim: {
        reviewState: "rejected",
        confidenceBasisPoints: 7600,
        uncertainty: "The source does not state the test temperature.",
      },
    });
    if (!accepted.ok || !rejected.ok) throw new Error("review fixture failed");

    for (const input of [
      review(proposed.claims[0], "accepted", "rejected"),
      review(accepted.claim, "accepted", "rejected"),
      review(rejected.claim, "rejected", "accepted"),
    ]) {
      expect(transitionCitedKnowledgeClaimReview(input)).toEqual({
        ok: false,
        code: "INVALID_TRANSITION",
      });
    }
  });
});
