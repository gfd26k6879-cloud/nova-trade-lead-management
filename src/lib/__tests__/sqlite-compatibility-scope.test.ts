import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";

const replayObserver = vi.hoisted(() => ({ calls: 0 }));

vi.mock("@/lib/db/sqlite-g006b-pre-finalization", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/sqlite-g006b-pre-finalization")>();
  return {
    ...actual,
    runSqliteG006bPreFinalization: (...args: Parameters<typeof actual.runSqliteG006bPreFinalization>) => {
      replayObserver.calls += 1;
      return actual.runSqliteG006bPreFinalization(...args);
    },
  };
});

import { SCHEMA_SQL } from "@/lib/db/schema";
import {
  SQLITE_G006B_SOURCE_CARD_ID,
  computeSqliteG006bArchiveTreeHash,
  inspectSqliteG006bPreFinalizationEvidence,
  runSqliteG006bPreFinalization,
  SqliteG006bError,
  type SqliteG006bExecuteInput,
  type SqliteG006bReplayInput,
} from "@/lib/db/sqlite-g006b-pre-finalization";
import { classifySqliteSchemaV1 } from "@/lib/db/sqlite-schema-coordinator";
import {
  requireSqliteCompatibilityScope,
  verifyCompatibilityScope,
  type SqliteCompatibilityBinding,
  type SqliteCompatibilityScopeExpectation,
  type UpgradedSqliteCompatibilityScopeInput,
} from "@/lib/db/sqlite-compatibility-scope";
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
import { createLegacyWebsiteLeadPlaySeed } from "@/lib/tenancy/compatibility-play";
import { exportSqliteData } from "../../../scripts/export-sqlite-data.mjs";
import { LEGACY_DATA_EXPORT_SCHEMA_VERSION } from "../../../scripts/data-transfer-contract.mjs";

const TENANT_ID = "00000000-0000-4000-8000-000000000101";
const WORKSPACE_ID = "10000000-0000-4000-8000-000000000101";
const OWNER_AUTH_ID = "20000000-0000-4000-8000-000000000101";
const RESEARCHER_AUTH_ID = "20000000-0000-4000-8000-000000000102";
const DISABLED_AUTH_ID = "20000000-0000-4000-8000-000000000103";
const POLICY_ID = "50000000-0000-4000-8000-000000000101";
const POLICY_HASH = "b".repeat(64);
const roots: string[] = [];

afterEach(() => {
  replayObserver.calls = 0;
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

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
  db.prepare("INSERT INTO app_users (id, user_id, email, role, status) VALUES ('legacy-owner', ?, 'owner@example.test', 'admin', 'active')").run(OWNER_AUTH_ID);
  db.prepare("INSERT INTO app_users (id, user_id, email, role, status) VALUES ('legacy-researcher', ?, 'researcher@example.test', 'researcher', 'active')").run(RESEARCHER_AUTH_ID);
  db.prepare("INSERT INTO app_users (id, user_id, email, role, status) VALUES ('legacy-disabled', ?, 'disabled@example.test', 'researcher', 'disabled')").run(DISABLED_AUTH_ID);
  db.prepare("UPDATE app_users SET created_by=?, team_lead_user_id=? WHERE id='legacy-researcher'").run(OWNER_AUTH_ID, OWNER_AUTH_ID);
  db.prepare("INSERT INTO user_market_access (user_id, market_id, created_by_user_id) VALUES (?, 'market-a', ?)").run(OWNER_AUTH_ID, OWNER_AUTH_ID);
  db.prepare("INSERT INTO crawl_runs (id, categories, status, created_by_user_id) VALUES ('run-1', '[]', 'done', ?)").run(OWNER_AUTH_ID);
  db.prepare("INSERT INTO crawl_units (id, crawl_run_id, zip, category) VALUES ('unit-1', 'run-1', '80202', 'industrial')").run();
  db.prepare("INSERT INTO leads (id, place_id, name, assigned_to_user_id) VALUES ('lead-1', 'place-1', 'Synthetic Materials Co', ?)").run(OWNER_AUTH_ID);
  db.prepare("INSERT INTO lead_notes (id, lead_id, author_user_id, body) VALUES ('note-1', 'lead-1', ?, 'synthetic note')").run(OWNER_AUTH_ID);
  db.prepare("INSERT INTO outreach_events (id, lead_id, channel, actor_user_id) VALUES ('outreach-1', 'lead-1', 'call', ?)").run(OWNER_AUTH_ID);
  db.prepare("INSERT INTO admin_requests (id, lead_id, request_type, created_by_user_id, assigned_admin_user_id) VALUES ('request-1', 'lead-1', 'quote_request', ?, ?)").run(OWNER_AUTH_ID, OWNER_AUTH_ID);
  db.prepare("INSERT INTO demos (id, lead_id, slug, published_by_user_id) VALUES ('demo-1', 'lead-1', 'synthetic-demo', ?)").run(OWNER_AUTH_ID);
  db.prepare("INSERT INTO place_cache (place_id, raw_json) VALUES ('place-1', '{}')").run();
  db.prepare("INSERT INTO places_master (place_id, name) VALUES ('place-1', 'Synthetic Materials Co')").run();
  db.prepare("INSERT INTO place_observations (id, place_id, endpoint, sku, raw_json) VALUES ('observation-1', 'place-1', 'details', 'places-details', '{}')").run();
  db.prepare("INSERT INTO api_usage_events (id, endpoint, sku) VALUES ('api-1', 'details', 'places-details')").run();
  db.prepare("INSERT INTO audit_logs (id, action) VALUES ('audit-1', 't028.rehearsal')").run();
}

function users(): readonly CompatibilityUserMapping[] {
  return [
    {
      legacyUserId: "legacy-owner",
      authIdentityId: OWNER_AUTH_ID,
      expectedEmail: "owner@example.test",
      expectedLegacyRole: "admin",
      expectedStatus: "active",
      membershipId: "30000000-0000-4000-8000-000000000101",
      workspaceId: WORKSPACE_ID,
      membershipRole: "owner",
      membershipStatus: "active",
      roleBindingId: "40000000-0000-4000-8000-000000000101",
      marketAccessIds: ["market-a"],
    },
    {
      legacyUserId: "legacy-researcher",
      authIdentityId: RESEARCHER_AUTH_ID,
      expectedEmail: "researcher@example.test",
      expectedLegacyRole: "researcher",
      expectedStatus: "active",
      membershipId: "30000000-0000-4000-8000-000000000102",
      workspaceId: WORKSPACE_ID,
      membershipRole: "researcher",
      membershipStatus: "active",
      roleBindingId: "40000000-0000-4000-8000-000000000102",
      marketAccessIds: [],
    },
    {
      legacyUserId: "legacy-disabled",
      authIdentityId: DISABLED_AUTH_ID,
      expectedEmail: "disabled@example.test",
      expectedLegacyRole: "researcher",
      expectedStatus: "disabled",
      membershipId: "30000000-0000-4000-8000-000000000103",
      workspaceId: WORKSPACE_ID,
      membershipRole: "researcher",
      membershipStatus: "suspended",
      roleBindingId: "40000000-0000-4000-8000-000000000103",
      marketAccessIds: [],
    },
  ];
}

function manifestFor(db: Database.Database): CompatibilityBackfillManifest {
  return {
    schemaVersion: 1,
    sourceEngine: SQLITE_COMPATIBILITY_SOURCE_ENGINE,
    checksumAlgorithm: SQLITE_COMPATIBILITY_CHECKSUM_ALGORITHM,
    idempotencyKey: "g006c0-synthetic-v1",
    sourceSnapshotFingerprint: "a".repeat(64),
    tenantId: TENANT_ID,
    tenantSlug: "legacy-compatibility",
    tenantName: "Legacy Compatibility Tenant",
    workspaceId: WORKSPACE_ID,
    workspaceSlug: "legacy-website-lead",
    workspaceName: "Legacy Website Lead",
    ownerLegacyUserId: "legacy-owner",
    ownerAuthIdentityId: OWNER_AUTH_ID,
    policyId: POLICY_ID,
    policyVersion: 1,
    policyHash: POLICY_HASH,
    legacyUsers: users(),
    legacyTables: COMPATIBILITY_TENANT_TABLES.map((table) => {
      const rows = db.prepare(`SELECT * FROM "${table}"`).all() as Array<Record<string, unknown>>;
      return { table, rowCount: rows.length, contentChecksum: compatibilityContentChecksum(rows) };
    }),
  };
}

interface AcceptedFixture {
  readonly root: string;
  readonly databasePath: string;
  readonly manifest: CompatibilityBackfillManifest;
}

function createAcceptedFixture(journalMode: "delete" | "wal" = "delete"): AcceptedFixture {
  const root = mkdtempSync(join(tmpdir(), "g006c0-"));
  roots.push(root);
  const databasePath = join(root, "accepted-legacy.db");
  const db = new Database(databasePath);
  let manifest: CompatibilityBackfillManifest;
  try {
    db.pragma("foreign_keys = ON");
    db.exec(SCHEMA_SQL);
    seedLegacyRows(db);
    prepareSqliteCompatibilityBackfill(adapter(db));
    manifest = manifestFor(db);
    runSqliteCompatibilityBackfill(adapter(db), manifest);
    expect(classifySqliteSchemaV1(db).kind).toBe("accepted-legacy");
    if (journalMode === "wal") {
      expect(String(db.pragma("journal_mode = WAL", { simple: true })).toLowerCase()).toBe("wal");
    }
  } finally {
    db.close();
  }
  return { root, databasePath, manifest };
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

async function operationInput(fixture: AcceptedFixture): Promise<SqliteG006bExecuteInput> {
  const seed = createLegacyWebsiteLeadPlaySeed();
  const inspection = await inspectSqliteG006bPreFinalizationEvidence({
    databasePath: fixture.databasePath,
    manifest: fixture.manifest,
    seed,
  });
  const backupPath = join(fixture.root, "accepted-legacy.g006b.backup.db");
  const treeHash = previewArchiveTree(fixture.root, fixture.databasePath, backupPath);
  return {
    mode: "execute",
    operationId: "synthetic-c0",
    databasePath: fixture.databasePath,
    backupPath,
    archiveDirectory: join(fixture.root, treeHash),
    preparedPath: join(fixture.root, "prepared.json"),
    committedPath: join(fixture.root, "committed.json"),
    manifest: fixture.manifest,
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

function handoffId(path: string): string {
  return (JSON.parse(readFileSync(path, "utf8")) as { handoffId: string }).handoffId;
}

function replayInput(base: SqliteG006bExecuteInput): SqliteG006bReplayInput {
  return {
    ...base,
    mode: "replay",
    expectedPreparedHandoffId: handoffId(base.preparedPath),
    expectedCommittedHandoffId: handoffId(base.committedPath),
  };
}

async function createCommittedFixture(journalMode: "delete" | "wal" = "delete"): Promise<{
  readonly base: SqliteG006bExecuteInput;
  readonly replay: SqliteG006bReplayInput;
}> {
  const base = await operationInput(createAcceptedFixture(journalMode));
  expect(await runSqliteG006bPreFinalization(base)).toMatchObject({ status: "committed" });
  expect(temporaryResidue(dirname(base.databasePath))).toEqual([]);
  return { base, replay: replayInput(base) };
}

function temporaryResidue(root: string): string[] {
  const result: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.name.includes(".g006b.tmp.")
          || entry.name.includes(".g006b.staging.")
          || entry.name.endsWith(".g006b.lock")) {
        result.push(path);
      }
      if (entry.isDirectory()) visit(path);
    }
  };
  visit(root);
  return result.sort();
}

interface ExactEvidenceSnapshot {
  readonly paths: readonly string[];
  readonly entries: ReadonlyMap<string, {
    readonly directory: boolean;
    readonly bytes: Buffer | null;
    readonly dev: bigint;
    readonly ino: bigint;
  }>;
}

function visibleEvidencePaths(base: SqliteG006bExecuteInput): string[] {
  const paths = [base.databasePath, base.backupPath, base.preparedPath, base.committedPath, base.archiveDirectory];
  if (existsSync(base.archiveDirectory)) {
    paths.push(...readdirSync(base.archiveDirectory).map((name) => join(base.archiveDirectory, name)));
  }
  return [...new Set(paths.filter((path) => existsSync(path)))].sort();
}

function snapshotEvidence(base: SqliteG006bExecuteInput): ExactEvidenceSnapshot {
  const paths = visibleEvidencePaths(base);
  const entries = new Map(paths.map((path) => {
    const stat = statSync(path, { bigint: true });
    const directory = stat.isDirectory();
    return [path, {
      directory,
      bytes: directory ? null : readFileSync(path),
      dev: stat.dev,
      ino: stat.ino,
    }] as const;
  }));
  return { paths, entries };
}

function expectEvidenceUnchanged(snapshot: ExactEvidenceSnapshot, base: SqliteG006bExecuteInput): void {
  expect(visibleEvidencePaths(base)).toEqual(snapshot.paths);
  for (const [path, expected] of snapshot.entries) {
    const stat = statSync(path, { bigint: true });
    expect(stat.isDirectory(), `${path} kind`).toBe(expected.directory);
    expect(stat.dev, `${path} volume`).toBe(expected.dev);
    expect(stat.ino, `${path} FileId`).toBe(expected.ino);
    if (!expected.directory) expect(readFileSync(path), `${path} bytes`).toEqual(expected.bytes);
  }
  expect(temporaryResidue(dirname(base.databasePath))).toEqual([]);
}

function upgradedInput(replay: SqliteG006bReplayInput): UpgradedSqliteCompatibilityScopeInput {
  return { backend: "sqlite", lifecycle: "upgraded", replay };
}

function expectedScope(replay: SqliteG006bReplayInput): SqliteCompatibilityScopeExpectation {
  return {
    databasePath: replay.databasePath,
    tenantId: replay.manifest.tenantId,
    workspaceId: replay.manifest.workspaceId,
  };
}

function flippedSha(value: string): string {
  return `${value[0] === "0" ? "1" : "0"}${value.slice(1)}`;
}

async function expectC0InputRejected(value: unknown): Promise<void> {
  await expect(verifyCompatibilityScope(value as never)).rejects.toMatchObject({
    code: "G006C0_INPUT_REJECTED",
  });
}

describe("G006C0 SQLite compatibility storage scope", () => {
  it("keeps explicit PostgreSQL pass-through frozen and does not call G006B or inspect environment state", async () => {
    process.env.DATABASE_URL = "sqlite-must-not-be-inferred";
    const before = replayObserver.calls;
    const result = await verifyCompatibilityScope({ backend: "postgresql" });
    expect(result).toEqual({ backend: "postgresql" });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Reflect.ownKeys(result)).toEqual(["backend"]);
    expect(replayObserver.calls).toBe(before);
    delete process.env.DATABASE_URL;
  });

  it.each(["delete", "wal"] as const)(
    "mints exact fieldless upgraded scope from real %s replay and reconstructs it without changing evidence",
    async (journalMode) => {
      const { base, replay } = await createCommittedFixture(journalMode);
      const before = snapshotEvidence(base);
      replayObserver.calls = 0;

      const binding = await verifyCompatibilityScope(upgradedInput(replay));
      expect(replayObserver.calls).toBe(1);
      expect(Object.isFrozen(binding)).toBe(true);
      expect(Object.getPrototypeOf(binding)).toBeNull();
      expect(Reflect.ownKeys(binding)).toEqual([]);
      const scope = requireSqliteCompatibilityScope(binding as SqliteCompatibilityBinding, expectedScope(replay));
      expect(scope).toEqual({
        backend: "sqlite",
        lifecycle: "upgraded",
        tenantId: TENANT_ID,
        workspaceId: WORKSPACE_ID,
        ownerAuthIdentityId: OWNER_AUTH_ID,
        policyId: POLICY_ID,
        policyVersion: 1,
        policyHash: POLICY_HASH,
        sourceCardId: SQLITE_G006B_SOURCE_CARD_ID,
        playBindingId: replay.expectedBindingId,
        playConfigurationHash: replay.expectedConfigurationHash,
        preparedHandoffId: replay.expectedPreparedHandoffId,
        committedHandoffId: replay.expectedCommittedHandoffId,
        canonicalBindingHash: expect.stringMatching(/^[0-9a-f]{64}$/u),
        authority: "storage-scope-only",
        grantsAuthentication: false,
        grantsAuthorization: false,
        grantsProviderExecution: false,
      });
      expect(Object.isFrozen(scope)).toBe(true);
      expectEvidenceUnchanged(before, base);

      const reconstructed = await verifyCompatibilityScope(upgradedInput(replay));
      expect(reconstructed).not.toBe(binding);
      expect(requireSqliteCompatibilityScope(reconstructed as SqliteCompatibilityBinding, expectedScope(replay)))
        .toEqual(scope);
      expectEvidenceUnchanged(before, base);
      const reopened = new Database(base.databasePath, { readonly: true, fileMustExist: true });
      try {
        expect(classifySqliteSchemaV1(reopened).kind).toBe("prepared-legacy");
        expect(String(reopened.pragma("journal_mode", { simple: true })).toLowerCase()).toBe(journalMode);
      } finally {
        reopened.close();
      }
    },
    120_000,
  );

  it("rejects malformed outer inputs, accessors, proxies, unknown discriminants, and non-replay lifecycle evidence", async () => {
    const { base } = await createCommittedFixture();
    const getter = vi.fn(() => { throw new Error("must not execute"); });
    const accessor = Object.defineProperty({}, "backend", { enumerable: true, get: getter });
    const values: unknown[] = [
      null,
      undefined,
      false,
      0,
      "sqlite",
      {},
      { backend: "postgresql", extra: true },
      { backend: "mysql" },
      { backend: "sqlite" },
      { backend: "sqlite", lifecycle: "unknown" },
      { backend: "sqlite", lifecycle: "upgraded" },
      Object.create({ backend: "postgresql" }),
      accessor,
      new Proxy({ backend: "postgresql" }, {}),
      { backend: "sqlite", lifecycle: "upgraded", replay: { ...base, mode: "execute" } },
      { backend: "sqlite", lifecycle: "upgraded", replay: { ...base, mode: "resume" } },
    ];
    for (const value of values) await expectC0InputRejected(value);
    expect(getter).not.toHaveBeenCalled();
    expect(replayObserver.calls).toBe(1); // fixture execute only
  }, 120_000);

  it("rejects replay and manifest accessors without executing them or invoking G006B", async () => {
    const { replay } = await createCommittedFixture();
    replayObserver.calls = 0;
    const getter = vi.fn(() => { throw new Error("must not execute"); });
    const replayAccessor = Object.defineProperty({ ...replay }, "databasePath", { enumerable: true, get: getter });
    const manifestAccessor = Object.defineProperty({ ...replay.manifest }, "tenantId", { enumerable: true, get: getter });
    await expectC0InputRejected(upgradedInput(replayAccessor as SqliteG006bReplayInput));
    await expectC0InputRejected(upgradedInput({ ...replay, manifest: manifestAccessor as CompatibilityBackfillManifest }));
    await expectC0InputRejected(upgradedInput(new Proxy(replay, {}) as SqliteG006bReplayInput));
    await expectC0InputRejected(upgradedInput({ ...replay, manifest: new Proxy(replay.manifest, {}) }));
    expect(getter).not.toHaveBeenCalled();
    expect(replayObserver.calls).toBe(0);
  }, 120_000);

  it("preserves G006B handoff, path, native, catalog, receipt, G023, configuration, preservation, and journal errors", async () => {
    const { base, replay } = await createCommittedFixture();
    const cases: Array<{ label: string; replay: SqliteG006bReplayInput; code: string }> = [
      {
        label: "handoff",
        replay: { ...replay, expectedCommittedHandoffId: `g006b:v1:${"0".repeat(64)}` },
        code: "G006B_RECOVERY_REQUIRED",
      },
      {
        label: "path",
        replay: { ...replay, databasePath: "relative.db" },
        code: "G006B_INPUT_REJECTED",
      },
      {
        label: "native",
        replay: {
          ...replay,
          expectedSourceIdentity: { ...replay.expectedSourceIdentity, sha256: flippedSha(replay.expectedSourceIdentity.sha256) },
        },
        code: "G006B_EVIDENCE_DRIFT",
      },
      {
        label: "catalog",
        replay: { ...replay, expectedAcceptedPhysicalManifestDigest: flippedSha(replay.expectedAcceptedPhysicalManifestDigest) },
        code: "G006B_EVIDENCE_DRIFT",
      },
      {
        label: "receipt",
        replay: { ...replay, expectedReceiptRowSha256: flippedSha(replay.expectedReceiptRowSha256) },
        code: "G006B_EVIDENCE_DRIFT",
      },
      {
        label: "G023 binding",
        replay: { ...replay, expectedBindingId: `${replay.expectedBindingId}-wrong` },
        code: "G006B_EVIDENCE_DRIFT",
      },
      {
        label: "configuration",
        replay: { ...replay, expectedConfigurationHash: flippedSha(replay.expectedConfigurationHash) },
        code: "G006B_EVIDENCE_DRIFT",
      },
      {
        label: "preservation",
        replay: { ...replay, expectedPreservationAggregateSha256: flippedSha(replay.expectedPreservationAggregateSha256) },
        code: "G006B_EVIDENCE_DRIFT",
      },
      {
        label: "journal",
        replay: { ...replay, expectedJournalMode: "wal" },
        code: "G006B_EVIDENCE_DRIFT",
      },
    ];
    for (const candidate of cases) {
      const before = snapshotEvidence(base);
      let failure: unknown;
      try {
        await verifyCompatibilityScope(upgradedInput(candidate.replay));
      } catch (error) {
        failure = error;
      }
      expect(failure, candidate.label).toBeInstanceOf(SqliteG006bError);
      expect(failure, candidate.label).toMatchObject({ code: candidate.code });
      expectEvidenceUnchanged(before, base);
    }
  }, 180_000);

  it("preserves a tampered committed record and the original G006B recovery error", async () => {
    const { base, replay } = await createCommittedFixture();
    const original = readFileSync(base.committedPath);
    writeFileSync(base.committedPath, Buffer.concat([original, Buffer.from("\n", "utf8")]));
    const tampered = snapshotEvidence(base);
    await expect(verifyCompatibilityScope(upgradedInput(replay))).rejects.toMatchObject({
      code: "G006B_EVIDENCE_DRIFT",
    });
    expectEvidenceUnchanged(tampered, base);
  }, 120_000);

  it("snapshots retained primitives before async replay so caller mutation cannot change minted scope", async () => {
    const { replay } = await createCommittedFixture();
    const input = upgradedInput(replay);
    const originalExpected = expectedScope(replay);
    const originalBinding = replay.expectedBindingId;
    const originalConfiguration = replay.expectedConfigurationHash;
    const pending = verifyCompatibilityScope(input);

    (replay as { databasePath: string }).databasePath = "mutated-after-call";
    (replay.manifest as { tenantId: string }).tenantId = "mutated-tenant";
    (replay.manifest as { workspaceId: string }).workspaceId = "mutated-workspace";
    (replay.manifest as { ownerAuthIdentityId: string }).ownerAuthIdentityId = "mutated-owner";
    (replay as { expectedBindingId: string }).expectedBindingId = "mutated-binding";
    (replay as { expectedConfigurationHash: string }).expectedConfigurationHash = "0".repeat(64);

    const binding = await pending;
    const scope = requireSqliteCompatibilityScope(binding as SqliteCompatibilityBinding, originalExpected);
    expect(scope).toMatchObject({
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      ownerAuthIdentityId: OWNER_AUTH_ID,
      playBindingId: originalBinding,
      playConfigurationHash: originalConfiguration,
    });
  }, 120_000);

  it("fails fresh SQLite closed with the typed C1 foundation requirement and never invokes G006B", async () => {
    const before = replayObserver.calls;
    await expect(verifyCompatibilityScope({ backend: "sqlite", lifecycle: "fresh" })).rejects.toMatchObject({
      code: "G006C0_FRESH_FOUNDATION_REQUIRED",
    });
    expect(replayObserver.calls).toBe(before);
    await expect(verifyCompatibilityScope({
      backend: "sqlite",
      lifecycle: "fresh",
      receipt: "not-authority",
    } as never)).rejects.toMatchObject({ code: "G006C0_INPUT_REJECTED" });
  });

  it("rejects forged, spread, copied, prototype-derived, proxied, and cross-selector capabilities", async () => {
    const { replay } = await createCommittedFixture();
    const binding = await verifyCompatibilityScope(upgradedInput(replay)) as SqliteCompatibilityBinding;
    const expectation = expectedScope(replay);
    const forgeries: unknown[] = [
      null,
      false,
      {},
      { ...(binding as object) },
      Object.assign({}, binding),
      Object.create(binding as object),
      Object.freeze(Object.create(null)),
      new Proxy(binding as object, {}),
    ];
    for (const forged of forgeries) {
      expect(() => requireSqliteCompatibilityScope(forged as SqliteCompatibilityBinding, expectation))
        .toThrow(expect.objectContaining({ code: "G006C0_CAPABILITY_REQUIRED" }));
    }
    for (const wrong of [
      { ...expectation, databasePath: `${expectation.databasePath}.other` },
      { ...expectation, tenantId: "other-tenant" },
      { ...expectation, workspaceId: "other-workspace" },
    ]) {
      expect(() => requireSqliteCompatibilityScope(binding, wrong))
        .toThrow(expect.objectContaining({ code: "G006C0_SCOPE_MISMATCH" }));
    }
    expect(() => Object.setPrototypeOf(binding as object, {})).toThrow();
    expect(Reflect.ownKeys(binding)).toEqual([]);
  }, 120_000);

  it("validates exact descriptor-safe expectations and exposes only frozen non-authorizing scope evidence", async () => {
    const { replay } = await createCommittedFixture();
    const binding = await verifyCompatibilityScope(upgradedInput(replay)) as SqliteCompatibilityBinding;
    const getter = vi.fn(() => { throw new Error("must not execute"); });
    const accessorExpectation = Object.defineProperty({
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
    }, "databasePath", { enumerable: true, get: getter });
    for (const expectation of [
      { ...expectedScope(replay), extra: true },
      { databasePath: replay.databasePath, tenantId: TENANT_ID },
      Object.create(expectedScope(replay)),
      new Proxy(expectedScope(replay), {}),
      accessorExpectation,
    ]) {
      expect(() => requireSqliteCompatibilityScope(binding, expectation as SqliteCompatibilityScopeExpectation))
        .toThrow(expect.objectContaining({ code: "G006C0_INPUT_REJECTED" }));
    }
    expect(getter).not.toHaveBeenCalled();

    const scope = requireSqliteCompatibilityScope(binding, expectedScope(replay));
    expect(Object.isFrozen(scope)).toBe(true);
    expect(Reflect.ownKeys(scope).sort()).toEqual([
      "authority",
      "backend",
      "canonicalBindingHash",
      "committedHandoffId",
      "grantsAuthentication",
      "grantsAuthorization",
      "grantsProviderExecution",
      "lifecycle",
      "ownerAuthIdentityId",
      "playBindingId",
      "playConfigurationHash",
      "policyHash",
      "policyId",
      "policyVersion",
      "preparedHandoffId",
      "sourceCardId",
      "tenantId",
      "workspaceId",
    ].sort());
    const serialized = JSON.stringify(scope);
    expect(serialized).not.toContain(replay.databasePath);
    expect(serialized).not.toContain(replay.preparedPath);
    expect(serialized).not.toContain(replay.committedPath);
    expect(serialized).not.toContain("manifest");
    expect(serialized).not.toContain("permission");
    expect(serialized).not.toContain("providerExecution\":true");
  }, 120_000);

  it("contains no getDb, environment, schema, query, app-user, action, worker, or SQL-rewrite dependency", () => {
    const sourcePath = fileURLToPath(new URL("../db/sqlite-compatibility-scope.ts", import.meta.url));
    const source = readFileSync(sourcePath, "utf8");
    expect(source).not.toMatch(/\bgetDb\b|process\.env|DATABASE_URL/u);
    expect(source).not.toMatch(/from\s+["'][^"']*(?:schema|queries|app-users|actions|worker)[^"']*["']/u);
    expect(source).not.toMatch(/\.prepare\s*\(|\.exec\s*\(|\.pragma\s*\(|new\s+Database\b/iu);
    expect(createHash("sha256").update(source).digest("hex")).toMatch(/^[0-9a-f]{64}$/u);
  });
});
