import {
  closeSync,
  existsSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

import Database from "better-sqlite3";

import { SCHEMA_SQL } from "@/lib/db/schema";
import {
  computeSqliteG006bArchiveTreeHash,
  inspectSqliteG006bPreFinalizationEvidence,
  runSqliteG006bPreFinalization,
  type SqliteG006bExecuteInput,
  type SqliteG006bReplayInput,
} from "@/lib/db/sqlite-g006b-pre-finalization";
import { SQLITE_SCHEMA_V1_PHYSICAL_MANIFEST_DIGEST } from "@/lib/db/sqlite-schema-coordinator";
import {
  provisionFreshSqliteCompatibilityScope,
  verifyCompatibilityScope,
  type SqliteCompatibilityBinding,
} from "@/lib/db/sqlite-compatibility-scope";
import {
  SQLITE_SCHEMA_V1_APPLICATION_TABLE_COUNT,
  SQLITE_SCHEMA_V1_CATALOG_DIGEST,
  SQLITE_SCHEMA_V1_CATALOG_VERSION,
  SQLITE_SCHEMA_V1_INTERNAL_CATALOG_DIGEST,
  SQLITE_SCHEMA_V1_STAGED_USER_VERSION,
} from "@/lib/db/sqlite-schema-v1";
import {
  computeSqliteFreshCanonicalBindingHash,
  computeSqliteFreshFoundationHash,
  computeSqliteFreshPlayBindingId,
  computeSqliteFreshPolicyHash,
  computeSqliteFreshSourceHash,
  inspectSqliteFreshFileIdentity,
  SQLITE_FRESH_COMPATIBILITY_SOURCE_CARD_ID,
  type SqliteFreshCompatibilityProvisionInput,
  type SqliteFreshFoundationInput,
  type SqliteFreshTenantPolicyRow,
} from "@/lib/db/sqlite-fresh-compatibility-scope";
import {
  COMPATIBILITY_TENANT_TABLES,
  SQLITE_COMPATIBILITY_CHECKSUM_ALGORITHM,
  SQLITE_COMPATIBILITY_SOURCE_ENGINE,
  compatibilityContentChecksum,
  prepareSqliteCompatibilityBackfill,
  runSqliteCompatibilityBackfill,
  type CompatibilityBackfillManifest,
  type CompatibilityUserMapping,
  type SqliteBackfillDb,
} from "@/lib/tenancy/compatibility-backfill";
import {
  LEGACY_WEBSITE_LEAD_PLAY_ID,
  LEGACY_WEBSITE_LEAD_PLAY_VERSION,
  createLegacyWebsiteLeadPlaySeed,
} from "@/lib/tenancy/compatibility-play";
import { LEGACY_DATA_EXPORT_SCHEMA_VERSION } from "../../../scripts/data-transfer-contract.mjs";
import { exportSqliteData } from "../../../scripts/export-sqlite-data.mjs";

const UPGRADED_TENANT_ID = "00000000-0000-4000-8000-0000000002a1";
const UPGRADED_WORKSPACE_ID = "10000000-0000-4000-8000-0000000002a1";
const UPGRADED_OWNER_AUTH_ID = "20000000-0000-4000-8000-0000000002a1";
const UPGRADED_RESEARCHER_AUTH_ID = "20000000-0000-4000-8000-0000000002a2";
const UPGRADED_DISABLED_AUTH_ID = "20000000-0000-4000-8000-0000000002a3";
const UPGRADED_POLICY_ID = "50000000-0000-4000-8000-0000000002a1";

const FRESH_TENANT_ID = "00000000-0000-4000-8000-0000000002b1";
const FRESH_WORKSPACE_ID = "10000000-0000-4000-8000-0000000002b1";
const FRESH_OWNER_AUTH_ID = "20000000-0000-4000-8000-0000000002b1";
const FRESH_MEMBERSHIP_ID = "30000000-0000-4000-8000-0000000002b1";
const FRESH_ROLE_BINDING_ID = "40000000-0000-4000-8000-0000000002b1";
const FRESH_POLICY_ID = "50000000-0000-4000-8000-0000000002b1";
const NOW = "2026-07-30T12:00:00.000Z";

export interface SqliteG002OperationFixture {
  readonly lifecycle: "fresh" | "upgraded";
  readonly root: string;
  readonly databasePath: string;
  readonly tenantId: string;
  readonly storageWorkspaceId: string;
  readonly binding: SqliteCompatibilityBinding;
}

interface FixtureState {
  readonly root: string;
  readonly databasePath: string;
}

const fixtureStates = new WeakMap<object, FixtureState>();
const OWNED_ROOT_PREFIXES = Object.freeze(["g006c2a-upgraded-", "g006c2a-fresh-"]);

function cleanupOwnedRoot(rootValue: string, databasePathValue: string): void {
  const resolvedTemp = realpathSync.native(tmpdir());
  const resolvedRoot = realpathSync.native(rootValue);
  const rootName = basename(resolvedRoot);
  if (dirname(resolvedRoot) !== resolvedTemp
      || !OWNED_ROOT_PREFIXES.some((prefix) => rootName.startsWith(prefix))) {
    throw new Error("G006C2A cleanup rejected an unowned root");
  }
  const resolvedDatabasePath = resolve(databasePathValue);
  const databaseRelativePath = relative(resolvedRoot, resolvedDatabasePath);
  if (databaseRelativePath.length === 0
      || databaseRelativePath.startsWith("..")
      || isAbsolute(databaseRelativePath)) {
    throw new Error("G006C2A cleanup rejected a database outside its owned root");
  }

  rmSync(resolvedRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  const residue = [
    resolvedRoot,
    resolvedDatabasePath,
    `${resolvedDatabasePath}-wal`,
    `${resolvedDatabasePath}-shm`,
    `${resolvedDatabasePath}-journal`,
  ].filter((path) => existsSync(path));
  if (residue.length > 0) throw new Error(`G006C2A cleanup residue: ${residue.join(", ")}`);
}

function registerFixture(fixture: SqliteG002OperationFixture): SqliteG002OperationFixture {
  const frozen = Object.freeze(fixture);
  fixtureStates.set(frozen, Object.freeze({ root: fixture.root, databasePath: fixture.databasePath }));
  return frozen;
}

export function cleanupSqliteG002OperationFixture(fixture: SqliteG002OperationFixture): void {
  const state = fixtureStates.get(fixture);
  if (!state) throw new Error("G006C2A cleanup requires a genuine fixture");
  fixtureStates.delete(fixture);
  cleanupOwnedRoot(state.root, state.databasePath);
}

function adapter(db: Database.Database): SqliteBackfillDb {
  const value: SqliteBackfillDb = {
    all: <T extends Record<string, unknown>>(sql: string, params: readonly unknown[] = []) => (
      db.prepare(sql).all(...params) as T[]
    ),
    get: <T extends Record<string, unknown>>(sql: string, params: readonly unknown[] = []) => (
      db.prepare(sql).get(...params) as T | undefined
    ),
    run: (sql: string, params: readonly unknown[] = []) => db.prepare(sql).run(...params),
    transaction: <T>(work: (tx: SqliteBackfillDb) => T, mode?: "deferred" | "immediate") => {
      if (mode === "immediate") {
        db.exec("BEGIN IMMEDIATE");
        try {
          const result = work(value);
          db.exec("COMMIT");
          return result;
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      }
      return db.transaction(() => work(value))();
    },
  };
  return value;
}

function seedLegacyRows(db: Database.Database): void {
  db.prepare("INSERT INTO location_markets (id, name, country_code, admin_area1) VALUES ('market-a', 'Market A', 'US', 'CO')").run();
  db.prepare("INSERT INTO app_users (id, user_id, email, role, status) VALUES ('legacy-owner', ?, 'owner@example.test', 'admin', 'active')").run(UPGRADED_OWNER_AUTH_ID);
  db.prepare("INSERT INTO app_users (id, user_id, email, role, status) VALUES ('legacy-researcher', ?, 'researcher@example.test', 'researcher', 'active')").run(UPGRADED_RESEARCHER_AUTH_ID);
  db.prepare("INSERT INTO app_users (id, user_id, email, role, status) VALUES ('legacy-disabled', ?, 'disabled@example.test', 'researcher', 'disabled')").run(UPGRADED_DISABLED_AUTH_ID);
  db.prepare("UPDATE app_users SET created_by=?, team_lead_user_id=? WHERE id='legacy-researcher'").run(UPGRADED_OWNER_AUTH_ID, UPGRADED_OWNER_AUTH_ID);
  db.prepare("INSERT INTO user_market_access (user_id, market_id, created_by_user_id) VALUES (?, 'market-a', ?)").run(UPGRADED_OWNER_AUTH_ID, UPGRADED_OWNER_AUTH_ID);
  db.prepare("INSERT INTO crawl_runs (id, categories, status, created_by_user_id) VALUES ('run-1', '[]', 'done', ?)").run(UPGRADED_OWNER_AUTH_ID);
  db.prepare("INSERT INTO crawl_units (id, crawl_run_id, zip, category) VALUES ('unit-1', 'run-1', '80202', 'industrial')").run();
  db.prepare("INSERT INTO leads (id, place_id, name, assigned_to_user_id) VALUES ('lead-1', 'place-1', 'Synthetic Materials Co', ?)").run(UPGRADED_OWNER_AUTH_ID);
  db.prepare("INSERT INTO lead_notes (id, lead_id, author_user_id, body) VALUES ('note-1', 'lead-1', ?, 'synthetic note')").run(UPGRADED_OWNER_AUTH_ID);
  db.prepare("INSERT INTO outreach_events (id, lead_id, channel, actor_user_id) VALUES ('outreach-1', 'lead-1', 'call', ?)").run(UPGRADED_OWNER_AUTH_ID);
  db.prepare("INSERT INTO admin_requests (id, lead_id, request_type, created_by_user_id, assigned_admin_user_id) VALUES ('request-1', 'lead-1', 'quote_request', ?, ?)").run(UPGRADED_OWNER_AUTH_ID, UPGRADED_OWNER_AUTH_ID);
  db.prepare("INSERT INTO demos (id, lead_id, slug, published_by_user_id) VALUES ('demo-1', 'lead-1', 'synthetic-demo', ?)").run(UPGRADED_OWNER_AUTH_ID);
  db.prepare("INSERT INTO place_cache (place_id, raw_json) VALUES ('place-1', '{}')").run();
  db.prepare("INSERT INTO places_master (place_id, name) VALUES ('place-1', 'Synthetic Materials Co')").run();
  db.prepare("INSERT INTO place_observations (id, place_id, endpoint, sku, raw_json) VALUES ('observation-1', 'place-1', 'details', 'places-details', '{}')").run();
  db.prepare("INSERT INTO api_usage_events (id, endpoint, sku) VALUES ('api-1', 'details', 'places-details')").run();
  db.prepare("INSERT INTO audit_logs (id, action) VALUES ('audit-1', 'g006c2a.fixture')").run();
}

function upgradedUsers(): readonly CompatibilityUserMapping[] {
  return [
    {
      legacyUserId: "legacy-owner",
      authIdentityId: UPGRADED_OWNER_AUTH_ID,
      expectedEmail: "owner@example.test",
      expectedLegacyRole: "admin",
      expectedStatus: "active",
      membershipId: "30000000-0000-4000-8000-0000000002a1",
      workspaceId: UPGRADED_WORKSPACE_ID,
      membershipRole: "owner",
      membershipStatus: "active",
      roleBindingId: "40000000-0000-4000-8000-0000000002a1",
      marketAccessIds: ["market-a"],
    },
    {
      legacyUserId: "legacy-researcher",
      authIdentityId: UPGRADED_RESEARCHER_AUTH_ID,
      expectedEmail: "researcher@example.test",
      expectedLegacyRole: "researcher",
      expectedStatus: "active",
      membershipId: "30000000-0000-4000-8000-0000000002a2",
      workspaceId: UPGRADED_WORKSPACE_ID,
      membershipRole: "researcher",
      membershipStatus: "active",
      roleBindingId: "40000000-0000-4000-8000-0000000002a2",
      marketAccessIds: [],
    },
    {
      legacyUserId: "legacy-disabled",
      authIdentityId: UPGRADED_DISABLED_AUTH_ID,
      expectedEmail: "disabled@example.test",
      expectedLegacyRole: "researcher",
      expectedStatus: "disabled",
      membershipId: "30000000-0000-4000-8000-0000000002a3",
      workspaceId: UPGRADED_WORKSPACE_ID,
      membershipRole: "researcher",
      membershipStatus: "suspended",
      roleBindingId: "40000000-0000-4000-8000-0000000002a3",
      marketAccessIds: [],
    },
  ];
}

function upgradedManifest(db: Database.Database): CompatibilityBackfillManifest {
  return {
    schemaVersion: 1,
    sourceEngine: SQLITE_COMPATIBILITY_SOURCE_ENGINE,
    checksumAlgorithm: SQLITE_COMPATIBILITY_CHECKSUM_ALGORITHM,
    idempotencyKey: "g006c2a-upgraded-v1",
    sourceSnapshotFingerprint: "a".repeat(64),
    tenantId: UPGRADED_TENANT_ID,
    tenantSlug: "g006c2a-upgraded",
    tenantName: "G006C2A Upgraded Fixture",
    workspaceId: UPGRADED_WORKSPACE_ID,
    workspaceSlug: "legacy-website-lead",
    workspaceName: "Legacy Website Lead",
    ownerLegacyUserId: "legacy-owner",
    ownerAuthIdentityId: UPGRADED_OWNER_AUTH_ID,
    policyId: UPGRADED_POLICY_ID,
    policyVersion: 1,
    policyHash: "b".repeat(64),
    legacyUsers: upgradedUsers(),
    legacyTables: COMPATIBILITY_TENANT_TABLES.map((table) => {
      const rows = db.prepare(`SELECT * FROM "${table}"`).all() as Array<Record<string, unknown>>;
      return { table, rowCount: rows.length, contentChecksum: compatibilityContentChecksum(rows) };
    }),
  };
}

function previewArchiveTree(root: string, databasePath: string, backupPath: string): string {
  const preview = join(root, "archive-preview");
  exportSqliteData({ dbPath: databasePath, outDir: preview, schemaVersion: LEGACY_DATA_EXPORT_SCHEMA_VERSION });
  const manifestPath = join(preview, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    exportedAt: string;
    source: { file: string };
  };
  manifest.exportedAt = "1970-01-01T00:00:00.000Z";
  manifest.source.file = basename(backupPath);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const hash = computeSqliteG006bArchiveTreeHash(preview);
  rmSync(preview, { recursive: true });
  return hash;
}

async function upgradedOperationInput(
  root: string,
  databasePath: string,
  manifest: CompatibilityBackfillManifest,
): Promise<SqliteG006bExecuteInput> {
  const seed = createLegacyWebsiteLeadPlaySeed();
  const inspection = await inspectSqliteG006bPreFinalizationEvidence({ databasePath, manifest, seed });
  const backupPath = join(root, "accepted-legacy.g006b.backup.db");
  const treeHash = previewArchiveTree(root, databasePath, backupPath);
  return {
    mode: "execute",
    operationId: "g006c2a-upgraded",
    databasePath,
    backupPath,
    archiveDirectory: join(root, treeHash),
    preparedPath: join(root, "prepared.json"),
    committedPath: join(root, "committed.json"),
    manifest,
    seed,
    expectedSourceIdentity: inspection.sourceIdentity,
    expectedAcceptedPhysicalManifestDigest: inspection.acceptedPhysicalManifestDigest,
    expectedReceiptRowSha256: inspection.receiptRowSha256,
    expectedBindingId: inspection.bindingId,
    expectedConfigurationHash: inspection.configurationHash,
    expectedPreservationAggregateSha256: inspection.preservationAggregateSha256,
    expectedJournalMode: inspection.journalMode,
  };
}

function upgradedReplayInput(base: SqliteG006bExecuteInput): SqliteG006bReplayInput {
  const prepared = JSON.parse(readFileSync(base.preparedPath, "utf8")) as { handoffId: string };
  const committed = JSON.parse(readFileSync(base.committedPath, "utf8")) as { handoffId: string };
  return {
    ...base,
    mode: "replay",
    expectedPreparedHandoffId: prepared.handoffId,
    expectedCommittedHandoffId: committed.handoffId,
  };
}

export async function createUpgradedSqliteG002OperationFixture(): Promise<SqliteG002OperationFixture> {
  const root = mkdtempSync(join(tmpdir(), "g006c2a-upgraded-"));
  const databasePath = join(root, "accepted-legacy.db");
  try {
    const db = new Database(databasePath);
    let manifest: CompatibilityBackfillManifest;
    try {
      db.pragma("foreign_keys = ON");
      db.exec(SCHEMA_SQL);
      seedLegacyRows(db);
      prepareSqliteCompatibilityBackfill(adapter(db));
      manifest = upgradedManifest(db);
      runSqliteCompatibilityBackfill(adapter(db), manifest);
    } finally {
      db.close();
    }
    const executeInput = await upgradedOperationInput(root, databasePath, manifest);
    const result = await runSqliteG006bPreFinalization(executeInput);
    if (result.status !== "committed") throw new Error("G006C2A upgraded fixture did not commit");
    const replay = upgradedReplayInput(executeInput);
    const binding = await verifyCompatibilityScope({ backend: "sqlite", lifecycle: "upgraded", replay });
    if (Object.getPrototypeOf(binding) !== null || Reflect.ownKeys(binding).length !== 0) {
      throw new Error("G006C2A upgraded fixture returned a non-fieldless binding");
    }
    return registerFixture({
      lifecycle: "upgraded",
      root,
      databasePath,
      tenantId: UPGRADED_TENANT_ID,
      storageWorkspaceId: UPGRADED_WORKSPACE_ID,
      binding: binding as SqliteCompatibilityBinding,
    });
  } catch (error) {
    cleanupOwnedRoot(root, databasePath);
    throw error;
  }
}

function freshPolicy(): SqliteFreshTenantPolicyRow {
  return {
    id: FRESH_POLICY_ID,
    tenantId: FRESH_TENANT_ID,
    version: 1,
    locale: "en-US",
    timezone: "America/Denver",
    exportRetentionDays: 7,
    operationalLogRetentionDays: 30,
    rawSourceRetentionDays: 180,
    contactFreshnessDays: 180,
    primaryDeleteWithinDays: 30,
    backupExpireWithinDays: 35,
    tombstoneRetentionYears: 7,
    activeMaterialsMode: "while_authorized_until_superseded_policy_or_deletion",
    aiProcessingEnabled: 0,
    sourceResearchEnabled: 0,
    contactResearchEnabled: 0,
    outreachDraftingEnabled: 0,
    copyExportEnabled: 0,
    autonomousSendEnabled: 0,
    requireSourcePlanApproval: 1,
    requireKnowledgeReview: 1,
    requireIcpReview: 1,
    requireLeadPlayReview: 1,
    requireContactReview: 1,
    requireOutreachReview: 1,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function freshFoundation(): SqliteFreshFoundationInput {
  const policy = freshPolicy();
  return {
    tenant: {
      id: FRESH_TENANT_ID,
      slug: "g006c2a-fresh",
      name: "G006C2A Fresh Fixture",
      status: "active",
      locale: "en-US",
      timezone: "America/Denver",
      createdAt: NOW,
      updatedAt: NOW,
    },
    workspace: {
      id: FRESH_WORKSPACE_ID,
      tenantId: FRESH_TENANT_ID,
      slug: "main-workspace",
      name: "Main Workspace",
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
    },
    ownerMembership: {
      id: FRESH_MEMBERSHIP_ID,
      tenantId: FRESH_TENANT_ID,
      authIdentityId: FRESH_OWNER_AUTH_ID,
      pendingIdentityRefHash: null,
      workspaceId: FRESH_WORKSPACE_ID,
      status: "active",
      invitedByMembershipId: null,
      createdAt: NOW,
      updatedAt: NOW,
    },
    ownerRoleBinding: {
      id: FRESH_ROLE_BINDING_ID,
      tenantId: FRESH_TENANT_ID,
      membershipId: FRESH_MEMBERSHIP_ID,
      role: "owner",
      createdAt: NOW,
      validFrom: NOW,
      revokedAt: null,
      assignedByMembershipId: null,
      reasonCode: "initial_provisioning",
    },
    policy,
    policyHash: computeSqliteFreshPolicyHash(policy),
  };
}

function freshProvisionInput(databasePath: string): SqliteFreshCompatibilityProvisionInput {
  const foundation = freshFoundation();
  const seed = createLegacyWebsiteLeadPlaySeed();
  const bindingId = computeSqliteFreshPlayBindingId({
    tenantId: FRESH_TENANT_ID,
    workspaceId: FRESH_WORKSPACE_ID,
    sourceCardId: SQLITE_FRESH_COMPATIBILITY_SOURCE_CARD_ID,
    playId: LEGACY_WEBSITE_LEAD_PLAY_ID,
    playVersion: LEGACY_WEBSITE_LEAD_PLAY_VERSION,
    configurationHash: seed.configurationHash,
  });
  const fileIdentity = inspectSqliteFreshFileIdentity(databasePath);
  const foundationHash = computeSqliteFreshFoundationHash(foundation);
  const sourceHash = computeSqliteFreshSourceHash({ cardId: SQLITE_FRESH_COMPATIBILITY_SOURCE_CARD_ID });
  const expectedCanonicalBindingHash = computeSqliteFreshCanonicalBindingHash({
    databasePath,
    fileIdentity,
    journalMode: "delete",
    tenantId: FRESH_TENANT_ID,
    workspaceId: FRESH_WORKSPACE_ID,
    ownerAuthIdentityId: FRESH_OWNER_AUTH_ID,
    policyHash: foundation.policyHash,
    sourceCardId: SQLITE_FRESH_COMPATIBILITY_SOURCE_CARD_ID,
    sourceHash,
    playBindingId: bindingId,
    playConfigurationHash: seed.configurationHash,
    catalogVersion: SQLITE_SCHEMA_V1_CATALOG_VERSION,
    userVersion: SQLITE_SCHEMA_V1_STAGED_USER_VERSION,
    catalogDigest: SQLITE_SCHEMA_V1_CATALOG_DIGEST,
    internalCatalogDigest: SQLITE_SCHEMA_V1_INTERNAL_CATALOG_DIGEST,
    physicalManifestDigest: SQLITE_SCHEMA_V1_PHYSICAL_MANIFEST_DIGEST,
    foundationHash,
  });
  return {
    backend: "sqlite",
    lifecycle: "fresh",
    databasePath,
    expectedFileIdentity: fileIdentity,
    expectedJournalMode: "delete",
    foundation,
    source: { cardId: SQLITE_FRESH_COMPATIBILITY_SOURCE_CARD_ID, sourceHash },
    play: {
      seed,
      playId: LEGACY_WEBSITE_LEAD_PLAY_ID,
      playVersion: LEGACY_WEBSITE_LEAD_PLAY_VERSION,
      configurationHash: seed.configurationHash,
      bindingId,
    },
    catalog: {
      catalogVersion: SQLITE_SCHEMA_V1_CATALOG_VERSION,
      userVersion: SQLITE_SCHEMA_V1_STAGED_USER_VERSION,
      catalogDigest: SQLITE_SCHEMA_V1_CATALOG_DIGEST,
      internalCatalogDigest: SQLITE_SCHEMA_V1_INTERNAL_CATALOG_DIGEST,
      physicalManifestDigest: SQLITE_SCHEMA_V1_PHYSICAL_MANIFEST_DIGEST,
      applicationTableCount: SQLITE_SCHEMA_V1_APPLICATION_TABLE_COUNT,
    },
    expectedFoundationHash: foundationHash,
    expectedCanonicalBindingHash,
  };
}

export async function createFreshSqliteG002OperationFixture(): Promise<SqliteG002OperationFixture> {
  const root = mkdtempSync(join(tmpdir(), "g006c2a-fresh-"));
  const candidatePath = join(root, "fresh.sqlite");
  try {
    closeSync(openSync(candidatePath, "wx+"));
    const databasePath = realpathSync.native(candidatePath);
    const binding = await provisionFreshSqliteCompatibilityScope(freshProvisionInput(databasePath));
    return registerFixture({
      lifecycle: "fresh",
      root,
      databasePath,
      tenantId: FRESH_TENANT_ID,
      storageWorkspaceId: FRESH_WORKSPACE_ID,
      binding,
    });
  } catch (error) {
    cleanupOwnedRoot(root, candidatePath);
    throw error;
  }
}
