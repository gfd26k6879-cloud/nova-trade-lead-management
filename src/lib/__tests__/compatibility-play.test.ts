import { describe, expect, it } from "vitest";
import { DEFAULT_NICHE_WEIGHTS, DEFAULT_WEBSITE_MULTIPLIERS } from "@/lib/scoring";
import {
  COMPATIBILITY_TENANT_TABLES,
  SQLITE_COMPATIBILITY_CHECKSUM_ALGORITHM,
  SQLITE_COMPATIBILITY_SOURCE_ENGINE,
  compatibilityManifestHash,
  type CompatibilityBackfillManifest,
  type CompatibilityBackfillReceipt,
} from "@/lib/tenancy/compatibility-backfill";
import {
  LEGACY_AI_QUEUE_STATUSES,
  LEGACY_AI_VERIFICATION_STATUSES,
  LEGACY_ARTIFACT_STATUSES,
  LEGACY_ENRICHMENT_STATUSES,
  LEGACY_LEAD_STATUSES,
  LEGACY_QUALIFICATION_STATUSES,
  LEGACY_WEBSITE_LEAD_PLAY_ID,
  LEGACY_WEBSITE_STATUSES,
  bindLegacyWebsiteLeadPlay,
  canonicalizeCompatibilityConfiguration,
  createLegacyWebsiteLeadPlaySeed,
  hashCompatibilityConfiguration,
  parseLegacyWebsiteLeadPlayJson,
} from "@/lib/tenancy/compatibility-play";

const TENANT_ID = "00000000-0000-4000-8000-000000000301";
const OTHER_TENANT_ID = "00000000-0000-4000-8000-000000000302";
const WORKSPACE_ID = "10000000-0000-4000-8000-000000000301";
const OTHER_WORKSPACE_ID = "10000000-0000-4000-8000-000000000302";
const OWNER_AUTH_ID = "20000000-0000-4000-8000-000000000301";
const MEMBERSHIP_ID = "30000000-0000-4000-8000-000000000301";
const ROLE_BINDING_ID = "40000000-0000-4000-8000-000000000301";
const POLICY_ID = "50000000-0000-4000-8000-000000000301";
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

function manifest(): CompatibilityBackfillManifest {
  return {
    schemaVersion: 1,
    sourceEngine: SQLITE_COMPATIBILITY_SOURCE_ENGINE,
    checksumAlgorithm: SQLITE_COMPATIBILITY_CHECKSUM_ALGORITHM,
    idempotencyKey: "g023-synthetic-compatibility-binding-v1",
    sourceSnapshotFingerprint: SHA_A,
    tenantId: TENANT_ID,
    tenantSlug: "synthetic-compatibility",
    tenantName: "Synthetic Compatibility Tenant",
    workspaceId: WORKSPACE_ID,
    workspaceSlug: "legacy-website-lead",
    workspaceName: "Legacy Website Lead",
    ownerLegacyUserId: "synthetic-owner",
    ownerAuthIdentityId: OWNER_AUTH_ID,
    policyId: POLICY_ID,
    policyVersion: 1,
    policyHash: SHA_B,
    legacyUsers: [{
      legacyUserId: "synthetic-owner",
      authIdentityId: OWNER_AUTH_ID,
      expectedEmail: "owner@example.test",
      expectedLegacyRole: "admin",
      expectedStatus: "active",
      membershipId: MEMBERSHIP_ID,
      workspaceId: WORKSPACE_ID,
      membershipRole: "owner",
      membershipStatus: "active",
      roleBindingId: ROLE_BINDING_ID,
      marketAccessIds: [],
    }],
    legacyTables: COMPATIBILITY_TENANT_TABLES.map((table) => ({ table, rowCount: 0, contentChecksum: SHA_A })),
  };
}

function receiptFor(value: CompatibilityBackfillManifest): CompatibilityBackfillReceipt {
  const tableCounts = Object.fromEntries(value.legacyTables.map((table) => [table.table, table.rowCount]));
  const checksums = Object.fromEntries(value.legacyTables.map((table) => [table.table, table.contentChecksum]));
  return {
    receiptId: `compatibility-backfill-${compatibilityManifestHash(value).slice(0, 24)}`,
    status: "completed",
    schemaVersion: 1,
    sourceEngine: value.sourceEngine,
    checksumAlgorithm: value.checksumAlgorithm,
    idempotencyKey: value.idempotencyKey,
    manifestHash: compatibilityManifestHash(value),
    sourceSnapshotFingerprint: value.sourceSnapshotFingerprint,
    tenantId: value.tenantId,
    workspaceId: value.workspaceId,
    ownerAuthIdentityId: value.ownerAuthIdentityId,
    policyId: value.policyId,
    policyVersion: value.policyVersion,
    policyHash: value.policyHash,
    userCount: value.legacyUsers.length,
    tableCounts,
    beforeContentChecksums: checksums,
    afterContentChecksums: checksums,
    relationshipOrphanCount: 0,
    rollback: "snapshot_restore_only",
    activation: "real activation requires approved compatibility identity and authorized rehearsal snapshot",
  };
}

function reverseObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).reverse().map(([key, child]) => [key, reverseObjectKeys(child)]));
  }
  return value;
}

function editableSeed(): Record<string, unknown> {
  return structuredClone(createLegacyWebsiteLeadPlaySeed()) as unknown as Record<string, unknown>;
}

describe("G-023 legacy website lead compatibility play", () => {
  it("creates a deterministic, deeply immutable seed from the current scoring defaults", () => {
    const first = createLegacyWebsiteLeadPlaySeed();
    const second = createLegacyWebsiteLeadPlaySeed();

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.configurationHash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.scoring.websiteMultipliers).toEqual(DEFAULT_WEBSITE_MULTIPLIERS);
    expect(first.scoring.nicheWeights).toEqual(DEFAULT_NICHE_WEIGHTS);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.scoring)).toBe(true);
    expect(Object.isFrozen(first.scoring.nicheWeights)).toBe(true);
    expect(Object.isFrozen(first.websiteClassification.socialHosts)).toBe(true);
    expect(() => {
      (first.scoring.nicheWeights as Record<string, number>).dentist = 99;
    }).toThrow();
    expect(second.scoring.nicheWeights.dentist).toBe(DEFAULT_NICHE_WEIGHTS.dentist);
  });

  it("canonicalizes key order and Unicode deterministically and parses reordered JSON", () => {
    const first = { "😀": 3, "é": 2, A: { z: 1, a: "résumé" } };
    const second = { A: { a: "résumé", z: 1 }, "é": 2, "😀": 3 };
    expect(canonicalizeCompatibilityConfiguration(first)).toBe(canonicalizeCompatibilityConfiguration(second));
    expect(hashCompatibilityConfiguration(first)).toBe(hashCompatibilityConfiguration(second));

    const seed = createLegacyWebsiteLeadPlaySeed();
    const parsed = parseLegacyWebsiteLeadPlayJson(JSON.stringify(reverseObjectKeys(seed)));
    expect(parsed).toMatchObject({ ok: true, reasonCode: "LEGACY_WEBSITE_PLAY_PARSED" });
    if (parsed.ok) expect(parsed.seed).toEqual(seed);
  });

  it("strictly rejects malformed JSON, unknown fields, hash tampering, and re-hashed semantic drift", () => {
    expect(parseLegacyWebsiteLeadPlayJson("{")).toEqual({ ok: false, reasonCode: "LEGACY_WEBSITE_PLAY_JSON_INVALID" });

    const unknown = editableSeed();
    (unknown.source as Record<string, unknown>).reviewBodies = true;
    expect(parseLegacyWebsiteLeadPlayJson(JSON.stringify(unknown))).toEqual({ ok: false, reasonCode: "LEGACY_WEBSITE_PLAY_UNKNOWN_FIELD" });

    const tampered = editableSeed();
    (tampered.geography as Record<string, unknown>).searchRadiusKm = 99;
    expect(parseLegacyWebsiteLeadPlayJson(JSON.stringify(tampered))).toEqual({ ok: false, reasonCode: "LEGACY_WEBSITE_PLAY_SCHEMA_INVALID" });

    const rehashed = editableSeed();
    const scoring = rehashed.scoring as Record<string, unknown>;
    (scoring.websiteMultipliers as Record<string, number>).none = 7;
    const configuration = Object.fromEntries(
      Object.entries(rehashed).filter(([key]) => key !== "hashAlgorithm" && key !== "configurationHash"),
    );
    rehashed.configurationHash = hashCompatibilityConfiguration(configuration);
    expect(parseLegacyWebsiteLeadPlayJson(JSON.stringify(rehashed))).toEqual({ ok: false, reasonCode: "LEGACY_WEBSITE_PLAY_SCHEMA_INVALID" });

    const badHash = editableSeed();
    badHash.configurationHash = "f".repeat(64);
    expect(parseLegacyWebsiteLeadPlayJson(JSON.stringify(badHash))).toEqual({ ok: false, reasonCode: "LEGACY_WEBSITE_PLAY_HASH_MISMATCH" });
  });

  it("captures exact current statuses, queue gates, and deterministic ordering", () => {
    const seed = createLegacyWebsiteLeadPlaySeed();
    expect(seed.websiteClassification.statuses).toEqual(LEGACY_WEBSITE_STATUSES);
    expect(seed.statusMappings.lead.map((mapping) => mapping.current)).toEqual(LEGACY_LEAD_STATUSES);
    expect(seed.statusMappings.lead.every((mapping) => mapping.provesExternalSend === false)).toBe(true);
    expect(seed.statusMappings.qualification).toEqual(LEGACY_QUALIFICATION_STATUSES);
    expect(seed.statusMappings.aiVerification).toEqual(LEGACY_AI_VERIFICATION_STATUSES);
    expect(seed.queues.aiVerification.statuses).toEqual(LEGACY_AI_QUEUE_STATUSES);
    expect(seed.queues.enrichment.statuses).toEqual(LEGACY_ENRICHMENT_STATUSES);
    expect(seed.queues.artifact.statuses).toEqual(LEGACY_ARTIFACT_STATUSES);
    expect(seed.queues.aiVerification.orderBy).toEqual([
      "sales_priority_score_desc",
      "raw_opportunity_score_desc",
      "score_desc",
      "updated_at_asc",
    ]);
    expect(seed.scoring.qualificationThresholds).toMatchObject({
      qualifiedMinimumScore: 8,
      needsVerificationMinimumScore: 4,
      minimumContactabilityBeforeScoreDecision: 0.55,
    });
  });

  it("keeps Google Places bounded, review text excluded, and outreach structurally no-send", () => {
    const seed = createLegacyWebsiteLeadPlaySeed();
    expect(seed.source.connectorId).toBe("google_places_legacy");
    expect(seed.source.operations).toEqual(["search_text", "place_details", "observation_log", "lead_projection"]);
    expect(seed.source.storedFields).not.toContain("reviews");
    expect(seed.source.storedFields).not.toContain("review_text");
    expect(seed.source.reviewTextPersistenceAllowed).toBe(false);
    expect(seed.source.reviewTextDisplayAllowed).toBe(false);
    expect(seed.source.multiTenantLiveActivationState).toBe("blocked");
    expect(seed.activation.permitsProviderCallsByItself).toBe(false);
    expect(seed.outreach).toMatchObject({
      mode: "artifact_only",
      humanReviewRequired: true,
      autonomousSend: false,
      copyOrExportProvesSend: false,
      externalSideEffectPermitted: false,
    });
    expect(seed.outreach.legacyClaimsRequiringEvidenceReview).toEqual([
      "visitor_abandonment_after_three_seconds_statistic",
      "mobile_local_search_share_statistic",
    ]);
    expect(seed.featureRequirements.find((entry) => entry.featureId === "autonomous_send")).toMatchObject({ use: "permanently_forbidden" });
    expect(seed.featureRequirements.every((entry) => entry.separateAuthorizationStillRequired)).toBe(true);
  });

  it("binds only to the exact manifest and completed receipt without hard-coded identity", () => {
    const selectedManifest = manifest();
    const result = bindLegacyWebsiteLeadPlay({
      tenantId: selectedManifest.tenantId,
      workspaceId: selectedManifest.workspaceId,
      manifest: selectedManifest,
      receipt: receiptFor(selectedManifest),
    });

    expect(result).toMatchObject({ ok: true, reasonCode: "LEGACY_WEBSITE_PLAY_BOUND" });
    if (!result.ok) throw new Error(result.reasonCode);
    expect(result.binding).toMatchObject({
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      playId: LEGACY_WEBSITE_LEAD_PLAY_ID,
      compatibilityOnly: true,
      defaultForNewTenants: false,
    });
    expect(result.binding.bindingId).toContain(TENANT_ID);
    expect(result.binding.bindingId).toContain(WORKSPACE_ID);
    expect(result.binding.manifestHash).toBe(compatibilityManifestHash(selectedManifest));
    expect(Object.isFrozen(result.binding)).toBe(true);
    expect(Object.isFrozen(result.binding.configuration.outreach)).toBe(true);
  });

  it("fails closed for tenant, workspace, engine, receipt, manifest-hash, and seed mismatches", () => {
    const selectedManifest = manifest();
    const selectedReceipt = receiptFor(selectedManifest);
    const base = { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, manifest: selectedManifest, receipt: selectedReceipt };

    expect(bindLegacyWebsiteLeadPlay({ ...base, tenantId: OTHER_TENANT_ID })).toEqual({ ok: false, reasonCode: "LEGACY_WEBSITE_PLAY_TENANT_SCOPE_MISMATCH" });
    expect(bindLegacyWebsiteLeadPlay({ ...base, workspaceId: OTHER_WORKSPACE_ID })).toEqual({ ok: false, reasonCode: "LEGACY_WEBSITE_PLAY_WORKSPACE_SCOPE_MISMATCH" });
    expect(bindLegacyWebsiteLeadPlay({
      ...base,
      manifest: { ...selectedManifest, checksumAlgorithm: "novatrade-postgres-jsonb-text-v1" },
    })).toEqual({ ok: false, reasonCode: "LEGACY_WEBSITE_PLAY_BACKFILL_ENGINE_MISMATCH" });
    expect(bindLegacyWebsiteLeadPlay({
      ...base,
      receipt: { ...selectedReceipt, policyHash: "c".repeat(64) },
    })).toEqual({ ok: false, reasonCode: "LEGACY_WEBSITE_PLAY_RECEIPT_MISMATCH" });
    expect(bindLegacyWebsiteLeadPlay({
      ...base,
      receipt: { ...selectedReceipt, manifestHash: "d".repeat(64) },
    })).toEqual({ ok: false, reasonCode: "LEGACY_WEBSITE_PLAY_MANIFEST_HASH_MISMATCH" });
    expect(bindLegacyWebsiteLeadPlay({
      ...base,
      seed: { ...editableSeed(), configurationHash: "e".repeat(64) },
    })).toEqual({ ok: false, reasonCode: "LEGACY_WEBSITE_PLAY_HASH_MISMATCH" });

    const missingCount = { ...selectedReceipt.tableCounts };
    delete missingCount.leads;
    expect(bindLegacyWebsiteLeadPlay({
      ...base,
      receipt: { ...selectedReceipt, tableCounts: missingCount },
    })).toEqual({ ok: false, reasonCode: "LEGACY_WEBSITE_PLAY_RECEIPT_MISMATCH" });
    expect(bindLegacyWebsiteLeadPlay({
      ...base,
      receipt: { ...selectedReceipt, userCount: 99 },
    })).toEqual({ ok: false, reasonCode: "LEGACY_WEBSITE_PLAY_RECEIPT_MISMATCH" });

    const duplicateTables = {
      ...selectedManifest,
      legacyTables: selectedManifest.legacyTables.map((entry, index) => index === 1
        ? { ...entry, table: selectedManifest.legacyTables[0].table }
        : entry),
    } as CompatibilityBackfillManifest;
    expect(bindLegacyWebsiteLeadPlay({ ...base, manifest: duplicateTables })).toEqual({
      ok: false,
      reasonCode: "LEGACY_WEBSITE_PLAY_BINDING_INPUT_INVALID",
    });

    const cyclic = structuredClone(selectedManifest) as CompatibilityBackfillManifest & { cycle?: unknown };
    cyclic.cycle = cyclic;
    expect(bindLegacyWebsiteLeadPlay({ ...base, manifest: cyclic })).toEqual({
      ok: false,
      reasonCode: "LEGACY_WEBSITE_PLAY_BINDING_INPUT_INVALID",
    });
  });
});
