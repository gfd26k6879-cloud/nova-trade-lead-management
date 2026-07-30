import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { createInterface } from "node:readline";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";

const leaseProcesses = vi.hoisted(() => ({
  children: [] as ChildProcessWithoutNullStreams[],
  commands: [] as string[],
  executables: [] as string[],
}));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    spawn: (...args: unknown[]) => {
      const child = (actual.spawn as (...spawnArgs: unknown[]) => ReturnType<typeof actual.spawn>)(...args) as ChildProcessWithoutNullStreams;
      const argv = args[1];
      if (Array.isArray(argv) && argv.includes("LeaseDatabase")) {
        leaseProcesses.children.push(child);
        leaseProcesses.executables.push(String(args[0]));
        const originalWrite = child.stdin.write.bind(child.stdin) as (...writeArgs: unknown[]) => boolean;
        child.stdin.write = ((...writeArgs: unknown[]) => {
          leaseProcesses.commands.push(String(writeArgs[0]));
          return originalWrite(...writeArgs);
        }) as typeof child.stdin.write;
      }
      return child;
    },
  };
});

import { SCHEMA_SQL } from "@/lib/db/schema";
import {
  SQLITE_G006B_BINDING_DOMAIN,
  SQLITE_G006B_COMMITTED_DOMAIN,
  SQLITE_G006B_PREPARED_DOMAIN,
  canonicalizeSqliteG006bRecord,
  computeSqliteG006bArchiveTreeHash,
  hashSqliteG006bDomain,
  inspectSqliteG006bPreFinalizationEvidence,
  runSqliteG006bPreFinalization,
  type SqliteG006bExecuteInput,
  type SqliteG006bPreFinalizationInput,
  type SqliteG006bReplayInput,
  type SqliteG006bResumeInput,
} from "@/lib/db/sqlite-g006b-pre-finalization";
import { classifySqliteSchemaV1 } from "@/lib/db/sqlite-schema-coordinator";
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
const POLICY_HASH = "b".repeat(64);

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(leaseProcesses.children.splice(0).map((child) => child.exitCode === null
    ? new Promise<void>((resolveExit) => {
      child.once("exit", () => resolveExit());
      child.kill();
    })
    : Promise.resolve()));
  leaseProcesses.commands.splice(0);
  leaseProcesses.executables.splice(0);
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function adapter(db: Database.Database): SqliteBackfillDb {
  const value: SqliteBackfillDb = {
    all: <T extends Record<string, unknown>>(sql: string, params: readonly unknown[] = []) => db.prepare(sql).all(...params) as T[],
    get: <T extends Record<string, unknown>>(sql: string, params: readonly unknown[] = []) => db.prepare(sql).get(...params) as T | undefined,
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
    { legacyUserId: "legacy-owner", authIdentityId: OWNER_AUTH_ID, expectedEmail: "owner@example.test", expectedLegacyRole: "admin", expectedStatus: "active", membershipId: "30000000-0000-4000-8000-000000000101", workspaceId: WORKSPACE_ID, membershipRole: "owner", membershipStatus: "active", roleBindingId: "40000000-0000-4000-8000-000000000101", marketAccessIds: ["market-a"] },
    { legacyUserId: "legacy-researcher", authIdentityId: RESEARCHER_AUTH_ID, expectedEmail: "researcher@example.test", expectedLegacyRole: "researcher", expectedStatus: "active", membershipId: "30000000-0000-4000-8000-000000000102", workspaceId: WORKSPACE_ID, membershipRole: "researcher", membershipStatus: "active", roleBindingId: "40000000-0000-4000-8000-000000000102", marketAccessIds: [] },
    { legacyUserId: "legacy-disabled", authIdentityId: DISABLED_AUTH_ID, expectedEmail: "disabled@example.test", expectedLegacyRole: "researcher", expectedStatus: "disabled", membershipId: "30000000-0000-4000-8000-000000000103", workspaceId: WORKSPACE_ID, membershipRole: "researcher", membershipStatus: "suspended", roleBindingId: "40000000-0000-4000-8000-000000000103", marketAccessIds: [] },
  ];
}

function manifestFor(db: Database.Database): CompatibilityBackfillManifest {
  return {
    schemaVersion: 1,
    sourceEngine: SQLITE_COMPATIBILITY_SOURCE_ENGINE,
    checksumAlgorithm: SQLITE_COMPATIBILITY_CHECKSUM_ALGORITHM,
    idempotencyKey: "g006b-synthetic-v1",
    sourceSnapshotFingerprint: "a".repeat(64),
    tenantId: TENANT_ID,
    tenantSlug: "legacy-compatibility",
    tenantName: "Legacy Compatibility Tenant",
    workspaceId: WORKSPACE_ID,
    workspaceSlug: "legacy-website-lead",
    workspaceName: "Legacy Website Lead",
    ownerLegacyUserId: "legacy-owner",
    ownerAuthIdentityId: OWNER_AUTH_ID,
    policyId: "50000000-0000-4000-8000-000000000101",
    policyVersion: 1,
    policyHash: POLICY_HASH,
    legacyUsers: users(),
    legacyTables: COMPATIBILITY_TENANT_TABLES.map((table) => {
      const rows = db.prepare(`SELECT * FROM "${table}"`).all() as Array<Record<string, unknown>>;
      return { table, rowCount: rows.length, contentChecksum: compatibilityContentChecksum(rows) };
    }),
  };
}

function createAcceptedFixture(): { root: string; databasePath: string; manifest: CompatibilityBackfillManifest } {
  const root = mkdtempSync(join(tmpdir(), "g006b-b1-"));
  roots.push(root);
  const databasePath = join(root, "accepted-legacy.db");
  const db = new Database(databasePath);
  try {
    db.pragma("foreign_keys = ON");
    db.exec(SCHEMA_SQL);
    seedLegacyRows(db);
    prepareSqliteCompatibilityBackfill(adapter(db));
    const manifest = manifestFor(db);
    runSqliteCompatibilityBackfill(adapter(db), manifest);
    expect(classifySqliteSchemaV1(db).kind).toBe("accepted-legacy");
    return { root, databasePath, manifest };
  } finally {
    db.close();
  }
}

function previewArchiveTree(root: string, databasePath: string, backupPath: string): string {
  const preview = join(root, "archive-preview");
  exportSqliteData({ dbPath: databasePath, outDir: preview, schemaVersion: LEGACY_DATA_EXPORT_SCHEMA_VERSION });
  const manifestPath = join(preview, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { exportedAt: string; source: { file: string } };
  manifest.exportedAt = "1970-01-01T00:00:00.000Z";
  manifest.source.file = basename(backupPath);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const hash = computeSqliteG006bArchiveTreeHash(preview);
  rmSync(preview, { recursive: true });
  return hash;
}

async function operationInput(fixture: ReturnType<typeof createAcceptedFixture>): Promise<SqliteG006bExecuteInput> {
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
    operationId: "synthetic-b1",
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

function resumeInput(base: SqliteG006bExecuteInput): SqliteG006bResumeInput {
  return {
    ...base,
    mode: "resume",
    expectedPreparedHandoffId: handoffId(base.preparedPath),
  };
}

function replayInput(base: SqliteG006bExecuteInput): SqliteG006bReplayInput {
  return {
    ...base,
    mode: "replay",
    expectedPreparedHandoffId: handoffId(base.preparedPath),
    expectedCommittedHandoffId: handoffId(base.committedPath),
  };
}

const PUBLISHER = join(process.cwd(), "scripts", "g006b-windows-durable-publish.ps1");
const POWERSHELL = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";

function temporaryResidue(root: string): string[] {
  const result: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.name.includes(".g006b.tmp.") || entry.name.includes(".g006b.staging.") || entry.name.endsWith(".g006b.lock")) result.push(path);
      if (entry.isDirectory()) visit(path);
    }
  };
  visit(root);
  return result;
}

interface TestBroker {
  readonly child: ChildProcessWithoutNullStreams;
  send(command: string): Promise<void>;
  next(): Promise<Record<string, unknown>>;
  exit(): Promise<number | null>;
}

async function startTestBroker(root: string, label = "broker"): Promise<TestBroker> {
  const databasePath = join(root, `${label}.db`);
  writeFileSync(databasePath, "broker-database");
  const child = spawn(POWERSHELL, [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", PUBLISHER,
    "-Mode", "LeaseDatabase", "-Path", databasePath, "-LockPath", `${databasePath}.g006b.lock`,
  ], { shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => { stderr += chunk; });
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })[Symbol.asyncIterator]();
  const broker: TestBroker = {
    child,
    send: (command) => new Promise<void>((resolveWrite, rejectWrite) => {
      child.stdin.write(`${command}\n`, "utf8", (error) => error ? rejectWrite(error) : resolveWrite());
    }),
    next: async () => {
      const line = await lines.next();
      if (line.done) throw new Error(stderr || "broker EOF");
      return JSON.parse(line.value) as Record<string, unknown>;
    },
    exit: () => child.exitCode === null
      ? new Promise<number | null>((resolveExit) => child.once("exit", resolveExit))
      : Promise.resolve(child.exitCode),
  };
  expect(await broker.next()).toMatchObject({ status: "lease-ready" });
  return broker;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function rehashEnvelope(path: string, domain: string): { handoffId: string; recordSha256: string; payload: Record<string, unknown> } {
  const envelope = JSON.parse(readFileSync(path, "utf8")) as { handoffId: string; recordSha256: string; payload: Record<string, unknown> };
  envelope.recordSha256 = hashSqliteG006bDomain(domain, envelope.payload);
  envelope.handoffId = `g006b:v1:${envelope.recordSha256}`;
  writeFileSync(path, canonicalizeSqliteG006bRecord(envelope));
  return envelope;
}

function archiveEvidence(directory: string): Array<{ name: string; size: number; sha256: string }> {
  return readdirSync(directory).sort().map((name) => {
    const bytes = readFileSync(join(directory, name));
    return { name, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  });
}

describe("G-006B B1 SQLite pre-finalization", () => {
  it("uses strict recursive canonical JSON with UTF-16 key order and integer-only outer numbers", () => {
    expect(canonicalizeSqliteG006bRecord({ z: 1, A: [true, null], text: "ok" })).toBe('{"A":[true,null],"text":"ok","z":1}');
    expect(() => canonicalizeSqliteG006bRecord({ unsafe: 0.55 })).toThrow(/safe integer/);
    expect(() => canonicalizeSqliteG006bRecord({ negativeZero: -0 })).toThrow(/safe integer/);
    expect(() => canonicalizeSqliteG006bRecord({ lone: "\ud800" })).toThrow(/lone surrogate/);
    let getterCalls = 0;
    const accessor = Object.defineProperty({}, "value", { enumerable: true, get: () => { getterCalls += 1; return 1; } });
    expect(() => canonicalizeSqliteG006bRecord(accessor)).toThrow(/data property/);
    expect(getterCalls).toBe(0);
    expect(() => canonicalizeSqliteG006bRecord(new Proxy({ value: 1 }, {}))).toThrow(/canonical JSON/);
    expect(() => canonicalizeSqliteG006bRecord({ missing: undefined })).toThrow(/canonical JSON/);
  });

  it("B1-03/B1-05 snapshots input and leaves exact accepted state after a real PREPARED-before-DDL failure", async () => {
    const fixture = createAcceptedFixture();
    const base = await operationInput(fixture);
    const originalExec = Database.prototype.exec;
    const fault = vi.spyOn(Database.prototype, "exec").mockImplementation(function (this: Database.Database, sql: string) {
      if (this.name === fixture.databasePath && sql.startsWith('ALTER TABLE "place_cache"')) throw new Error("scoped DDL failure after PREPARED");
      return originalExec.call(this, sql);
    });
    const originalTenantName = base.manifest.tenantName;
    const firstRun = runSqliteG006bPreFinalization(base);
    (base.manifest as { tenantName: string }).tenantName = "caller-mutated-after-validation";
    await expect(firstRun).rejects.toThrow(/scoped DDL failure after PREPARED/);
    (base.manifest as { tenantName: string }).tenantName = originalTenantName;
    fault.mockRestore();

    expect(existsSync(base.preparedPath)).toBe(true);
    expect(existsSync(base.committedPath)).toBe(false);
    const beforeResume = new Database(fixture.databasePath, { readonly: true });
    expect(classifySqliteSchemaV1(beforeResume).kind).toBe("accepted-legacy");
    beforeResume.close();

    const tokensBeforeResume = leaseProcesses.commands
      .flatMap((command) => [...command.matchAll(/\.g006b\.(?:tmp|staging)\.([0-9a-f]{48})/gu)].map((match) => match[1]!));
    expect(new Set(tokensBeforeResume).size).toBe(1);
    const resumed = await runSqliteG006bPreFinalization(resumeInput(base));
    expect(resumed).toMatchObject({ mode: "resume", status: "committed" });
    const allTokens = leaseProcesses.commands
      .flatMap((command) => [...command.matchAll(/\.g006b\.(?:tmp|staging)\.([0-9a-f]{48})/gu)].map((match) => match[1]!));
    expect(new Set(allTokens).size).toBe(2);
    expect(temporaryResidue(fixture.root)).toEqual([]);
  }, 120_000);

  it("B1-06 rejects wrong PREPARED and COMMITTED handoff pins", async () => {
    const fixture = createAcceptedFixture();
    const base = await operationInput(fixture);
    await runSqliteG006bPreFinalization(base);

    await expect(runSqliteG006bPreFinalization({
      ...base,
      mode: "replay",
      expectedPreparedHandoffId: `g006b:v1:${"0".repeat(64)}`,
      expectedCommittedHandoffId: handoffId(base.committedPath),
    })).rejects.toMatchObject({ code: "G006B_RECOVERY_REQUIRED" });
    await expect(runSqliteG006bPreFinalization({
      ...replayInput(base),
      expectedCommittedHandoffId: `g006b:v1:${"0".repeat(64)}`,
    } as SqliteG006bPreFinalizationInput)).rejects.toMatchObject({ code: "G006B_RECOVERY_REQUIRED" });
  }, 120_000);

  it("B1-04 rejects a held native lock and resume without PREPARED before mutation", async () => {
    const fixture = createAcceptedFixture();
    const input = await operationInput(fixture);
    const lockPath = `${input.databasePath}.g006b.lock`;
    const resume = { ...input, mode: "resume" as const, expectedPreparedHandoffId: `g006b:v1:${"0".repeat(64)}` };
    writeFileSync(lockPath, "operator-owned-stale-lock");
    await expect(runSqliteG006bPreFinalization(resume)).rejects.toMatchObject({ code: "G006B_LOCK_HELD" });
    rmSync(lockPath);
    await expect(runSqliteG006bPreFinalization(resume)).rejects.toMatchObject({ code: "G006B_PREPARED_RECORD_REQUIRED" });
    const db = new Database(fixture.databasePath, { readonly: true });
    expect(classifySqliteSchemaV1(db).kind).toBe("accepted-legacy");
    db.close();
  });

  it("B1-01 rejects deep accessors, proxies, symbols, sparse arrays, and malformed mode fields before effects", async () => {
    const fixture = createAcceptedFixture();
    const base = await operationInput(fixture);
    let getterCalls = 0;
    const accessorManifest = structuredClone(base.manifest) as unknown as Record<string, unknown>;
    Object.defineProperty(accessorManifest, "tenantName", { enumerable: true, get: () => { getterCalls += 1; return "never"; } });
    await expect(runSqliteG006bPreFinalization({ ...base, manifest: accessorManifest } as unknown as SqliteG006bPreFinalizationInput))
      .rejects.toMatchObject({ code: "G006B_INPUT_REJECTED" });
    expect(getterCalls).toBe(0);

    const proxiedSeed = new Proxy(structuredClone(base.seed), {});
    await expect(runSqliteG006bPreFinalization({ ...base, seed: proxiedSeed } as SqliteG006bPreFinalizationInput))
      .rejects.toMatchObject({ code: "G006B_INPUT_REJECTED" });

    const symbolSeed = structuredClone(base.seed) as unknown as Record<PropertyKey, unknown>;
    symbolSeed[Symbol("hidden")] = true;
    await expect(runSqliteG006bPreFinalization({ ...base, seed: symbolSeed } as unknown as SqliteG006bPreFinalizationInput))
      .rejects.toMatchObject({ code: "G006B_INPUT_REJECTED" });

    const sparseManifest = structuredClone(base.manifest) as CompatibilityBackfillManifest & { legacyUsers: CompatibilityUserMapping[] };
    const sparse = new Array<CompatibilityUserMapping>(2);
    sparse[1] = sparseManifest.legacyUsers[0]!;
    sparseManifest.legacyUsers = sparse;
    await expect(runSqliteG006bPreFinalization({ ...base, manifest: sparseManifest }))
      .rejects.toMatchObject({ code: "G006B_INPUT_REJECTED" });

    await expect(runSqliteG006bPreFinalization({
      ...base,
      mode: "resume",
    } as unknown as SqliteG006bPreFinalizationInput)).rejects.toMatchObject({ code: "G006B_INPUT_REJECTED" });
    expect(temporaryResidue(fixture.root)).toEqual([]);
  });

  it("B1-02 rejects caller executable/temp/lock authority and preserves a nominated victim", async () => {
    const fixture = createAcceptedFixture();
    const base = await operationInput(fixture);
    const victim = join(fixture.root, "victim.txt");
    writeFileSync(victim, "must-survive");
    await expect(runSqliteG006bPreFinalization({
      ...base,
      publisherScriptPath: victim,
      backupTemporaryPath: victim,
    } as unknown as SqliteG006bPreFinalizationInput)).rejects.toMatchObject({ code: "G006B_INPUT_REJECTED" });
    expect(readFileSync(victim, "utf8")).toBe("must-survive");
  });

  it("B1-10 preserves WAL mode and contains no checkpoint or journal-mode assignment", async () => {
    const fixture = createAcceptedFixture();
    const journal = new Database(fixture.databasePath);
    expect(String(journal.pragma("journal_mode = WAL", { simple: true })).toLowerCase()).toBe("wal");
    journal.close();
    const base = await operationInput(fixture);
    const originalExec = Database.prototype.exec;
    const executeFault = vi.spyOn(Database.prototype, "exec").mockImplementation(function (this: Database.Database, sql: string) {
      if (this.name === fixture.databasePath && sql.startsWith('ALTER TABLE "place_cache"')) throw new Error("WAL execute interruption");
      return originalExec.call(this, sql);
    });
    await expect(runSqliteG006bPreFinalization(base)).rejects.toThrow(/WAL execute interruption/);
    executeFault.mockRestore();
    await expect(runSqliteG006bPreFinalization({ ...resumeInput(base), expectedJournalMode: "delete" }))
      .rejects.toMatchObject({ code: "G006B_EVIDENCE_DRIFT" });
    const committed = await runSqliteG006bPreFinalization(resumeInput(base));
    expect(committed).toMatchObject({ mode: "resume", status: "committed" });
    await expect(runSqliteG006bPreFinalization({ ...replayInput(base), expectedJournalMode: "delete" }))
      .rejects.toMatchObject({ code: "G006B_EVIDENCE_DRIFT" });
    expect(await runSqliteG006bPreFinalization(replayInput(base))).toMatchObject({ mode: "replay", status: "replayed" });

    const reopened = new Database(fixture.databasePath, { readonly: true });
    expect(String(reopened.pragma("journal_mode", { simple: true })).toLowerCase()).toBe("wal");
    expect(classifySqliteSchemaV1(reopened).kind).toBe("prepared-legacy");
    reopened.close();
    const walPath = `${fixture.databasePath}-wal`;
    if (existsSync(walPath)) expect(statSync(walPath).size).toBe(0);
    const committedRecord = JSON.parse(readFileSync(base.committedPath, "utf8")) as { payload: { database: { journalMode: string } } };
    expect(committedRecord.payload.database.journalMode).toBe("wal");
    const implementation = readFileSync(join(process.cwd(), "src/lib/db/sqlite-g006b-pre-finalization.ts"), "utf8");
    const helper = readFileSync(join(process.cwd(), "scripts/g006b-windows-durable-publish.ps1"), "utf8");
    expect(`${implementation}\n${helper}`).not.toMatch(/wal_checkpoint/iu);
    expect(`${implementation}\n${helper}`).not.toMatch(/journal_mode\s*=/iu);
  }, 120_000);

  it("B1-07 preserves a real writer primary plus ordered rollback cleanup diagnostics", async () => {
    const fixture = createAcceptedFixture();
    const base = await operationInput(fixture);
    const originalExec = Database.prototype.exec;
    let primaryThrown = false;
    vi.spyOn(Database.prototype, "exec").mockImplementation(function (this: Database.Database, sql: string) {
      if (this.name === fixture.databasePath && sql.startsWith('ALTER TABLE "place_cache"')) {
        primaryThrown = true;
        throw new Error("scoped writer primary");
      }
      if (this.name === fixture.databasePath && primaryThrown && sql === "ROLLBACK") throw new Error("scoped rollback cleanup");
      return originalExec.call(this, sql);
    });
    await expect(runSqliteG006bPreFinalization(base)).rejects.toMatchObject({
      code: "G006B_STATE_REJECTED",
      cleanupFailures: ["writer rollback: scoped rollback cleanup"],
    });
    expect(existsSync(base.preparedPath)).toBe(true);
    expect(temporaryResidue(fixture.root)).toEqual([]);
  }, 120_000);

  it("B1-08 reports a scoped post-COMMIT verifier failure as committed-unverified", async () => {
    const fixture = createAcceptedFixture();
    const base = await operationInput(fixture);
    const originalExec = Database.prototype.exec;
    let committed = false;
    vi.spyOn(Database.prototype, "exec").mockImplementation(function (this: Database.Database, sql: string) {
      if (this.name === fixture.databasePath && sql === "COMMIT") {
        const value = originalExec.call(this, sql);
        committed = true;
        return value;
      }
      if (this.name === fixture.databasePath && committed && sql === "BEGIN") throw new Error("scoped post-commit verifier failure");
      return originalExec.call(this, sql);
    });
    await expect(runSqliteG006bPreFinalization(base)).rejects.toMatchObject({
      code: "G006B_COMMITTED_UNVERIFIED_RECOVERY_REQUIRED",
      committed: true,
    });
    const post = new Database(fixture.databasePath, { readonly: true });
    expect(classifySqliteSchemaV1(post).kind).toBe("prepared-legacy");
    post.close();
    expect(existsSync(base.preparedPath)).toBe(true);
    expect(existsSync(base.committedPath)).toBe(false);
  }, 120_000);

  it("B1-09 reports retained-helper protocol loss after COMMIT as committed-unverified", async () => {
    const fixture = createAcceptedFixture();
    const base = await operationInput(fixture);
    const originalExec = Database.prototype.exec;
    vi.spyOn(Database.prototype, "exec").mockImplementation(function (this: Database.Database, sql: string) {
      const value = originalExec.call(this, sql);
      if (this.name === fixture.databasePath && sql === "COMMIT") {
        const active = [...leaseProcesses.children].reverse().find((child) => child.exitCode === null) as ChildProcessWithoutNullStreams | undefined;
        active?.stdin.write("unknown-after-commit\n");
      }
      return value;
    });
    await expect(runSqliteG006bPreFinalization(base)).rejects.toMatchObject({
      code: "G006B_COMMITTED_UNVERIFIED_RECOVERY_REQUIRED",
      committed: true,
      cleanupFailures: expect.arrayContaining([expect.stringMatching(/native lease release|owned release/)]),
    });
    expect(existsSync(base.preparedPath)).toBe(true);
    expect(existsSync(base.archiveDirectory)).toBe(true);
    expect(temporaryResidue(fixture.root)).toEqual([]);
  }, 120_000);

  it("B1-11 retains stable post-close bytes and denies a concurrent write during verification", async () => {
    const fixture = createAcceptedFixture();
    const base = await operationInput(fixture);
    const originalExec = Database.prototype.exec;
    let committed = false;
    let writeDenied = false;
    vi.spyOn(Database.prototype, "exec").mockImplementation(function (this: Database.Database, sql: string) {
      if (this.name === fixture.databasePath && sql === "COMMIT") {
        const value = originalExec.call(this, sql);
        committed = true;
        return value;
      }
      if (this.name === fixture.databasePath && committed && sql === "BEGIN") {
        const competing = spawnSync(process.execPath, ["-e", [
          "const Database=require('better-sqlite3')",
          "const db=new Database(process.argv[1])",
          "db.exec('BEGIN IMMEDIATE')",
          "db.prepare(\"UPDATE audit_logs SET action='competing-write' WHERE id='audit-1'\").run()",
          "db.exec('ROLLBACK')",
          "db.close()",
        ].join(";"), fixture.databasePath], { encoding: "utf8", shell: false, windowsHide: true });
        writeDenied = competing.status !== 0;
      }
      return originalExec.call(this, sql);
    });
    await runSqliteG006bPreFinalization(base);
    expect(writeDenied).toBe(true);
    const committedRecord = JSON.parse(readFileSync(base.committedPath, "utf8")) as { payload: { database: { native: Record<string, unknown> } } };
    const inspected = spawnSync(POWERSHELL, [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", PUBLISHER,
      "-Mode", "InspectFile", "-Path", fixture.databasePath,
    ], { encoding: "utf8", shell: false, windowsHide: true });
    expect(inspected.status).toBe(0);
    const native = JSON.parse(inspected.stdout) as Record<string, unknown>;
    const identity = Object.fromEntries(Object.entries(native)
      .filter(([key]) => key !== "status" && key !== "attributes" && key !== "finalPath"));
    expect(identity).toEqual(committedRecord.payload.database.native);
  }, 120_000);

  it("B1-11 rejects nonzero WAL before inspection returns authority pins", async () => {
    const fixture = createAcceptedFixture();
    const writer = new Database(fixture.databasePath);
    expect(String(writer.pragma("journal_mode = WAL", { simple: true })).toLowerCase()).toBe("wal");
    writer.prepare("INSERT INTO audit_logs (id, action) VALUES (?, ?)").run("wal-frame", "uncommitted");
    expect(statSync(`${fixture.databasePath}-wal`).size).toBeGreaterThan(0);
    let failure: unknown;
    try {
      await inspectSqliteG006bPreFinalizationEvidence({
        databasePath: fixture.databasePath,
        manifest: fixture.manifest,
        seed: createLegacyWebsiteLeadPlaySeed(),
      });
    } catch (error) {
      failure = error;
    } finally {
      writer.close();
    }
    expect(failure).toMatchObject({ code: expect.stringMatching(/^G006B_(?:STATE_REJECTED|PUBLISH_FAILED)$/u) });
  });

  it("B1-12 returns a deep-frozen pinned replay without mutating the database", async () => {
    const fixture = createAcceptedFixture();
    const base = await operationInput(fixture);
    await runSqliteG006bPreFinalization(base);
    const before = readFileSync(fixture.databasePath);
    const replay = await runSqliteG006bPreFinalization(replayInput(base));
    expect(replay).toMatchObject({ mode: "replay", status: "replayed" });
    expect(Object.isFrozen(replay)).toBe(true);
    expect(readFileSync(fixture.databasePath)).toEqual(before);
  }, 120_000);

  it.each([
    "source FileId/bytes",
    "accepted physical digest",
    "T028 receipt row hash",
    "G023 binding ID",
    "G023 configuration hash",
    "37-table preservation hash",
    "journal mode",
  ])("rejects a mismatched %s evidence pin before mutation", async (pin) => {
    const fixture = createAcceptedFixture();
    const base = await operationInput(fixture);
    let input: SqliteG006bExecuteInput;
    switch (pin) {
      case "source FileId/bytes":
        input = { ...base, expectedSourceIdentity: { ...base.expectedSourceIdentity, fileId: `${base.expectedSourceIdentity.fileId[0] === "0" ? "1" : "0"}${base.expectedSourceIdentity.fileId.slice(1)}` } };
        break;
      case "accepted physical digest": input = { ...base, expectedAcceptedPhysicalManifestDigest: "0".repeat(64) }; break;
      case "T028 receipt row hash": input = { ...base, expectedReceiptRowSha256: "0".repeat(64) }; break;
      case "G023 binding ID": input = { ...base, expectedBindingId: "wrong-binding" }; break;
      case "G023 configuration hash": input = { ...base, expectedConfigurationHash: "0".repeat(64) }; break;
      case "37-table preservation hash": input = { ...base, expectedPreservationAggregateSha256: "0".repeat(64) }; break;
      case "journal mode": input = { ...base, expectedJournalMode: base.expectedJournalMode === "wal" ? "delete" : "wal" }; break;
      default: throw new Error(`unknown pin ${pin}`);
    }
    await expect(runSqliteG006bPreFinalization(input)).rejects.toMatchObject({ code: "G006B_EVIDENCE_DRIFT" });
    const db = new Database(fixture.databasePath, { readonly: true });
    expect(classifySqliteSchemaV1(db).kind).toBe("accepted-legacy");
    db.close();
    expect(existsSync(base.preparedPath)).toBe(false);
  });

  it("uses the pinned absolute PowerShell/helper despite hostile PATH and rejects a modified helper copy as authority", async () => {
    const fixture = createAcceptedFixture();
    const hostile = join(fixture.root, "hostile-bin");
    const helperCopy = join(fixture.root, "modified-helper.ps1");
    mkdirSync(hostile);
    writeFileSync(join(hostile, "powershell.exe"), "hostile");
    writeFileSync(helperCopy, `${readFileSync(PUBLISHER, "utf8")}\n# modified copy\n`);
    const priorPath = process.env.PATH;
    process.env.PATH = hostile;
    try {
      await inspectSqliteG006bPreFinalizationEvidence({
        databasePath: fixture.databasePath,
        manifest: fixture.manifest,
        seed: createLegacyWebsiteLeadPlaySeed(),
      });
    } finally {
      process.env.PATH = priorPath;
    }
    expect(leaseProcesses.executables.at(-1)).toBe(POWERSHELL);
    const base = await operationInput(fixture);
    await expect(runSqliteG006bPreFinalization({ ...base, publisherScriptPath: helperCopy } as unknown as SqliteG006bPreFinalizationInput))
      .rejects.toMatchObject({ code: "G006B_INPUT_REJECTED" });
  });

  it("rejects a byte-identical database replacement with a different FileId", async () => {
    const fixture = createAcceptedFixture();
    const base = await operationInput(fixture);
    const bytes = readFileSync(fixture.databasePath);
    const original = `${fixture.databasePath}.original`;
    renameSync(fixture.databasePath, original);
    writeFileSync(fixture.databasePath, bytes);
    await expect(runSqliteG006bPreFinalization(base)).rejects.toMatchObject({ code: "G006B_EVIDENCE_DRIFT" });
    expect(readFileSync(fixture.databasePath)).toEqual(bytes);
    expect(readFileSync(original)).toEqual(bytes);
    expect(existsSync(base.preparedPath)).toBe(false);
  }, 120_000);

  it("rejects every closed sidecar/database restart combination outside the explicit execute-resume-replay states", async () => {
    const fixture = createAcceptedFixture();
    const base = await operationInput(fixture);
    await runSqliteG006bPreFinalization(base);

    await expect(runSqliteG006bPreFinalization(base)).rejects.toMatchObject({ code: "G006B_EVIDENCE_DRIFT" });
    await expect(runSqliteG006bPreFinalization({ ...resumeInput(base), expectedPreparedHandoffId: handoffId(base.preparedPath) }))
      .rejects.toMatchObject({ code: "G006B_PREPARED_RECORD_REQUIRED" });
    await expect(runSqliteG006bPreFinalization(replayInput(base))).resolves.toMatchObject({ mode: "replay", status: "replayed" });

    const preparedHandoffId = handoffId(base.preparedPath);
    const committedHandoffId = handoffId(base.committedPath);
    const committedBytes = readFileSync(base.committedPath);
    rmSync(base.committedPath);
    await expect(runSqliteG006bPreFinalization({
      ...base,
      mode: "replay",
      expectedPreparedHandoffId: preparedHandoffId,
      expectedCommittedHandoffId: `g006b:v1:${"0".repeat(64)}`,
    })).rejects.toMatchObject({ code: "G006B_RECOVERY_REQUIRED" });
    await expect(runSqliteG006bPreFinalization(resumeInput(base))).resolves.toMatchObject({ mode: "resume", status: "committed" });
    expect(readFileSync(base.committedPath)).toEqual(committedBytes);

    rmSync(base.preparedPath);
    await expect(runSqliteG006bPreFinalization({
      ...base,
      mode: "replay",
      expectedPreparedHandoffId: `g006b:v1:${"0".repeat(64)}`,
      expectedCommittedHandoffId: committedHandoffId,
    })).rejects.toMatchObject({ code: "G006B_RECOVERY_REQUIRED" });
    rmSync(base.committedPath);
    await expect(runSqliteG006bPreFinalization(base)).rejects.toMatchObject({ code: "G006B_EVIDENCE_DRIFT" });
    await expect(runSqliteG006bPreFinalization({
      ...base,
      mode: "resume",
      expectedPreparedHandoffId: `g006b:v1:${"0".repeat(64)}`,
    })).rejects.toMatchObject({ code: "G006B_PREPARED_RECORD_REQUIRED" });
  }, 120_000);

  it("rejects raw and self-rehashed semantic PREPARED/COMMITTED tampering", async () => {
    const fixture = createAcceptedFixture();
    const base = await operationInput(fixture);
    await runSqliteG006bPreFinalization(base);
    const preparedBytes = readFileSync(base.preparedPath);
    const committedBytes = readFileSync(base.committedPath);

    for (const path of [base.preparedPath, base.committedPath]) {
      writeFileSync(path, Buffer.concat([readFileSync(path), Buffer.from("\n")]));
      await expect(runSqliteG006bPreFinalization({
        ...base,
        mode: "replay",
        expectedPreparedHandoffId: handoffId(base.preparedPath),
        expectedCommittedHandoffId: handoffId(base.committedPath),
      })).rejects.toMatchObject({ code: "G006B_EVIDENCE_DRIFT" });
      writeFileSync(base.preparedPath, preparedBytes);
      writeFileSync(base.committedPath, committedBytes);
    }

    const prepared = JSON.parse(preparedBytes.toString("utf8")) as { payload: { basis: { kind: string } } };
    prepared.payload.basis.kind = "semantic-tamper";
    writeFileSync(base.preparedPath, canonicalizeSqliteG006bRecord(prepared));
    const rehashedPrepared = rehashEnvelope(base.preparedPath, SQLITE_G006B_PREPARED_DOMAIN);
    await expect(runSqliteG006bPreFinalization({
      ...base,
      mode: "replay",
      expectedPreparedHandoffId: rehashedPrepared.handoffId,
      expectedCommittedHandoffId: handoffId(base.committedPath),
    })).rejects.toMatchObject({ code: "G006B_EVIDENCE_DRIFT" });
    writeFileSync(base.preparedPath, preparedBytes);

    const committed = JSON.parse(committedBytes.toString("utf8")) as { payload: { verification: { relationshipOrphanCount: number } } };
    committed.payload.verification.relationshipOrphanCount = 1;
    writeFileSync(base.committedPath, canonicalizeSqliteG006bRecord(committed));
    const rehashedCommitted = rehashEnvelope(base.committedPath, SQLITE_G006B_COMMITTED_DOMAIN);
    await expect(runSqliteG006bPreFinalization({
      ...base,
      mode: "replay",
      expectedPreparedHandoffId: handoffId(base.preparedPath),
      expectedCommittedHandoffId: rehashedCommitted.handoffId,
    })).rejects.toMatchObject({ code: "G006B_RECOVERY_REQUIRED" });
  }, 120_000);

  it("rejects raw archive tampering and a semantically altered self-rehashed archive tree", async () => {
    const fixture = createAcceptedFixture();
    const base = await operationInput(fixture);
    await runSqliteG006bPreFinalization(base);
    const auditPath = join(base.archiveDirectory, "audit_logs.json");
    const auditBytes = readFileSync(auditPath);

    writeFileSync(auditPath, Buffer.concat([auditBytes, Buffer.from("\n")]));
    await expect(runSqliteG006bPreFinalization(replayInput(base))).rejects.toMatchObject({ code: "G006B_EVIDENCE_DRIFT" });
    writeFileSync(auditPath, auditBytes);

    const rows = JSON.parse(auditBytes.toString("utf8")) as Array<Record<string, unknown>>;
    rows[0]!.action = "self-rehashed.semantic-tamper";
    const tamperedAuditBytes = Buffer.from(`${JSON.stringify(rows, null, 2)}\n`, "utf8");
    writeFileSync(auditPath, tamperedAuditBytes);
    const manifestPath = join(base.archiveDirectory, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      tables: Record<string, { bytes: number; sha256: string }>;
    };
    manifest.tables.audit_logs!.bytes = tamperedAuditBytes.length;
    manifest.tables.audit_logs!.sha256 = createHash("sha256").update(tamperedAuditBytes).digest("hex");
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const treeHash = computeSqliteG006bArchiveTreeHash(base.archiveDirectory);
    const tamperedArchive = join(fixture.root, treeHash);
    renameSync(base.archiveDirectory, tamperedArchive);
    const entries = archiveEvidence(tamperedArchive);
    const manifestEntry = entries.find((entry) => entry.name === "manifest.json")!;

    const prepared = JSON.parse(readFileSync(base.preparedPath, "utf8")) as {
      payload: { archive: { path: string; schemaVersion: number; entries: typeof entries; treeHash: string; manifestSha256: string } };
    };
    prepared.payload.archive = {
      path: tamperedArchive,
      schemaVersion: 3,
      entries,
      treeHash,
      manifestSha256: manifestEntry.sha256,
    };
    writeFileSync(base.preparedPath, canonicalizeSqliteG006bRecord(prepared));
    const preparedEnvelope = rehashEnvelope(base.preparedPath, SQLITE_G006B_PREPARED_DOMAIN);

    const committed = JSON.parse(readFileSync(base.committedPath, "utf8")) as {
      payload: { preparedHandoffId: string; preparedRecordSha256: string; bindingHash: string };
    };
    committed.payload.preparedHandoffId = preparedEnvelope.handoffId;
    committed.payload.preparedRecordSha256 = preparedEnvelope.recordSha256;
    committed.payload.bindingHash = hashSqliteG006bDomain(SQLITE_G006B_BINDING_DOMAIN, preparedEnvelope.payload);
    writeFileSync(base.committedPath, canonicalizeSqliteG006bRecord(committed));
    const committedEnvelope = rehashEnvelope(base.committedPath, SQLITE_G006B_COMMITTED_DOMAIN);

    await expect(runSqliteG006bPreFinalization({
      ...base,
      archiveDirectory: tamperedArchive,
      mode: "replay",
      expectedPreparedHandoffId: preparedEnvelope.handoffId,
      expectedCommittedHandoffId: committedEnvelope.handoffId,
    })).rejects.toMatchObject({ code: "G006B_EVIDENCE_DRIFT" });
  }, 120_000);

  it("cleans every broker-owned staging identity after a partial archive export failure", async () => {
    const fixture = createAcceptedFixture();
    const base = await operationInput(fixture);
    const originalExec = Database.prototype.exec;
    const originalPrepare = Database.prototype.prepare;
    let exportStarted = false;
    vi.spyOn(Database.prototype, "exec").mockImplementation(function (this: Database.Database, sql: string) {
      if (this.name === base.backupPath && sql === "BEGIN") exportStarted = true;
      return originalExec.call(this, sql);
    });
    vi.spyOn(Database.prototype, "prepare").mockImplementation(function (this: Database.Database, sql: string) {
      if (exportStarted && this.name === base.backupPath && sql.includes('FROM "workspaces"')) throw new Error("scoped archive export failure");
      return originalPrepare.call(this, sql);
    });
    await expect(runSqliteG006bPreFinalization(base)).rejects.toThrow(/scoped archive export failure/);
    expect(temporaryResidue(fixture.root)).toEqual([]);
    expect(existsSync(base.preparedPath)).toBe(false);
    expect(existsSync(base.archiveDirectory)).toBe(false);
  }, 120_000);

  it("retains exact-existing destinations across 12 replacement challenges", async () => {
    const root = mkdtempSync(join(tmpdir(), "g006b-existing-broker-"));
    roots.push(root);
    const broker = await startTestBroker(root);
    for (let index = 0; index < 12; index += 1) {
      const bytes = `exact-existing-${index}`;
      const destination = join(root, `artifact-${index}.json`);
      const temporary = `${destination}.g006b.tmp.${randomBytes(24).toString("hex")}`;
      writeFileSync(destination, bytes);
      await broker.send(`resource-create-file\t${temporary}`);
      expect(await broker.next()).toMatchObject({ status: "resource-created" });
      writeFileSync(temporary, bytes);
      await broker.send(`resource-publish\t${temporary}\t${destination}\t${sha256(bytes)}\t${Buffer.byteLength(bytes)}`);
      expect(await broker.next()).toMatchObject({ status: "publication-ready" });
      expect(() => renameSync(destination, `${destination}.attacker`)).toThrow();
      await broker.send("publication-inspect");
      expect(await broker.next()).toMatchObject({ status: "publication-inspected" });
      await broker.send("publication-release");
      expect(await broker.next()).toMatchObject({ status: "publication-released" });
      expect(readFileSync(destination, "utf8")).toBe(bytes);
    }
    await broker.send("release");
    expect(await broker.next()).toMatchObject({ status: "lease-released" });
    broker.child.stdin.end();
    expect(await broker.exit()).toBe(0);
  }, 120_000);

  it.each([
    ["backup temp", "file"],
    ["archive staging directory", "directory"],
    ["archive entry temp", "file"],
    ["PREPARED temp", "file"],
    ["COMMITTED temp", "file"],
  ] as const)("rejects a preexisting derived %s and preserves its occupant", async (label, kind) => {
    const root = mkdtempSync(join(tmpdir(), "g006b-preexisting-"));
    roots.push(root);
    const parent = label === "archive entry temp" ? join(root, "archive") : root;
    if (parent !== root) mkdirSync(parent);
    const path = join(parent, `${label.replaceAll(" ", "-")}.g006b.${kind === "directory" ? "staging" : "tmp"}.${randomBytes(24).toString("hex")}`);
    if (kind === "directory") {
      mkdirSync(path);
      writeFileSync(join(path, "victim.txt"), "preexisting-directory-occupant");
    } else {
      writeFileSync(path, "preexisting-file-occupant");
    }
    const broker = await startTestBroker(root);
    await broker.send(`resource-create-${kind}\t${path}`);
    expect(await broker.exit()).toBe(12);
    expect(kind === "directory" ? readFileSync(join(path, "victim.txt"), "utf8") : readFileSync(path, "utf8"))
      .toMatch(/preexisting-.*-occupant/);
  });

  it("publishes and cleans only registered FileIds while post-registration replacement occupants survive", async () => {
    const root = mkdtempSync(join(tmpdir(), "g006b-swap-ledger-"));
    roots.push(root);
    const broker = await startTestBroker(root);
    const destination = join(root, "published.json");
    const source = `${destination}.g006b.tmp.${randomBytes(24).toString("hex")}`;
    const detached = `${source}.detached`;
    await broker.send(`resource-create-file\t${source}`);
    await broker.next();
    writeFileSync(source, "registered-file");
    renameSync(source, detached);
    writeFileSync(source, "replacement-file-occupant");
    await broker.send(`resource-publish\t${source}\t${destination}\t${sha256("registered-file")}\t15`);
    expect(await broker.next()).toMatchObject({ status: "publication-ready" });
    await broker.send("publication-inspect");
    await broker.next();
    await broker.send("publication-release");
    await broker.next();
    expect(readFileSync(destination, "utf8")).toBe("registered-file");
    expect(readFileSync(source, "utf8")).toBe("replacement-file-occupant");

    const directory = join(root, "registered-directory");
    const detachedDirectory = `${directory}.detached`;
    await broker.send(`resource-create-directory\t${directory}`);
    await broker.next();
    renameSync(directory, detachedDirectory);
    mkdirSync(directory);
    writeFileSync(join(directory, "victim.txt"), "replacement-directory-occupant");
    await broker.send(`resource-cleanup\t${directory}`);
    expect(await broker.next()).toMatchObject({ status: "resource-cleanup" });
    expect(readFileSync(join(directory, "victim.txt"), "utf8")).toBe("replacement-directory-occupant");
    expect(existsSync(detachedDirectory)).toBe(false);
    await broker.send("release");
    await broker.next();
    broker.child.stdin.end();
    expect(await broker.exit()).toBe(0);
  });

  it("reconciles identical two-publisher races and rejects different-byte races", async () => {
    const root = mkdtempSync(join(tmpdir(), "g006b-two-publishers-"));
    roots.push(root);
    const first = await startTestBroker(root, "first");
    const second = await startTestBroker(root, "second");
    const identicalDestination = join(root, "identical.json");
    const identicalBytes = "identical-race";
    const firstTemp = `${identicalDestination}.g006b.tmp.${randomBytes(24).toString("hex")}`;
    const secondTemp = `${identicalDestination}.g006b.tmp.${randomBytes(24).toString("hex")}`;
    await first.send(`resource-create-file\t${firstTemp}`); await first.next();
    await second.send(`resource-create-file\t${secondTemp}`); await second.next();
    writeFileSync(firstTemp, identicalBytes); writeFileSync(secondTemp, identicalBytes);
    await Promise.all([
      first.send(`resource-publish\t${firstTemp}\t${identicalDestination}\t${sha256(identicalBytes)}\t${Buffer.byteLength(identicalBytes)}`),
      second.send(`resource-publish\t${secondTemp}\t${identicalDestination}\t${sha256(identicalBytes)}\t${Buffer.byteLength(identicalBytes)}`),
    ]);
    expect(await first.next()).toMatchObject({ status: "publication-ready" });
    expect(await second.next()).toMatchObject({ status: "publication-ready" });
    for (const broker of [first, second]) {
      await broker.send("publication-inspect"); await broker.next();
      await broker.send("publication-release"); await broker.next();
    }
    await second.send("release"); await second.next(); second.child.stdin.end(); expect(await second.exit()).toBe(0);
    expect(readFileSync(identicalDestination, "utf8")).toBe(identicalBytes);

    const loser = await startTestBroker(root, "loser");
    const differentDestination = join(root, "different.json");
    const winnerTemp = `${differentDestination}.g006b.tmp.${randomBytes(24).toString("hex")}`;
    const loserTemp = `${differentDestination}.g006b.tmp.${randomBytes(24).toString("hex")}`;
    await first.send(`resource-create-file\t${winnerTemp}`); await first.next();
    await loser.send(`resource-create-file\t${loserTemp}`); await loser.next();
    writeFileSync(winnerTemp, "winner"); writeFileSync(loserTemp, "loser");
    await first.send(`resource-publish\t${winnerTemp}\t${differentDestination}\t${sha256("winner")}\t6`);
    await first.next();
    await loser.send(`resource-publish\t${loserTemp}\t${differentDestination}\t${sha256("loser")}\t5`);
    expect(await loser.exit()).toBe(13);
    expect(readFileSync(differentDestination, "utf8")).toBe("winner");
    await first.send("publication-inspect"); await first.next();
    await first.send("publication-release"); await first.next();
    await first.send("release"); await first.next(); first.child.stdin.end(); expect(await first.exit()).toBe(0);
  });

  it("returns exit 14 and preserves the visible destination on protocol loss after a fresh move", async () => {
    const root = mkdtempSync(join(tmpdir(), "g006b-loss-broker-"));
    roots.push(root);
    const broker = await startTestBroker(root);
    const bytes = "fresh-published-bytes";
    const destination = join(root, "fresh.json");
    const temporary = `${destination}.g006b.tmp.${randomBytes(24).toString("hex")}`;
    await broker.send(`resource-create-file\t${temporary}`);
    await broker.next();
    writeFileSync(temporary, bytes);
    await broker.send(`resource-publish\t${temporary}\t${destination}\t${sha256(bytes)}\t${Buffer.byteLength(bytes)}`);
    expect(await broker.next()).toMatchObject({ status: "publication-ready" });
    broker.child.stdin.end();
    expect(await broker.exit()).toBe(14);
    expect(readFileSync(destination, "utf8")).toBe(bytes);
  });

  it("never deletes a replacement occupant when fallback cleanup sees a different FileId", async () => {
    const root = mkdtempSync(join(tmpdir(), "g006b-identity-cleanup-"));
    roots.push(root);
    const broker = await startTestBroker(root);
    const owned = join(root, "owned.tmp");
    await broker.send(`resource-create-file\t${owned}`);
    const created = await broker.next();
    broker.child.stdin.end();
    expect(await broker.exit()).toBe(15);
    rmSync(owned);
    writeFileSync(owned, "replacement-occupant");
    const cleanup = spawnSync(POWERSHELL, [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", PUBLISHER,
      "-Mode", "CleanupOwned", "-Path", owned, "-Kind", "file",
      "-ExpectedVolumeSerialNumber", String(created.volumeSerialNumber), "-ExpectedFileId", String(created.fileId),
    ], { encoding: "utf8", shell: false, windowsHide: true });
    expect(cleanup.status).toBe(11);
    expect(readFileSync(owned, "utf8")).toBe("replacement-occupant");
  });
});
