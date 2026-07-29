import { createHash } from "node:crypto";
import { z } from "zod";
import { getDefaultBasicHosts, getDefaultSocialHosts } from "@/lib/classify-website";
import { DEFAULT_NICHE_WEIGHTS, DEFAULT_WEBSITE_MULTIPLIERS } from "@/lib/scoring";
import {
  COMPATIBILITY_BACKFILL_SCHEMA_VERSION,
  COMPATIBILITY_TENANT_TABLES,
  POSTGRES_COMPATIBILITY_CHECKSUM_ALGORITHM,
  POSTGRES_COMPATIBILITY_SOURCE_ENGINE,
  SQLITE_COMPATIBILITY_CHECKSUM_ALGORITHM,
  SQLITE_COMPATIBILITY_SOURCE_ENGINE,
  compatibilityManifestHash,
  type CompatibilityBackfillManifest,
  type CompatibilityBackfillReceipt,
} from "@/lib/tenancy/compatibility-backfill";
import { TENANT_FEATURE_IDS } from "@/lib/tenancy/features";

export const LEGACY_WEBSITE_LEAD_PLAY_SCHEMA_VERSION = 1 as const;
export const LEGACY_WEBSITE_LEAD_PLAY_ID = "compatibility.legacy-website-lead" as const;
export const LEGACY_WEBSITE_LEAD_PLAY_VERSION = 1 as const;
export const LEGACY_WEBSITE_LEAD_PLAY_HASH_ALGORITHM = "novatrade-canonical-json-sha256-v1" as const;

export const LEGACY_WEBSITE_STATUSES = ["none", "social", "basic", "custom"] as const;
export const LEGACY_LEAD_STATUSES = [
  "new",
  "verified",
  "contacted",
  "preview_sent",
  "meeting_set",
  "closed_won",
  "closed_lost",
] as const;
export const LEGACY_QUALIFICATION_STATUSES = [
  "qualified",
  "needs_verification",
  "unqualified",
  "disqualified",
] as const;
export const LEGACY_AI_VERIFICATION_STATUSES = [
  "not_checked",
  "site_found",
  "no_site_found",
  "weak_site_found",
  "uncertain",
  "mismatch",
  "error",
] as const;
export const LEGACY_AI_QUEUE_STATUSES = ["not_checked", "queued", "running", "verified", "error"] as const;
export const LEGACY_ENRICHMENT_STATUSES = ["pending", "running", "retry_wait", "enriched", "error", "skipped"] as const;
export const LEGACY_ARTIFACT_STATUSES = ["queued", "running", "complete", "error"] as const;

export const LEGACY_WEBSITE_PLAY_REASON_CODES = [
  "LEGACY_WEBSITE_PLAY_PARSED",
  "LEGACY_WEBSITE_PLAY_BOUND",
  "LEGACY_WEBSITE_PLAY_JSON_INVALID",
  "LEGACY_WEBSITE_PLAY_SCHEMA_INVALID",
  "LEGACY_WEBSITE_PLAY_UNKNOWN_FIELD",
  "LEGACY_WEBSITE_PLAY_HASH_MISMATCH",
  "LEGACY_WEBSITE_PLAY_BINDING_INPUT_INVALID",
  "LEGACY_WEBSITE_PLAY_TENANT_SCOPE_MISMATCH",
  "LEGACY_WEBSITE_PLAY_WORKSPACE_SCOPE_MISMATCH",
  "LEGACY_WEBSITE_PLAY_BACKFILL_SCHEMA_MISMATCH",
  "LEGACY_WEBSITE_PLAY_BACKFILL_ENGINE_MISMATCH",
  "LEGACY_WEBSITE_PLAY_MANIFEST_HASH_MISMATCH",
  "LEGACY_WEBSITE_PLAY_RECEIPT_MISMATCH",
] as const;
export type LegacyWebsitePlayReasonCode = (typeof LEGACY_WEBSITE_PLAY_REASON_CODES)[number];

const leadStatusSchema = z.enum(LEGACY_LEAD_STATUSES);
const qualificationStatusSchema = z.enum(LEGACY_QUALIFICATION_STATUSES);
const aiVerificationStatusSchema = z.enum(LEGACY_AI_VERIFICATION_STATUSES);
const aiQueueStatusSchema = z.enum(LEGACY_AI_QUEUE_STATUSES);
const enrichmentStatusSchema = z.enum(LEGACY_ENRICHMENT_STATUSES);
const artifactStatusSchema = z.enum(LEGACY_ARTIFACT_STATUSES);

const stringNumberRecordSchema = z.record(z.string().min(1), z.number().finite().nonnegative());
const statusMappingSchema = z.object({
  current: leadStatusSchema,
  compatibilityMeaning: z.enum([
    "legacy_new",
    "legacy_verified",
    "historical_manual_contact_observed",
    "historical_preview_handoff_observed",
    "historical_meeting_observed",
    "historical_closed_won_observed",
    "historical_closed_lost_observed",
  ]),
  provesExternalSend: z.literal(false),
}).strict();

const featureRequirementSchema = z.object({
  featureId: z.enum(TENANT_FEATURE_IDS),
  use: z.enum(["required_when_invoked", "not_used", "permanently_forbidden"]),
  separateAuthorizationStillRequired: z.boolean(),
}).strict();

const playPayloadSchema = z.object({
  schemaVersion: z.literal(LEGACY_WEBSITE_LEAD_PLAY_SCHEMA_VERSION),
  playId: z.literal(LEGACY_WEBSITE_LEAD_PLAY_ID),
  playVersion: z.literal(LEGACY_WEBSITE_LEAD_PLAY_VERSION),
  compatibilityOnly: z.literal(true),
  defaultForNewTenants: z.literal(false),
  activation: z.object({
    createsDurableState: z.literal(false),
    permitsProviderCallsByItself: z.literal(false),
    requiresValidatedCompatibilityBackfillReceipt: z.literal(true),
  }).strict(),
  websiteClassification: z.object({
    statuses: z.tuple(LEGACY_WEBSITE_STATUSES.map((status) => z.literal(status)) as [
      z.ZodLiteral<"none">,
      z.ZodLiteral<"social">,
      z.ZodLiteral<"basic">,
      z.ZodLiteral<"custom">,
    ]),
    socialHosts: z.array(z.string().min(1)).min(1),
    basicHosts: z.array(z.string().min(1)).min(1),
  }).strict(),
  source: z.object({
    connectorId: z.literal("google_places_legacy"),
    implementationState: z.literal("allowed-for-implementation"),
    multiTenantLiveActivationState: z.literal("blocked"),
    operations: z.tuple([
      z.literal("search_text"),
      z.literal("place_details"),
      z.literal("observation_log"),
      z.literal("lead_projection"),
    ]),
    storedFields: z.tuple([
      z.literal("place_id"),
      z.literal("business_name"),
      z.literal("formatted_address"),
      z.literal("website"),
      z.literal("phone"),
      z.literal("maps_uri"),
      z.literal("category"),
      z.literal("rating"),
      z.literal("review_count"),
      z.literal("operating_hours_metadata"),
      z.literal("business_status"),
    ]),
    personalDataClass: z.literal("business_entities_and_location_data_only"),
    reviewTextPersistenceAllowed: z.literal(false),
    reviewTextDisplayAllowed: z.literal(false),
    providerExecutionRequiresCurrentTermsTenantAuthorizationBudgetAndCredential: z.literal(true),
  }).strict(),
  geography: z.object({
    model: z.literal("legacy_local_market_cells"),
    searchRadiusKm: z.literal(8),
    discoveryMode: z.literal("coverage_probe"),
    paginationPolicy: z.literal("auto_yield_based"),
    newTenantDefault: z.literal(false),
  }).strict(),
  scoring: z.object({
    engine: z.literal("legacy-opportunity-score-v1"),
    websiteMultipliers: z.object({
      none: z.number().finite(),
      social: z.number().finite(),
      basic: z.number().finite(),
      custom: z.number().finite(),
    }).strict(),
    nicheWeights: stringNumberRecordSchema,
    factors: z.tuple([
      z.literal("review_count"),
      z.literal("rating"),
      z.literal("category_niche"),
      z.literal("website_status"),
      z.literal("photo_count"),
      z.literal("opening_hours"),
      z.literal("opportunity_band"),
      z.literal("website_health"),
      z.literal("competitive_density"),
      z.literal("contactability"),
      z.literal("estimated_deal_value"),
    ]),
    qualificationThresholds: z.object({
      qualifiedMinimumScore: z.literal(8),
      needsVerificationMinimumScore: z.literal(4),
      minimumContactabilityBeforeScoreDecision: z.literal(0.55),
      customWebsiteDisqualifies: z.literal(true),
      closedBusinessDisqualifies: z.literal(true),
    }).strict(),
  }).strict(),
  queues: z.object({
    aiVerification: z.object({
      statuses: z.array(aiQueueStatusSchema).length(LEGACY_AI_QUEUE_STATUSES.length),
      eligibleWhen: z.tuple([
        z.literal("ai_queue_status=queued"),
        z.literal("retry_due"),
        z.literal("attempt_count_below_limit"),
        z.literal("not_excluded"),
        z.literal("not_archived"),
        z.literal("not_closed"),
        z.literal("business_not_closed"),
      ]),
      orderBy: z.tuple([
        z.literal("sales_priority_score_desc"),
        z.literal("raw_opportunity_score_desc"),
        z.literal("score_desc"),
        z.literal("updated_at_asc"),
      ]),
    }).strict(),
    enrichment: z.object({
      statuses: z.array(enrichmentStatusSchema).length(LEGACY_ENRICHMENT_STATUSES.length),
      eligibleWhen: z.tuple([
        z.literal("enrichment_status=pending"),
        z.literal("score>0"),
        z.literal("not_excluded"),
        z.literal("not_archived"),
      ]),
    }).strict(),
    artifact: z.object({
      statuses: z.array(artifactStatusSchema).length(LEGACY_ARTIFACT_STATUSES.length),
      retryIndexOrder: z.tuple([
        z.literal("status"),
        z.literal("next_retry_at"),
        z.literal("created_at"),
      ]),
    }).strict(),
  }).strict(),
  statusMappings: z.object({
    lead: z.array(statusMappingSchema).length(LEGACY_LEAD_STATUSES.length),
    qualification: z.array(qualificationStatusSchema).length(LEGACY_QUALIFICATION_STATUSES.length),
    aiVerification: z.array(aiVerificationStatusSchema).length(LEGACY_AI_VERIFICATION_STATUSES.length),
  }).strict(),
  featureRequirements: z.array(featureRequirementSchema).length(TENANT_FEATURE_IDS.length),
  outreach: z.object({
    mode: z.literal("artifact_only"),
    allowedHandoffs: z.tuple([z.literal("copy"), z.literal("controlled_export")]),
    humanReviewRequired: z.literal(true),
    autonomousSend: z.literal(false),
    copyOrExportProvesSend: z.literal(false),
    externalSideEffectPermitted: z.literal(false),
    legacyClaimsRequiringEvidenceReview: z.tuple([
      z.literal("visitor_abandonment_after_three_seconds_statistic"),
      z.literal("mobile_local_search_share_statistic"),
    ]),
  }).strict(),
}).strict();

const playSeedSchema = playPayloadSchema.extend({
  hashAlgorithm: z.literal(LEGACY_WEBSITE_LEAD_PLAY_HASH_ALGORITHM),
  configurationHash: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

export type LegacyWebsiteLeadPlayPayload = z.infer<typeof playPayloadSchema>;
export type LegacyWebsiteLeadPlaySeed = z.infer<typeof playSeedSchema>;

export type LegacyWebsitePlayParseResult =
  | { readonly ok: true; readonly reasonCode: "LEGACY_WEBSITE_PLAY_PARSED"; readonly seed: LegacyWebsiteLeadPlaySeed }
  | { readonly ok: false; readonly reasonCode: Exclude<LegacyWebsitePlayReasonCode, "LEGACY_WEBSITE_PLAY_PARSED" | "LEGACY_WEBSITE_PLAY_BOUND"> };

export interface LegacyWebsiteLeadPlayBindingInput {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly manifest: CompatibilityBackfillManifest;
  readonly receipt: CompatibilityBackfillReceipt;
  readonly seed?: unknown;
}

export interface LegacyWebsiteLeadPlayBinding {
  readonly bindingId: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly manifestHash: string;
  readonly playId: typeof LEGACY_WEBSITE_LEAD_PLAY_ID;
  readonly playVersion: typeof LEGACY_WEBSITE_LEAD_PLAY_VERSION;
  readonly configurationHash: string;
  readonly configuration: LegacyWebsiteLeadPlaySeed;
  readonly compatibilityOnly: true;
  readonly defaultForNewTenants: false;
}

export type LegacyWebsitePlayBindingResult =
  | { readonly ok: true; readonly reasonCode: "LEGACY_WEBSITE_PLAY_BOUND"; readonly binding: LegacyWebsiteLeadPlayBinding }
  | { readonly ok: false; readonly reasonCode: Exclude<LegacyWebsitePlayReasonCode, "LEGACY_WEBSITE_PLAY_PARSED" | "LEGACY_WEBSITE_PLAY_BOUND" | "LEGACY_WEBSITE_PLAY_JSON_INVALID" | "LEGACY_WEBSITE_PLAY_UNKNOWN_FIELD"> };

function compareCodeUnits(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

export function canonicalizeCompatibilityConfiguration(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Compatibility configuration contains a non-finite number.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalizeCompatibilityConfiguration).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.some(([, entry]) => entry === undefined)) {
      throw new TypeError("Compatibility configuration contains undefined.");
    }
    entries.sort(([left], [right]) => compareCodeUnits(left, right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalizeCompatibilityConfiguration(entry)}`).join(",")}}`;
  }
  throw new TypeError("Compatibility configuration contains an unsupported value.");
}

export function hashCompatibilityConfiguration(value: unknown): string {
  return createHash("sha256").update(canonicalizeCompatibilityConfiguration(value), "utf8").digest("hex");
}

function payload(): LegacyWebsiteLeadPlayPayload {
  return {
    schemaVersion: LEGACY_WEBSITE_LEAD_PLAY_SCHEMA_VERSION,
    playId: LEGACY_WEBSITE_LEAD_PLAY_ID,
    playVersion: LEGACY_WEBSITE_LEAD_PLAY_VERSION,
    compatibilityOnly: true,
    defaultForNewTenants: false,
    activation: {
      createsDurableState: false,
      permitsProviderCallsByItself: false,
      requiresValidatedCompatibilityBackfillReceipt: true,
    },
    websiteClassification: {
      statuses: [...LEGACY_WEBSITE_STATUSES],
      socialHosts: getDefaultSocialHosts(),
      basicHosts: getDefaultBasicHosts(),
    },
    source: {
      connectorId: "google_places_legacy",
      implementationState: "allowed-for-implementation",
      multiTenantLiveActivationState: "blocked",
      operations: ["search_text", "place_details", "observation_log", "lead_projection"],
      storedFields: [
        "place_id",
        "business_name",
        "formatted_address",
        "website",
        "phone",
        "maps_uri",
        "category",
        "rating",
        "review_count",
        "operating_hours_metadata",
        "business_status",
      ],
      personalDataClass: "business_entities_and_location_data_only",
      reviewTextPersistenceAllowed: false,
      reviewTextDisplayAllowed: false,
      providerExecutionRequiresCurrentTermsTenantAuthorizationBudgetAndCredential: true,
    },
    geography: {
      model: "legacy_local_market_cells",
      searchRadiusKm: 8,
      discoveryMode: "coverage_probe",
      paginationPolicy: "auto_yield_based",
      newTenantDefault: false,
    },
    scoring: {
      engine: "legacy-opportunity-score-v1",
      websiteMultipliers: { ...DEFAULT_WEBSITE_MULTIPLIERS },
      nicheWeights: { ...DEFAULT_NICHE_WEIGHTS },
      factors: [
        "review_count",
        "rating",
        "category_niche",
        "website_status",
        "photo_count",
        "opening_hours",
        "opportunity_band",
        "website_health",
        "competitive_density",
        "contactability",
        "estimated_deal_value",
      ],
      qualificationThresholds: {
        qualifiedMinimumScore: 8,
        needsVerificationMinimumScore: 4,
        minimumContactabilityBeforeScoreDecision: 0.55,
        customWebsiteDisqualifies: true,
        closedBusinessDisqualifies: true,
      },
    },
    queues: {
      aiVerification: {
        statuses: [...LEGACY_AI_QUEUE_STATUSES],
        eligibleWhen: [
          "ai_queue_status=queued",
          "retry_due",
          "attempt_count_below_limit",
          "not_excluded",
          "not_archived",
          "not_closed",
          "business_not_closed",
        ],
        orderBy: [
          "sales_priority_score_desc",
          "raw_opportunity_score_desc",
          "score_desc",
          "updated_at_asc",
        ],
      },
      enrichment: {
        statuses: [...LEGACY_ENRICHMENT_STATUSES],
        eligibleWhen: ["enrichment_status=pending", "score>0", "not_excluded", "not_archived"],
      },
      artifact: {
        statuses: [...LEGACY_ARTIFACT_STATUSES],
        retryIndexOrder: ["status", "next_retry_at", "created_at"],
      },
    },
    statusMappings: {
      lead: [
        { current: "new", compatibilityMeaning: "legacy_new", provesExternalSend: false },
        { current: "verified", compatibilityMeaning: "legacy_verified", provesExternalSend: false },
        { current: "contacted", compatibilityMeaning: "historical_manual_contact_observed", provesExternalSend: false },
        { current: "preview_sent", compatibilityMeaning: "historical_preview_handoff_observed", provesExternalSend: false },
        { current: "meeting_set", compatibilityMeaning: "historical_meeting_observed", provesExternalSend: false },
        { current: "closed_won", compatibilityMeaning: "historical_closed_won_observed", provesExternalSend: false },
        { current: "closed_lost", compatibilityMeaning: "historical_closed_lost_observed", provesExternalSend: false },
      ],
      qualification: [...LEGACY_QUALIFICATION_STATUSES],
      aiVerification: [...LEGACY_AI_VERIFICATION_STATUSES],
    },
    featureRequirements: [
      { featureId: "ai_processing", use: "required_when_invoked", separateAuthorizationStillRequired: true },
      { featureId: "source_research", use: "required_when_invoked", separateAuthorizationStillRequired: true },
      { featureId: "contact_research", use: "not_used", separateAuthorizationStillRequired: true },
      { featureId: "outreach_drafting", use: "required_when_invoked", separateAuthorizationStillRequired: true },
      { featureId: "copy_export", use: "required_when_invoked", separateAuthorizationStillRequired: true },
      { featureId: "autonomous_send", use: "permanently_forbidden", separateAuthorizationStillRequired: true },
    ],
    outreach: {
      mode: "artifact_only",
      allowedHandoffs: ["copy", "controlled_export"],
      humanReviewRequired: true,
      autonomousSend: false,
      copyOrExportProvesSend: false,
      externalSideEffectPermitted: false,
      legacyClaimsRequiringEvidenceReview: [
        "visitor_abandonment_after_three_seconds_statistic",
        "mobile_local_search_share_statistic",
      ],
    },
  };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function detachedFrozen<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

export function createLegacyWebsiteLeadPlaySeed(): LegacyWebsiteLeadPlaySeed {
  const configuration = playPayloadSchema.parse(payload());
  return detachedFrozen({
    ...configuration,
    hashAlgorithm: LEGACY_WEBSITE_LEAD_PLAY_HASH_ALGORITHM,
    configurationHash: hashCompatibilityConfiguration(configuration),
  });
}

function validateSeed(value: unknown): LegacyWebsitePlayParseResult {
  const parsed = playSeedSchema.safeParse(value);
  if (!parsed.success) {
    const unknownField = parsed.error.issues.some((issue) => issue.code === "unrecognized_keys");
    return { ok: false, reasonCode: unknownField ? "LEGACY_WEBSITE_PLAY_UNKNOWN_FIELD" : "LEGACY_WEBSITE_PLAY_SCHEMA_INVALID" };
  }
  const configurationHash = parsed.data.configurationHash;
  const configuration = Object.fromEntries(
    Object.entries(parsed.data).filter(([key]) => key !== "hashAlgorithm" && key !== "configurationHash"),
  ) as LegacyWebsiteLeadPlayPayload;
  if (hashCompatibilityConfiguration(configuration) !== configurationHash) {
    return { ok: false, reasonCode: "LEGACY_WEBSITE_PLAY_HASH_MISMATCH" };
  }
  if (canonicalizeCompatibilityConfiguration(configuration) !== canonicalizeCompatibilityConfiguration(playPayloadSchema.parse(payload()))) {
    return { ok: false, reasonCode: "LEGACY_WEBSITE_PLAY_SCHEMA_INVALID" };
  }
  return { ok: true, reasonCode: "LEGACY_WEBSITE_PLAY_PARSED", seed: detachedFrozen(parsed.data) };
}

export function parseLegacyWebsiteLeadPlayJson(serialized: string): LegacyWebsitePlayParseResult {
  if (typeof serialized !== "string") return { ok: false, reasonCode: "LEGACY_WEBSITE_PLAY_JSON_INVALID" };
  try {
    return validateSeed(JSON.parse(serialized) as unknown);
  } catch {
    return { ok: false, reasonCode: "LEGACY_WEBSITE_PLAY_JSON_INVALID" };
  }
}

function enginePairIsValid(manifest: CompatibilityBackfillManifest): boolean {
  return (
    manifest.sourceEngine === SQLITE_COMPATIBILITY_SOURCE_ENGINE &&
    manifest.checksumAlgorithm === SQLITE_COMPATIBILITY_CHECKSUM_ALGORITHM
  ) || (
    manifest.sourceEngine === POSTGRES_COMPATIBILITY_SOURCE_ENGINE &&
    manifest.checksumAlgorithm === POSTGRES_COMPATIBILITY_CHECKSUM_ALGORITHM
  );
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const ID_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function manifestLooksValidated(manifest: CompatibilityBackfillManifest): boolean {
  if (!enginePairIsValid(manifest) ||
    !ID_KEY_PATTERN.test(manifest.idempotencyKey) ||
    !SHA256_PATTERN.test(manifest.sourceSnapshotFingerprint) ||
    !UUID_PATTERN.test(manifest.tenantId) ||
    !UUID_PATTERN.test(manifest.workspaceId) ||
    !UUID_PATTERN.test(manifest.ownerAuthIdentityId) ||
    !UUID_PATTERN.test(manifest.policyId) ||
    !Number.isSafeInteger(manifest.policyVersion) ||
    manifest.policyVersion < 1 ||
    !SHA256_PATTERN.test(manifest.policyHash) ||
    !Array.isArray(manifest.legacyUsers) ||
    manifest.legacyUsers.length < 1 ||
    !Array.isArray(manifest.legacyTables) ||
    manifest.legacyTables.length !== COMPATIBILITY_TENANT_TABLES.length) {
    return false;
  }
  const tables = new Set<string>();
  for (const expectation of manifest.legacyTables) {
    if (!COMPATIBILITY_TENANT_TABLES.includes(expectation.table) ||
      tables.has(expectation.table) ||
      !Number.isSafeInteger(expectation.rowCount) ||
      expectation.rowCount < 0 ||
      !SHA256_PATTERN.test(expectation.contentChecksum)) {
      return false;
    }
    tables.add(expectation.table);
  }
  const owners = manifest.legacyUsers.filter((user) => user.membershipRole === "owner");
  return tables.size === COMPATIBILITY_TENANT_TABLES.length &&
    owners.length === 1 &&
    owners[0].legacyUserId === manifest.ownerLegacyUserId &&
    owners[0].authIdentityId === manifest.ownerAuthIdentityId;
}

function exactRecordKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort(compareCodeUnits);
  const wanted = [...expected].sort(compareCodeUnits);
  return keys.length === wanted.length && keys.every((key, index) => key === wanted[index]);
}

function receiptMatchesManifest(manifest: CompatibilityBackfillManifest, receipt: CompatibilityBackfillReceipt): boolean {
  if (receipt.status === "completed" &&
    receipt.schemaVersion === manifest.schemaVersion &&
    receipt.sourceEngine === manifest.sourceEngine &&
    receipt.checksumAlgorithm === manifest.checksumAlgorithm &&
    receipt.idempotencyKey === manifest.idempotencyKey &&
    receipt.sourceSnapshotFingerprint === manifest.sourceSnapshotFingerprint &&
    receipt.tenantId === manifest.tenantId &&
    receipt.workspaceId === manifest.workspaceId &&
    receipt.ownerAuthIdentityId === manifest.ownerAuthIdentityId &&
    receipt.policyId === manifest.policyId &&
    receipt.policyVersion === manifest.policyVersion &&
    receipt.policyHash === manifest.policyHash &&
    receipt.relationshipOrphanCount === 0 &&
    receipt.userCount === manifest.legacyUsers.length &&
    receipt.rollback === "snapshot_restore_only" &&
    receipt.activation === "real activation requires approved compatibility identity and authorized rehearsal snapshot") {
    // Continue below. The negated form would obscure which exact receipt
    // invariants are being checked against the manifest.
  } else {
    return false;
  }
  const tableNames = [...COMPATIBILITY_TENANT_TABLES];
  if (!exactRecordKeys(receipt.tableCounts, tableNames) ||
    !exactRecordKeys(receipt.beforeContentChecksums, tableNames) ||
    !exactRecordKeys(receipt.afterContentChecksums, tableNames)) {
    return false;
  }
  return manifest.legacyTables.every((expectation) =>
    receipt.tableCounts[expectation.table] === expectation.rowCount &&
    receipt.beforeContentChecksums[expectation.table] === expectation.contentChecksum &&
    receipt.afterContentChecksums[expectation.table] === expectation.contentChecksum,
  );
}

function validBindingInput(input: unknown): input is LegacyWebsiteLeadPlayBindingInput {
  return typeof input === "object" && input !== null &&
    typeof (input as LegacyWebsiteLeadPlayBindingInput).tenantId === "string" &&
    typeof (input as LegacyWebsiteLeadPlayBindingInput).workspaceId === "string" &&
    typeof (input as LegacyWebsiteLeadPlayBindingInput).manifest === "object" &&
    (input as LegacyWebsiteLeadPlayBindingInput).manifest !== null &&
    typeof (input as LegacyWebsiteLeadPlayBindingInput).receipt === "object" &&
    (input as LegacyWebsiteLeadPlayBindingInput).receipt !== null;
}

export function bindLegacyWebsiteLeadPlay(input: LegacyWebsiteLeadPlayBindingInput): LegacyWebsitePlayBindingResult {
  try {
    if (!validBindingInput(input)) return { ok: false, reasonCode: "LEGACY_WEBSITE_PLAY_BINDING_INPUT_INVALID" };
    const { manifest, receipt } = input;
    if (manifest.schemaVersion !== COMPATIBILITY_BACKFILL_SCHEMA_VERSION) {
      return { ok: false, reasonCode: "LEGACY_WEBSITE_PLAY_BACKFILL_SCHEMA_MISMATCH" };
    }
    if (!enginePairIsValid(manifest)) {
      return { ok: false, reasonCode: "LEGACY_WEBSITE_PLAY_BACKFILL_ENGINE_MISMATCH" };
    }
    if (!manifestLooksValidated(manifest)) {
      return { ok: false, reasonCode: "LEGACY_WEBSITE_PLAY_BINDING_INPUT_INVALID" };
    }
    if (input.tenantId !== manifest.tenantId) {
      return { ok: false, reasonCode: "LEGACY_WEBSITE_PLAY_TENANT_SCOPE_MISMATCH" };
    }
    if (input.workspaceId !== manifest.workspaceId) {
      return { ok: false, reasonCode: "LEGACY_WEBSITE_PLAY_WORKSPACE_SCOPE_MISMATCH" };
    }
    if (!receiptMatchesManifest(manifest, receipt)) {
      return { ok: false, reasonCode: "LEGACY_WEBSITE_PLAY_RECEIPT_MISMATCH" };
    }
    const manifestHash = compatibilityManifestHash(manifest);
    if (receipt.manifestHash !== manifestHash) {
      return { ok: false, reasonCode: "LEGACY_WEBSITE_PLAY_MANIFEST_HASH_MISMATCH" };
    }
    const seedResult = validateSeed(input.seed ?? createLegacyWebsiteLeadPlaySeed());
    if (!seedResult.ok) {
      return {
        ok: false,
        reasonCode: seedResult.reasonCode === "LEGACY_WEBSITE_PLAY_HASH_MISMATCH"
          ? "LEGACY_WEBSITE_PLAY_HASH_MISMATCH"
          : "LEGACY_WEBSITE_PLAY_SCHEMA_INVALID",
      };
    }
    const seed = seedResult.seed;
    const binding: LegacyWebsiteLeadPlayBinding = {
      bindingId: `${LEGACY_WEBSITE_LEAD_PLAY_ID}:${input.tenantId}:${input.workspaceId}:${seed.configurationHash}`,
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      manifestHash,
      playId: LEGACY_WEBSITE_LEAD_PLAY_ID,
      playVersion: LEGACY_WEBSITE_LEAD_PLAY_VERSION,
      configurationHash: seed.configurationHash,
      configuration: seed,
      compatibilityOnly: true,
      defaultForNewTenants: false,
    };
    return { ok: true, reasonCode: "LEGACY_WEBSITE_PLAY_BOUND", binding: detachedFrozen(binding) };
  } catch {
    return { ok: false, reasonCode: "LEGACY_WEBSITE_PLAY_BINDING_INPUT_INVALID" };
  }
}
