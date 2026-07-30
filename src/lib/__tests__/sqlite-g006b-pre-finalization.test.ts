import { createHash, randomBytes } from "node:crypto";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync, renameSync, rmSync, statSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";

const leaseProcesses = vi.hoisted(() => ({
  children: [] as ChildProcessWithoutNullStreams[],
  commands: [] as string[],
  executables: [] as string[],
  onCommand: undefined as undefined | ((child: ChildProcessWithoutNullStreams, command: string) => void),
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
          const command = String(writeArgs[0]);
          leaseProcesses.commands.push(command);
          leaseProcesses.onCommand?.(child, command);
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
  await Promise.all(leaseProcesses.children.splice(0).map((child) => child.exitCode === null && child.signalCode === null
    ? new Promise<void>((resolveExit) => {
      child.once("exit", () => resolveExit());
      child.kill();
    })
    : Promise.resolve()));
  leaseProcesses.commands.splice(0);
  leaseProcesses.executables.splice(0);
  leaseProcesses.onCommand = undefined;
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

interface ExactEvidenceSnapshot {
  readonly archiveDirectory: string;
  readonly extraPaths: readonly string[];
  readonly files: ReadonlyMap<string, { readonly directory: boolean; readonly bytes: Buffer | null; readonly ino: bigint }>;
}

function visibleEvidencePaths(base: SqliteG006bExecuteInput, archiveDirectory = base.archiveDirectory, extraPaths: readonly string[] = []): string[] {
  const candidates = [base.databasePath, base.backupPath, base.preparedPath, base.committedPath, archiveDirectory, ...extraPaths];
  for (const candidate of [...candidates]) {
    if (existsSync(candidate) && statSync(candidate).isDirectory()) {
      candidates.push(...readdirSync(candidate).map((name) => join(candidate, name)));
    }
  }
  return [...new Set(candidates.filter((path) => existsSync(path)))].sort();
}

function snapshotExactEvidence(base: SqliteG006bExecuteInput, archiveDirectory = base.archiveDirectory, extraPaths: readonly string[] = []): ExactEvidenceSnapshot {
  const files = new Map(visibleEvidencePaths(base, archiveDirectory, extraPaths).map((path) => {
    const stat = statSync(path, { bigint: true });
    const directory = stat.isDirectory();
    return [path, { directory, bytes: directory ? null : readFileSync(path), ino: stat.ino }] as const;
  }));
  return { archiveDirectory, extraPaths, files };
}

function expectExactEvidenceUnchanged(snapshot: ExactEvidenceSnapshot, base: SqliteG006bExecuteInput, label: string): void {
  expect(visibleEvidencePaths(base, snapshot.archiveDirectory, snapshot.extraPaths), `${label}: visible evidence set`)
    .toEqual([...snapshot.files.keys()]);
  for (const [path, expected] of snapshot.files) {
    const stat = statSync(path, { bigint: true });
    expect(stat.isDirectory(), `${label}: ${path} kind`).toBe(expected.directory);
    expect(stat.ino, `${label}: ${path} FileId`).toBe(expected.ino);
    if (!expected.directory) expect(readFileSync(path), `${label}: ${path} bytes`).toEqual(expected.bytes);
  }
  expect(temporaryResidue(dirname(base.databasePath)), `${label}: temporary residue`).toEqual([]);
  expect(existsSync(`${base.databasePath}.g006b.lock`), `${label}: lock residue`).toBe(false);
}

interface TestBroker {
  readonly child: ChildProcessWithoutNullStreams;
  send(command: string): Promise<void>;
  next(): Promise<Record<string, unknown>>;
  write(path: string, value: string | Buffer): Promise<Record<string, unknown>>;
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
    write: async (path, value) => {
      const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
      let offset = 0;
      while (offset < bytes.length) {
        const chunk = bytes.subarray(offset, Math.min(offset + 48 * 1024, bytes.length));
        await broker.send(`resource-write\t${path}\t${String(offset)}\t${chunk.toString("base64")}`);
        expect(await broker.next()).toMatchObject({ status: "resource-written", path, bytes: offset + chunk.length });
        offset += chunk.length;
      }
      await broker.send(`resource-write-complete\t${path}\t${String(bytes.length)}\t${createHash("sha256").update(bytes).digest("hex")}`);
      return broker.next();
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

function independentCanonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(independentCanonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${independentCanonicalJson(record[key])}`).join(",")}}`;
}

function independentDomainSha256(domain: string, value: unknown): string {
  return createHash("sha256").update(domain, "utf8").update(independentCanonicalJson(value), "utf8").digest("hex");
}

function rehashEnvelope(path: string, domain: string): { handoffId: string; recordSha256: string; payload: Record<string, unknown> } {
  const envelope = JSON.parse(readFileSync(path, "utf8")) as { handoffId: string; recordSha256: string; payload: Record<string, unknown> };
  envelope.recordSha256 = independentDomainSha256(domain, envelope.payload);
  envelope.handoffId = `g006b:v1:${envelope.recordSha256}`;
  writeFileSync(path, independentCanonicalJson(envelope));
  return envelope;
}

function archiveEvidence(directory: string): Array<{ name: string; size: number; sha256: string }> {
  return readdirSync(directory).sort().map((name) => {
    const bytes = readFileSync(join(directory, name));
    return { name, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  });
}

function independentArchiveTreeHash(directory: string): string {
  return independentDomainSha256("NOVATRADE\0G006B\0B1\0ARCHIVE\0V1\0", archiveEvidence(directory));
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

    const wrongPreparedEvidence = snapshotExactEvidence(base);
    await expect(runSqliteG006bPreFinalization({
      ...base,
      mode: "replay",
      expectedPreparedHandoffId: `g006b:v1:${"0".repeat(64)}`,
      expectedCommittedHandoffId: handoffId(base.committedPath),
    })).rejects.toMatchObject({ code: "G006B_RECOVERY_REQUIRED" });
    expectExactEvidenceUnchanged(wrongPreparedEvidence, base, "wrong PREPARED handoff pin");
    const wrongCommittedEvidence = snapshotExactEvidence(base);
    await expect(runSqliteG006bPreFinalization({
      ...replayInput(base),
      expectedCommittedHandoffId: `g006b:v1:${"0".repeat(64)}`,
    } as SqliteG006bPreFinalizationInput)).rejects.toMatchObject({ code: "G006B_RECOVERY_REQUIRED" });
    expectExactEvidenceUnchanged(wrongCommittedEvidence, base, "wrong COMMITTED handoff pin");
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
  }, 30_000);

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
    const beforeProbe = spawnSync(POWERSHELL, [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", PUBLISHER,
      "-Mode", "InspectFile", "-Path", fixture.databasePath,
    ], { encoding: "utf8", shell: false, windowsHide: true });
    expect(beforeProbe.status).toBe(0);
    const beforeNative = JSON.parse(beforeProbe.stdout) as Record<string, unknown>;
    const originalClose = Database.prototype.close;
    let rewritePending = true;
    const closeProbe = vi.spyOn(Database.prototype, "close").mockImplementation(function (this: Database.Database) {
      if (rewritePending && this.name === fixture.databasePath) {
        rewritePending = false;
        this.exec("VACUUM");
      }
      return originalClose.call(this);
    });
    const base = await operationInput(fixture);
    closeProbe.mockRestore();
    expect(rewritePending).toBe(false);
    expect(base.expectedSourceIdentity.fileId).toBe(beforeNative.fileId);
    expect(base.expectedSourceIdentity.volumeSerialNumber).toBe(beforeNative.volumeSerialNumber);
    expect(base.expectedSourceIdentity.size !== beforeNative.size || base.expectedSourceIdentity.sha256 !== beforeNative.sha256).toBe(true);
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
    let rawWriteDenied = false;
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
        try { writeFileSync(fixture.databasePath, "raw-attacker-byte-change"); } catch { rawWriteDenied = true; }
      }
      return originalExec.call(this, sql);
    });
    await runSqliteG006bPreFinalization(base);
    expect(writeDenied).toBe(true);
    expect(rawWriteDenied).toBe(true);
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
    expect(failure).toMatchObject({ code: "G006B_RECOVERY_REQUIRED" });
  });

  it("rejects a valid concurrent WAL commit at the settle boundary as committed-unverified", async () => {
    const fixture = createAcceptedFixture();
    const journal = new Database(fixture.databasePath);
    expect(String(journal.pragma("journal_mode = WAL", { simple: true })).toLowerCase()).toBe("wal");
    journal.close();
    const base = await operationInput(fixture);
    let attempted = false;
    let committed = false;
    let competitorDiagnostic = "";
    leaseProcesses.onCommand = (_child, rawCommand) => {
      if (attempted || rawCommand.trim() !== "settle") return;
      attempted = true;
      const competitor = spawnSync(process.execPath, ["-e", [
        "const Database=require('better-sqlite3')",
        "const db=new Database(process.argv[1])",
        "db.exec('BEGIN IMMEDIATE')",
        "db.prepare(\"INSERT INTO audit_logs (id, action) VALUES ('settle-race', 'settle-race')\").run()",
        "db.exec('COMMIT')",
        "db.close()",
      ].join(";"), fixture.databasePath], { encoding: "utf8", shell: false, windowsHide: true });
      competitorDiagnostic = competitor.stderr || competitor.error?.message || `exit ${String(competitor.status)}`;
      committed = competitor.status === 0;
    };
    let failure: unknown;
    try { await runSqliteG006bPreFinalization(base); } catch (error) { failure = error; }
    expect(attempted).toBe(true);
    expect(committed, competitorDiagnostic).toBe(true);
    expect(failure).toMatchObject({
      code: "G006B_COMMITTED_UNVERIFIED_RECOVERY_REQUIRED",
      committed: true,
    });
    const reopened = new Database(fixture.databasePath, { readonly: true });
    expect(reopened.prepare("SELECT action FROM audit_logs WHERE id='settle-race'").pluck().get()).toBe("settle-race");
    expect(classifySqliteSchemaV1(reopened).kind).toBe("prepared-legacy");
    reopened.close();
    expect(existsSync(base.committedPath)).toBe(false);
    expect(temporaryResidue(fixture.root)).toEqual([]);
    expect(existsSync(`${fixture.databasePath}.g006b.lock`)).toBe(false);
  }, 120_000);

  it("holds BEGIN IMMEDIATE across WAL inspection so a concurrent valid writer cannot grow the sidecar", async () => {
    const fixture = createAcceptedFixture();
    const journal = new Database(fixture.databasePath);
    expect(String(journal.pragma("journal_mode = WAL", { simple: true })).toLowerCase()).toBe("wal");
    journal.close();
    const originalExec = Database.prototype.exec;
    let denied = false;
    vi.spyOn(Database.prototype, "exec").mockImplementation(function (this: Database.Database, sql: string) {
      const result = originalExec.call(this, sql);
      if (this.name === fixture.databasePath && sql === "BEGIN IMMEDIATE") {
        const competitor = spawnSync(process.execPath, ["-e", [
          "const Database=require('better-sqlite3')",
          "const db=new Database(process.argv[1])",
          "db.exec('BEGIN IMMEDIATE')",
          "db.prepare(\"INSERT INTO audit_logs (id, action) VALUES ('inspection-race', 'inspection-race')\").run()",
          "db.exec('COMMIT')",
          "db.close()",
        ].join(";"), fixture.databasePath], { encoding: "utf8", shell: false, windowsHide: true });
        denied = competitor.status !== 0;
      }
      return result;
    });
    const inspection = await inspectSqliteG006bPreFinalizationEvidence({
      databasePath: fixture.databasePath,
      manifest: fixture.manifest,
      seed: createLegacyWebsiteLeadPlaySeed(),
    });
    expect(inspection.journalMode).toBe("wal");
    expect(denied).toBe(true);
    const reopened = new Database(fixture.databasePath, { readonly: true });
    expect(reopened.prepare("SELECT COUNT(*) FROM audit_logs WHERE id='inspection-race'").pluck().get()).toBe(0);
    reopened.close();
  }, 120_000);

  it("denies during-run main FileId replacement while the database lease is retained", async () => {
    const fixture = createAcceptedFixture();
    const base = await operationInput(fixture);
    let challenged = false;
    leaseProcesses.onCommand = (_child, rawCommand) => {
      if (challenged || !rawCommand.startsWith("resource-write\t")) return;
      challenged = true;
      expect(() => renameSync(fixture.databasePath, `${fixture.databasePath}.replacement`)).toThrow();
    };
    await runSqliteG006bPreFinalization(base);
    expect(challenged).toBe(true);
    expect(existsSync(`${fixture.databasePath}.replacement`)).toBe(false);
  }, 120_000);

  it("B1-12 returns a deep-frozen pinned replay without mutating the database", async () => {
    const fixture = createAcceptedFixture();
    const base = await operationInput(fixture);
    await runSqliteG006bPreFinalization(base);
    const before = snapshotExactEvidence(base);
    const replay = await runSqliteG006bPreFinalization(replayInput(base));
    expect(replay).toMatchObject({ mode: "replay", status: "replayed" });
    expect(Object.isFrozen(replay)).toBe(true);
    expectExactEvidenceUnchanged(before, base, "successful pinned replay");
  }, 120_000);

  it("binds replay to the operation ID, archive path, envelope hashes, and committed binding hash", async () => {
    const fixture = createAcceptedFixture();
    const base = await operationInput(fixture);
    await runSqliteG006bPreFinalization(base);
    const preparedId = handoffId(base.preparedPath);
    const committedId = handoffId(base.committedPath);
    const committedBytes = readFileSync(base.committedPath);

    const operationEvidence = snapshotExactEvidence(base);
    await expect(runSqliteG006bPreFinalization({ ...replayInput(base), operationId: "wrong-operation" }))
      .rejects.toMatchObject({ code: "G006B_EVIDENCE_DRIFT" });
    expectExactEvidenceUnchanged(operationEvidence, base, "wrong operation ID pin");

    const alternateParent = join(fixture.root, "alternate-archive-parent");
    const alternateArchive = join(alternateParent, basename(base.archiveDirectory));
    mkdirSync(alternateParent); mkdirSync(alternateArchive);
    for (const entry of readdirSync(base.archiveDirectory)) {
      writeFileSync(join(alternateArchive, entry), readFileSync(join(base.archiveDirectory, entry)));
    }
    const archivePathEvidence = snapshotExactEvidence(base, alternateArchive, [base.archiveDirectory]);
    await expect(runSqliteG006bPreFinalization({ ...replayInput(base), archiveDirectory: alternateArchive }))
      .rejects.toMatchObject({ code: "G006B_EVIDENCE_DRIFT" });
    expectExactEvidenceUnchanged(archivePathEvidence, base, "wrong archive path pin");

    const envelopeHashTamper = JSON.parse(committedBytes.toString("utf8")) as { recordSha256: string };
    envelopeHashTamper.recordSha256 = `${envelopeHashTamper.recordSha256[0] === "0" ? "1" : "0"}${envelopeHashTamper.recordSha256.slice(1)}`;
    writeFileSync(base.committedPath, independentCanonicalJson(envelopeHashTamper));
    const envelopeEvidence = snapshotExactEvidence(base);
    await expect(runSqliteG006bPreFinalization({ ...base, mode: "replay", expectedPreparedHandoffId: preparedId, expectedCommittedHandoffId: committedId }))
      .rejects.toMatchObject({ code: "G006B_EVIDENCE_DRIFT" });
    expectExactEvidenceUnchanged(envelopeEvidence, base, "COMMITTED envelope hash tamper");
    writeFileSync(base.committedPath, committedBytes);

    const committed = JSON.parse(committedBytes.toString("utf8")) as { payload: { bindingHash: string } };
    committed.payload.bindingHash = `${committed.payload.bindingHash[0] === "0" ? "1" : "0"}${committed.payload.bindingHash.slice(1)}`;
    writeFileSync(base.committedPath, independentCanonicalJson(committed));
    const rehashed = rehashEnvelope(base.committedPath, SQLITE_G006B_COMMITTED_DOMAIN);
    const bindingEvidence = snapshotExactEvidence(base);
    await expect(runSqliteG006bPreFinalization({
      ...base,
      mode: "replay",
      expectedPreparedHandoffId: preparedId,
      expectedCommittedHandoffId: rehashed.handoffId,
    })).rejects.toMatchObject({ code: "G006B_RECOVERY_REQUIRED" });
    expectExactEvidenceUnchanged(bindingEvidence, base, "self-rehashed COMMITTED binding tamper");
    expect(temporaryResidue(fixture.root)).toEqual([]);
  }, 120_000);

  it.each([
    "source volume serial number",
    "source FileId",
    "source size",
    "source SHA-256",
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
      case "source volume serial number":
        input = { ...base, expectedSourceIdentity: { ...base.expectedSourceIdentity, volumeSerialNumber: String(BigInt(base.expectedSourceIdentity.volumeSerialNumber) + BigInt(1)) } };
        break;
      case "source FileId":
        input = { ...base, expectedSourceIdentity: { ...base.expectedSourceIdentity, fileId: `${base.expectedSourceIdentity.fileId[0] === "0" ? "1" : "0"}${base.expectedSourceIdentity.fileId.slice(1)}` } };
        break;
      case "source size": input = { ...base, expectedSourceIdentity: { ...base.expectedSourceIdentity, size: base.expectedSourceIdentity.size + 1 } }; break;
      case "source SHA-256": input = { ...base, expectedSourceIdentity: { ...base.expectedSourceIdentity, sha256: `${base.expectedSourceIdentity.sha256[0] === "0" ? "1" : "0"}${base.expectedSourceIdentity.sha256.slice(1)}` } }; break;
      case "accepted physical digest": input = { ...base, expectedAcceptedPhysicalManifestDigest: "0".repeat(64) }; break;
      case "T028 receipt row hash": input = { ...base, expectedReceiptRowSha256: "0".repeat(64) }; break;
      case "G023 binding ID": input = { ...base, expectedBindingId: "wrong-binding" }; break;
      case "G023 configuration hash": input = { ...base, expectedConfigurationHash: "0".repeat(64) }; break;
      case "37-table preservation hash": input = { ...base, expectedPreservationAggregateSha256: "0".repeat(64) }; break;
      case "journal mode": input = { ...base, expectedJournalMode: base.expectedJournalMode === "wal" ? "delete" : "wal" }; break;
      default: throw new Error(`unknown pin ${pin}`);
    }
    const evidenceBefore = snapshotExactEvidence(base);
    await expect(runSqliteG006bPreFinalization(input)).rejects.toMatchObject({ code: "G006B_EVIDENCE_DRIFT" });
    expectExactEvidenceUnchanged(evidenceBefore, base, `pin ${pin}`);
    const db = new Database(fixture.databasePath, { readonly: true });
    expect(classifySqliteSchemaV1(db).kind).toBe("accepted-legacy");
    db.close();
    expect(existsSync(base.preparedPath)).toBe(false);
  }, 120_000);

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
    const helperHash = createHash("sha256").update(readFileSync(PUBLISHER, "utf8").replaceAll("\r\n", "\n"), "utf8").digest("hex");
    const implementation = readFileSync(join(process.cwd(), "src", "lib", "db", "sqlite-g006b-pre-finalization.ts"), "utf8");
    expect(implementation).toContain(`const PUBLISHER_NORMALIZED_SHA256 = "${helperHash}"`);
    const base = await operationInput(fixture);
    await expect(runSqliteG006bPreFinalization({ ...base, publisherScriptPath: helperCopy } as unknown as SqliteG006bPreFinalizationInput))
      .rejects.toMatchObject({ code: "G006B_INPUT_REJECTED" });
  });

  it("denies path substitution before every backup, archive, PREPARED, and COMMITTED application write", async () => {
    const fixture = createAcceptedFixture();
    const base = await operationInput(fixture);
    const challenged = new Set<string>();
    const failures: string[] = [];
    leaseProcesses.onCommand = (_child, rawCommand) => {
      const command = rawCommand.trimEnd();
      if (!command.startsWith("resource-write\t")) return;
      const [, path, offset] = command.split("\t", 4);
      if (!path || offset !== "0" || challenged.has(path)) return;
      challenged.add(path);
      try { renameSync(path, `${path}.substitution`); failures.push(`rename succeeded: ${path}`); } catch { /* retained handle denied substitution */ }
      try { writeFileSync(path, "attacker-write"); failures.push(`write succeeded: ${path}`); } catch { /* retained handle denied substitution */ }
    };
    await runSqliteG006bPreFinalization(base);
    expect(failures).toEqual([]);
    expect(challenged.size).toBe(79);
    expect([...challenged]).toEqual(expect.arrayContaining([
      expect.stringContaining("accepted-legacy.g006b.backup.db.g006b.tmp."),
      expect.stringContaining("prepared.json.g006b.tmp."),
      expect.stringContaining("committed.json.g006b.tmp."),
    ]));
    expect(temporaryResidue(fixture.root)).toEqual([]);
  }, 120_000);

  it.each([false, true])("retains the %s final archive parent through all child publication and validation", async (preexisting) => {
    const fixture = createAcceptedFixture();
    const base = await operationInput(fixture);
    if (preexisting) mkdirSync(base.archiveDirectory);
    let parentFileId = preexisting ? statSync(base.archiveDirectory, { bigint: true }).ino : undefined;
    const challengedChildren = new Set<string>();
    const challengeFailures: string[] = [];
    let challengeAttempts = 0;
    leaseProcesses.onCommand = (_child, rawCommand) => {
      const [verb, path, offset] = rawCommand.trimEnd().split("\t", 4);
      if (verb !== "resource-write" || !path || offset !== "0" || dirname(path) !== base.archiveDirectory || challengedChildren.has(path)) return;
      challengedChildren.add(path);
      const parent = statSync(base.archiveDirectory, { bigint: true });
      if (!parent.isDirectory()) challengeFailures.push(`${path}: archive parent is not a directory`);
      if (parentFileId === undefined) parentFileId = parent.ino;
      else if (parent.ino !== parentFileId) challengeFailures.push(`${path}: archive parent FileId changed`);
      challengeAttempts += 1;
      try {
        renameSync(base.archiveDirectory, `${base.archiveDirectory}.replacement-${String(challengedChildren.size)}`);
        challengeFailures.push(`${path}: archive parent replacement succeeded`);
      } catch { /* retained parent denies replacement throughout every child interval */ }
    };
    await runSqliteG006bPreFinalization(base);
    const finalEntries = readdirSync(base.archiveDirectory).sort();
    const challengedFinalEntries = [...challengedChildren]
      .map((path) => basename(path).replace(/\.g006b\.tmp\.[0-9a-f]{48}$/u, ""))
      .sort();
    const finalParent = statSync(base.archiveDirectory, { bigint: true });
    expect(challengeFailures).toEqual([]);
    expect(challengeAttempts).toBe(38);
    expect(challengedChildren.size).toBe(38);
    expect(challengedFinalEntries).toEqual(finalEntries);
    expect(finalEntries).toHaveLength(38);
    expect(finalParent.isDirectory()).toBe(true);
    expect(finalParent.ino).toBe(parentFileId);
    expect(computeSqliteG006bArchiveTreeHash(base.archiveDirectory)).toBe(basename(base.archiveDirectory));
  }, 120_000);

  it("retains every acknowledged final through PREPARED, COMMITTED, and terminal release", async () => {
    const fixture = createAcceptedFixture();
    const base = await operationInput(fixture);
    const snapshots = new Map<string, { bytes: Buffer; ino: bigint }>();
    const failures: string[] = [];
    const challengeFiles = (paths: readonly string[], phase: string): void => {
      for (const path of paths) {
        if (!snapshots.has(path)) snapshots.set(path, { bytes: readFileSync(path), ino: statSync(path, { bigint: true }).ino });
        try { writeFileSync(path, `attacker-${phase}`); failures.push(`${phase} write ${path}`); } catch { /* final lease denies writes */ }
        try { rmSync(path); failures.push(`${phase} delete ${path}`); } catch { /* final lease denies deletes */ }
        try { renameSync(path, `${path}.attacker-${phase}`); failures.push(`${phase} rename ${path}`); } catch { /* final lease denies replacement */ }
      }
    };
    const originalExec = Database.prototype.exec;
    let preparedChallenge = false;
    vi.spyOn(Database.prototype, "exec").mockImplementation(function (this: Database.Database, sql: string) {
      if (!preparedChallenge && this.name === fixture.databasePath && sql.startsWith('ALTER TABLE "place_cache"')) {
        preparedChallenge = true;
        challengeFiles([base.backupPath, base.preparedPath, ...readdirSync(base.archiveDirectory).map((name) => join(base.archiveDirectory, name))], "prepared");
        try { renameSync(base.archiveDirectory, `${base.archiveDirectory}.attacker-prepared`); failures.push("prepared archive parent rename"); } catch { /* final parent retained */ }
      }
      return originalExec.call(this, sql);
    });
    let terminalChallenge = false;
    leaseProcesses.onCommand = (_child, command) => {
      if (terminalChallenge || command.trimEnd() !== "release") return;
      terminalChallenge = true;
      challengeFiles([base.backupPath, base.preparedPath, base.committedPath, ...readdirSync(base.archiveDirectory).map((name) => join(base.archiveDirectory, name))], "terminal");
      try { renameSync(base.archiveDirectory, `${base.archiveDirectory}.attacker-terminal`); failures.push("terminal archive parent rename"); } catch { /* final parent retained */ }
    };
    await runSqliteG006bPreFinalization(base);
    expect(preparedChallenge).toBe(true);
    expect(terminalChallenge).toBe(true);
    expect(failures).toEqual([]);
    for (const [path, snapshot] of snapshots) {
      expect(readFileSync(path), path).toEqual(snapshot.bytes);
      expect(statSync(path, { bigint: true }).ino, path).toBe(snapshot.ino);
    }
    expect(readdirSync(base.archiveDirectory)).toHaveLength(38);
    expect(temporaryResidue(fixture.root)).toEqual([]);
  }, 120_000);

  it("reports terminal archive-tree drift after COMMIT as committed-unverified and preserves all visible evidence", async () => {
    const fixture = createAcceptedFixture();
    const base = await operationInput(fixture);
    const snapshots = new Map<string, { bytes: Buffer; ino: bigint }>();
    const extra = join(base.archiveDirectory, "attacker-extra.json");
    let injected = false;
    leaseProcesses.onCommand = (_child, command) => {
      if (injected || command.trimEnd() !== "release") return;
      injected = true;
      for (const path of [base.backupPath, base.preparedPath, base.committedPath, ...readdirSync(base.archiveDirectory).map((name) => join(base.archiveDirectory, name))]) {
        snapshots.set(path, { bytes: readFileSync(path), ino: statSync(path, { bigint: true }).ino });
      }
      writeFileSync(extra, "terminal-tree-drift-evidence");
    };
    await expect(runSqliteG006bPreFinalization(base)).rejects.toMatchObject({
      code: "G006B_COMMITTED_UNVERIFIED_RECOVERY_REQUIRED",
      committed: true,
      cleanupFailures: expect.arrayContaining([expect.stringMatching(/retained archive tree binding drift/)]),
    });
    expect(injected).toBe(true);
    expect(readFileSync(extra, "utf8")).toBe("terminal-tree-drift-evidence");
    for (const [path, snapshot] of snapshots) {
      expect(readFileSync(path), path).toEqual(snapshot.bytes);
      expect(statSync(path, { bigint: true }).ino, path).toBe(snapshot.ino);
    }
    const db = new Database(fixture.databasePath, { readonly: true });
    expect(classifySqliteSchemaV1(db).kind).toBe("prepared-legacy");
    db.close();
    expect(existsSync(`${fixture.databasePath}.g006b.lock`)).toBe(false);
    expect(temporaryResidue(fixture.root)).toEqual([]);
  }, 120_000);

  it("keeps pre-commit resume retention loss in recovery taxonomy and preserves all evidence occupants", async () => {
    const fixture = createAcceptedFixture();
    const base = await operationInput(fixture);
    const originalExec = Database.prototype.exec;
    const interruption = vi.spyOn(Database.prototype, "exec").mockImplementation(function (this: Database.Database, sql: string) {
      if (this.name === fixture.databasePath && sql.startsWith('ALTER TABLE "place_cache"')) throw new Error("leave PREPARED for retention probe");
      return originalExec.call(this, sql);
    });
    await expect(runSqliteG006bPreFinalization(base)).rejects.toThrow(/leave PREPARED/);
    interruption.mockRestore();
    const preparedBytes = readFileSync(base.preparedPath);
    const archiveSnapshots = new Map(readdirSync(base.archiveDirectory).map((name) => {
      const path = join(base.archiveDirectory, name);
      return [path, { bytes: readFileSync(path), ino: statSync(path, { bigint: true }).ino }] as const;
    }));
    const attacked = join(base.archiveDirectory, "audit_logs.json");
    const detached = `${attacked}.detached-evidence`;
    let retentionAttacked = false;
    leaseProcesses.onCommand = (_child, command) => {
      if (retentionAttacked || command.trimEnd() !== `final-retain-directory\t${base.archiveDirectory}`) return;
      retentionAttacked = true;
      const deadline = Date.now() + 2_000;
      while (true) {
        try { renameSync(attacked, detached); break; }
        catch (error) {
          if (Date.now() >= deadline) throw error;
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
        }
      }
      while (existsSync(attacked) || !existsSync(detached)) {
        if (Date.now() >= deadline) throw new Error("retention-loss rename did not become visible before broker command");
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
      }
    };
    await expect(runSqliteG006bPreFinalization(resumeInput(base))).rejects.toMatchObject({ code: "G006B_RECOVERY_REQUIRED" });
    expect(retentionAttacked).toBe(true);
    expect(existsSync(attacked)).toBe(false);
    expect(readFileSync(detached)).toEqual(archiveSnapshots.get(attacked)!.bytes);
    expect(statSync(detached, { bigint: true }).ino).toBe(archiveSnapshots.get(attacked)!.ino);
    expect(readFileSync(base.preparedPath)).toEqual(preparedBytes);
    for (const [path, snapshot] of archiveSnapshots) {
      if (path === attacked) continue;
      expect(readFileSync(path), path).toEqual(snapshot.bytes);
      expect(statSync(path, { bigint: true }).ino, path).toBe(snapshot.ino);
    }
    expect(existsSync(base.backupPath)).toBe(true);
    expect(existsSync(base.committedPath)).toBe(false);
    expect(temporaryResidue(fixture.root)).toEqual([]);
  }, 120_000);

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

  it("dynamically closes the 3x3x3 database/PREPARED/COMMITTED restart table", async () => {
    const fixture = createAcceptedFixture();
    const base = await operationInput(fixture);
    await runSqliteG006bPreFinalization(base);
    const acceptedBytes = readFileSync(base.backupPath);
    const preparedBytes = readFileSync(fixture.databasePath);
    const preparedRecord = readFileSync(base.preparedPath);
    const committedRecord = readFileSync(base.committedPath);
    const expectedArchiveEntries = readdirSync(base.archiveDirectory).sort();
    const preparedId = handoffId(base.preparedPath);
    const committedId = handoffId(base.committedPath);
    writeFileSync(fixture.databasePath, preparedBytes);
    const other = new Database(fixture.databasePath);
    other.pragma("user_version = 5999");
    other.close();
    const otherBytes = readFileSync(fixture.databasePath);
    const states = { accepted: acceptedBytes, prepared: preparedBytes, other: otherBytes } as const;
    const recordStates = ["absent", "valid", "invalid"] as const;
    let rows = 0;

    for (const [databaseState, databaseBytes] of Object.entries(states)) {
      for (const preparedState of recordStates) {
        for (const committedState of recordStates) {
          rows += 1;
          writeFileSync(fixture.databasePath, databaseBytes);
          for (const suffix of ["-wal", "-shm"]) rmSync(`${fixture.databasePath}${suffix}`, { force: true });
          rmSync(base.preparedPath, { force: true }); rmSync(base.committedPath, { force: true });
          if (preparedState === "valid") writeFileSync(base.preparedPath, preparedRecord);
          if (preparedState === "invalid") writeFileSync(base.preparedPath, "{}");
          if (committedState === "valid") writeFileSync(base.committedPath, committedRecord);
          if (committedState === "invalid") writeFileSync(base.committedPath, "{}");
          const label = `${databaseState}/${preparedState}/${committedState}`;
          const before = readFileSync(fixture.databasePath);
          const databaseIno = statSync(fixture.databasePath, { bigint: true }).ino;
          const archiveParentBefore = statSync(base.archiveDirectory, { bigint: true });
          expect(archiveParentBefore.isDirectory(), `${label}: archive parent kind before`).toBe(true);
          const visibleBefore = visibleEvidencePaths(base);
          const finalsBefore = new Map(visibleBefore.filter((path) => path !== fixture.databasePath).map((path) => {
            const stat = statSync(path, { bigint: true });
            return [path, { directory: stat.isDirectory(), bytes: stat.isDirectory() ? null : readFileSync(path), ino: stat.ino }] as const;
          }));
          const preparedExisted = existsSync(base.preparedPath);
          const committedExisted = existsSync(base.committedPath);
          const input: SqliteG006bPreFinalizationInput = preparedState === "valid" && committedState === "absent"
            ? { ...base, mode: "resume", expectedPreparedHandoffId: preparedId }
            : preparedState !== "absent" || committedState !== "absent"
              ? { ...base, mode: "replay", expectedPreparedHandoffId: preparedId, expectedCommittedHandoffId: committedId }
              : base;
          const shouldPass = databaseState === "accepted" && preparedState === "absent" && committedState === "absent"
            || (databaseState === "accepted" || databaseState === "prepared") && preparedState === "valid" && committedState === "absent"
            || databaseState === "prepared" && preparedState === "valid" && committedState === "valid";
          let failure: unknown;
          try { await runSqliteG006bPreFinalization(input); } catch (error) { failure = error; }
          expect(failure === undefined, `${label}: ${failure instanceof Error ? failure.message : String(failure)}`).toBe(shouldPass);
          if (!shouldPass) expect(readFileSync(fixture.databasePath)).toEqual(before);
          expect(statSync(fixture.databasePath, { bigint: true }).ino, `${label}: database FileId`).toBe(databaseIno);
          const expectedVisible = shouldPass
            ? [...new Set([...visibleBefore, base.preparedPath, base.committedPath])].sort()
            : visibleBefore;
          expect(visibleEvidencePaths(base), `${label}: exact visible-final set`).toEqual(expectedVisible);
          const archiveParentAfter = statSync(base.archiveDirectory, { bigint: true });
          expect(archiveParentAfter.isDirectory(), `${label}: archive parent kind after`).toBe(true);
          expect(archiveParentAfter.ino, `${label}: archive parent FileId`).toBe(archiveParentBefore.ino);
          expect(readdirSync(base.archiveDirectory).sort(), `${label}: exact 38-entry archive tree`).toEqual(expectedArchiveEntries);
          for (const [path, snapshot] of finalsBefore) {
            const stat = statSync(path, { bigint: true });
            expect(stat.isDirectory(), `${label}: ${path} kind`).toBe(snapshot.directory);
            expect(stat.ino, `${label}: ${path} FileId`).toBe(snapshot.ino);
            if (!snapshot.directory) expect(readFileSync(path), `${label}: ${path} bytes`).toEqual(snapshot.bytes);
          }
          if (shouldPass) {
            const newlyCreated = [
              ...(!preparedExisted ? [[base.preparedPath, preparedRecord] as const] : []),
              ...(!committedExisted ? [[base.committedPath, committedRecord] as const] : []),
            ];
            for (const [path, expectedBytes] of newlyCreated) {
              expect(statSync(path).isFile(), `${label}: ${path} newly created kind`).toBe(true);
              expect(readFileSync(path), `${label}: ${path} newly created exact bytes`).toEqual(expectedBytes);
            }
            expect(expectedArchiveEntries, `${label}: archive entry count`).toHaveLength(38);
          }
          expect(temporaryResidue(fixture.root)).toEqual([]);
          expect(existsSync(`${fixture.databasePath}.g006b.lock`)).toBe(false);
        }
      }
    }
    expect(rows).toBe(27);
  }, 240_000);

  it("rejects raw and self-rehashed semantic PREPARED/COMMITTED tampering", async () => {
    const fixture = createAcceptedFixture();
    const base = await operationInput(fixture);
    await runSqliteG006bPreFinalization(base);
    const preparedBytes = readFileSync(base.preparedPath);
    const committedBytes = readFileSync(base.committedPath);
    const preparedId = handoffId(base.preparedPath);
    const committedId = handoffId(base.committedPath);

    for (const [path, original] of [[base.preparedPath, preparedBytes], [base.committedPath, committedBytes]] as const) {
      for (const mutation of ["missing", "extra"] as const) {
        const envelope = JSON.parse(original.toString("utf8")) as Record<string, unknown>;
        if (mutation === "missing") delete envelope.format;
        else envelope.unexpected = "tamper";
        writeFileSync(path, independentCanonicalJson(envelope));
        const evidenceBefore = snapshotExactEvidence(base);
        await expect(runSqliteG006bPreFinalization({
          ...base,
          mode: "replay",
          expectedPreparedHandoffId: preparedId,
          expectedCommittedHandoffId: committedId,
        })).rejects.toMatchObject({ code: expect.stringMatching(/^G006B_(?:INPUT_REJECTED|EVIDENCE_DRIFT)$/u) });
        expectExactEvidenceUnchanged(evidenceBefore, base, `${basename(path)} ${mutation} envelope key`);
        writeFileSync(path, original);
      }
    }

    for (const path of [base.preparedPath, base.committedPath]) {
      writeFileSync(path, Buffer.concat([readFileSync(path), Buffer.from("\n")]));
      const evidenceBefore = snapshotExactEvidence(base);
      await expect(runSqliteG006bPreFinalization({
        ...base,
        mode: "replay",
        expectedPreparedHandoffId: handoffId(base.preparedPath),
        expectedCommittedHandoffId: handoffId(base.committedPath),
      })).rejects.toMatchObject({ code: "G006B_EVIDENCE_DRIFT" });
      expectExactEvidenceUnchanged(evidenceBefore, base, `${basename(path)} trailing-byte tamper`);
      writeFileSync(base.preparedPath, preparedBytes);
      writeFileSync(base.committedPath, committedBytes);
    }

    const prepared = JSON.parse(preparedBytes.toString("utf8")) as { payload: { basis: { kind: string } } };
    prepared.payload.basis.kind = "semantic-tamper";
    writeFileSync(base.preparedPath, independentCanonicalJson(prepared));
    const rehashedPrepared = rehashEnvelope(base.preparedPath, SQLITE_G006B_PREPARED_DOMAIN);
    const preparedEvidenceBefore = snapshotExactEvidence(base);
    await expect(runSqliteG006bPreFinalization({
      ...base,
      mode: "replay",
      expectedPreparedHandoffId: rehashedPrepared.handoffId,
      expectedCommittedHandoffId: handoffId(base.committedPath),
    })).rejects.toMatchObject({ code: "G006B_EVIDENCE_DRIFT" });
    expectExactEvidenceUnchanged(preparedEvidenceBefore, base, "self-rehashed PREPARED semantic tamper");
    writeFileSync(base.preparedPath, preparedBytes);

    const committed = JSON.parse(committedBytes.toString("utf8")) as { payload: { verification: { relationshipOrphanCount: number } } };
    committed.payload.verification.relationshipOrphanCount = 1;
    writeFileSync(base.committedPath, independentCanonicalJson(committed));
    const rehashedCommitted = rehashEnvelope(base.committedPath, SQLITE_G006B_COMMITTED_DOMAIN);
    const committedEvidenceBefore = snapshotExactEvidence(base);
    await expect(runSqliteG006bPreFinalization({
      ...base,
      mode: "replay",
      expectedPreparedHandoffId: handoffId(base.preparedPath),
      expectedCommittedHandoffId: rehashedCommitted.handoffId,
    })).rejects.toMatchObject({ code: "G006B_RECOVERY_REQUIRED" });
    expectExactEvidenceUnchanged(committedEvidenceBefore, base, "self-rehashed COMMITTED semantic tamper");
  }, 120_000);

  it("rejects raw archive tampering and a semantically altered self-rehashed archive tree", async () => {
    const fixture = createAcceptedFixture();
    const base = await operationInput(fixture);
    await runSqliteG006bPreFinalization(base);
    const auditPath = join(base.archiveDirectory, "audit_logs.json");
    const auditBytes = readFileSync(auditPath);

    writeFileSync(auditPath, Buffer.concat([auditBytes, Buffer.from("\n")]));
    const rawArchiveEvidenceBefore = snapshotExactEvidence(base);
    await expect(runSqliteG006bPreFinalization(replayInput(base))).rejects.toMatchObject({ code: "G006B_EVIDENCE_DRIFT" });
    expectExactEvidenceUnchanged(rawArchiveEvidenceBefore, base, "raw archive tamper");
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
    const treeHash = independentArchiveTreeHash(base.archiveDirectory);
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
    writeFileSync(base.preparedPath, independentCanonicalJson(prepared));
    const preparedEnvelope = rehashEnvelope(base.preparedPath, SQLITE_G006B_PREPARED_DOMAIN);

    const committed = JSON.parse(readFileSync(base.committedPath, "utf8")) as {
      payload: { preparedHandoffId: string; preparedRecordSha256: string; bindingHash: string };
    };
    committed.payload.preparedHandoffId = preparedEnvelope.handoffId;
    committed.payload.preparedRecordSha256 = preparedEnvelope.recordSha256;
    committed.payload.bindingHash = independentDomainSha256(SQLITE_G006B_BINDING_DOMAIN, preparedEnvelope.payload);
    writeFileSync(base.committedPath, independentCanonicalJson(committed));
    const committedEnvelope = rehashEnvelope(base.committedPath, SQLITE_G006B_COMMITTED_DOMAIN);
    const semanticArchiveEvidenceBefore = snapshotExactEvidence(base, tamperedArchive);

    await expect(runSqliteG006bPreFinalization({
      ...base,
      archiveDirectory: tamperedArchive,
      mode: "replay",
      expectedPreparedHandoffId: preparedEnvelope.handoffId,
      expectedCommittedHandoffId: committedEnvelope.handoffId,
    })).rejects.toMatchObject({ code: "G006B_EVIDENCE_DRIFT" });
    expectExactEvidenceUnchanged(semanticArchiveEvidenceBefore, base, "self-rehashed archive semantic tamper");
  }, 120_000);

  it("rejects missing, extra, and altered archive entries plus backup byte tampering", async () => {
    const fixture = createAcceptedFixture();
    const base = await operationInput(fixture);
    await runSqliteG006bPreFinalization(base);
    const auditPath = join(base.archiveDirectory, "audit_logs.json");
    const auditBytes = readFileSync(auditPath);
    const detached = join(fixture.root, "audit_logs.detached");

    renameSync(auditPath, detached);
    const missingEvidenceBefore = snapshotExactEvidence(base, base.archiveDirectory, [detached]);
    await expect(runSqliteG006bPreFinalization(replayInput(base))).rejects.toMatchObject({ code: "G006B_RECOVERY_REQUIRED" });
    expectExactEvidenceUnchanged(missingEvidenceBefore, base, "missing archive entry");
    renameSync(detached, auditPath);

    const extra = join(base.archiveDirectory, "unexpected.json");
    writeFileSync(extra, "[]\n");
    const extraEvidenceBefore = snapshotExactEvidence(base);
    await expect(runSqliteG006bPreFinalization(replayInput(base))).rejects.toMatchObject({ code: "G006B_EVIDENCE_DRIFT" });
    expectExactEvidenceUnchanged(extraEvidenceBefore, base, "extra archive entry");
    rmSync(extra);

    writeFileSync(auditPath, Buffer.concat([auditBytes, Buffer.from("\n")]));
    const alteredEvidenceBefore = snapshotExactEvidence(base);
    await expect(runSqliteG006bPreFinalization(replayInput(base))).rejects.toMatchObject({ code: "G006B_EVIDENCE_DRIFT" });
    expectExactEvidenceUnchanged(alteredEvidenceBefore, base, "altered archive entry");
    writeFileSync(auditPath, auditBytes);

    const backupBytes = readFileSync(base.backupPath);
    writeFileSync(base.backupPath, Buffer.concat([backupBytes, Buffer.from([0])]));
    const backupEvidenceBefore = snapshotExactEvidence(base);
    await expect(runSqliteG006bPreFinalization(replayInput(base))).rejects.toMatchObject({ code: "G006B_EVIDENCE_DRIFT" });
    expectExactEvidenceUnchanged(backupEvidenceBefore, base, "altered backup bytes");
    expect(readFileSync(base.preparedPath)).toBeTruthy();
    expect(readFileSync(base.committedPath)).toBeTruthy();
    expect(temporaryResidue(fixture.root)).toEqual([]);
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

  it.each(["backup", "archive-child", "PREPARED", "COMMITTED"] as const)("reconciles hard broker death after the %s move but before publication-ready", async (phase) => {
    const fixture = createAcceptedFixture();
    const base = await operationInput(fixture);
    let source = "";
    let destination = "";
    let expectedSha = "";
    let expectedBytes = -1;
    let triggered = false;
    let resolveDeath!: () => void;
    const death = new Promise<void>((resolve) => { resolveDeath = resolve; });
    leaseProcesses.onCommand = (child, rawCommand) => {
      const parts = rawCommand.trimEnd().split("\t");
      if (triggered || parts[0] !== "resource-publish") return;
      const candidate = parts[2] ?? "";
      const matches = phase === "backup" ? candidate === base.backupPath
        : phase === "archive-child" ? dirname(candidate) === base.archiveDirectory && basename(candidate) === "admin_requests.json"
          : phase === "PREPARED" ? candidate === base.preparedPath : candidate === base.committedPath;
      if (!matches) return;
      triggered = true;
      source = parts[1] ?? "";
      destination = candidate;
      expectedSha = parts[3] ?? "";
      expectedBytes = Number(parts[4]);
      child.stdout.pause();
      const deadline = Date.now() + 5_000;
      const poll = setInterval(() => {
        if (existsSync(destination) || Date.now() >= deadline) {
          clearInterval(poll);
          child.kill();
          resolveDeath();
        }
      }, 5);
    };
    const expectedCode = phase === "COMMITTED"
      ? "G006B_COMMITTED_UNVERIFIED_RECOVERY_REQUIRED"
      : "G006B_PUBLISHED_UNVERIFIED_RECOVERY_REQUIRED";
    await expect(runSqliteG006bPreFinalization(base)).rejects.toMatchObject({ code: expectedCode });
    await death;
    expect(triggered).toBe(true);
    expect(existsSync(source)).toBe(false);
    expect(existsSync(destination)).toBe(true);
    const visible = readFileSync(destination);
    expect(visible.length).toBe(expectedBytes);
    expect(createHash("sha256").update(visible).digest("hex")).toBe(expectedSha);
    const db = new Database(fixture.databasePath, { readonly: true });
    expect(classifySqliteSchemaV1(db).kind).toBe(phase === "COMMITTED" ? "prepared-legacy" : "accepted-legacy");
    db.close();
    expect(existsSync(`${fixture.databasePath}.g006b.lock`)).toBe(false);
    expect(temporaryResidue(fixture.root)).toEqual([]);
  }, 120_000);

  it("treats a pre-move hard death plus source FileId substitution as published-uncertain and preserves the replacement", async () => {
    const fixture = createAcceptedFixture();
    const base = await operationInput(fixture);
    let source = "";
    let replacementBytes = Buffer.alloc(0);
    let triggered = false;
    leaseProcesses.onCommand = (child, rawCommand) => {
      const parts = rawCommand.trimEnd().split("\t");
      if (triggered || parts[0] !== "resource-publish" || parts[2] !== base.backupPath) return;
      triggered = true;
      source = parts[1] ?? "";
      child.once("exit", () => {
        const detached = `${source}.recorded`;
        renameSync(source, detached);
        replacementBytes = Buffer.from("replacement-after-hard-death", "utf8");
        writeFileSync(source, replacementBytes);
      });
      child.kill();
    };
    await expect(runSqliteG006bPreFinalization(base)).rejects.toMatchObject({
      code: "G006B_PUBLISHED_UNVERIFIED_RECOVERY_REQUIRED",
      published: true,
    });
    expect(triggered).toBe(true);
    expect(readFileSync(source)).toEqual(replacementBytes);
    expect(existsSync(base.backupPath)).toBe(false);
    expect(existsSync(`${fixture.databasePath}.g006b.lock`)).toBe(false);
  }, 120_000);

  it("preserves a nonidentical COMMITTED destination conflict and reports committed-unverified", async () => {
    const fixture = createAcceptedFixture();
    const base = await operationInput(fixture);
    const conflicting = Buffer.from("nonidentical-committed-conflict", "utf8");
    let challenged = false;
    leaseProcesses.onCommand = (_child, rawCommand) => {
      const parts = rawCommand.trimEnd().split("\t");
      if (challenged || parts[0] !== "resource-publish" || parts[2] !== base.committedPath) return;
      challenged = true;
      writeFileSync(base.committedPath, conflicting);
    };
    await expect(runSqliteG006bPreFinalization(base)).rejects.toMatchObject({
      code: "G006B_COMMITTED_UNVERIFIED_RECOVERY_REQUIRED",
      committed: true,
    });
    expect(challenged).toBe(true);
    expect(readFileSync(base.committedPath)).toEqual(conflicting);
    expect(existsSync(base.preparedPath)).toBe(true);
    expect(existsSync(base.backupPath)).toBe(true);
    expect(existsSync(base.archiveDirectory)).toBe(true);
    const reopened = new Database(fixture.databasePath, { readonly: true });
    expect(classifySqliteSchemaV1(reopened).kind).toBe("prepared-legacy");
    reopened.close();
    expect(temporaryResidue(fixture.root)).toEqual([]);
  }, 120_000);

  it.each(["backup", "archive-staging", "archive-child", "PREPARED", "COMMITTED"] as const)("broker parent EOF at %s removes exact sentinels and lock without deleting prior finals", async (phase) => {
    const fixture = createAcceptedFixture();
    const base = await operationInput(fixture);
    let sentinel = "";
    let triggered = false;
    leaseProcesses.onCommand = (child, rawCommand) => {
      const parts = rawCommand.trimEnd().split("\t");
      if (triggered || parts[0] !== "resource-write" || parts[2] !== "0") return;
      const candidate = parts[1] ?? "";
      const matches = phase === "backup" ? candidate.startsWith(`${base.backupPath}.g006b.tmp.`)
        : phase === "archive-staging" ? candidate.includes(`${basename(base.archiveDirectory)}.g006b.staging.`) && basename(candidate) === "admin_requests.json"
          : phase === "archive-child" ? dirname(candidate) === base.archiveDirectory && basename(candidate).startsWith("admin_requests.json.g006b.tmp.")
            : phase === "PREPARED" ? candidate.startsWith(`${base.preparedPath}.g006b.tmp.`)
              : candidate.startsWith(`${base.committedPath}.g006b.tmp.`);
      if (!matches) return;
      triggered = true;
      sentinel = candidate;
      setTimeout(() => child.stdin.end(), 0);
    };
    const expectedCode = phase === "COMMITTED"
      ? "G006B_COMMITTED_UNVERIFIED_RECOVERY_REQUIRED"
      : phase === "backup"
        ? "G006B_PUBLISH_FAILED"
        : "G006B_PUBLISHED_UNVERIFIED_RECOVERY_REQUIRED";
    await expect(runSqliteG006bPreFinalization(base)).rejects.toMatchObject({ code: expectedCode });
    expect(triggered).toBe(true);
    expect(existsSync(sentinel)).toBe(false);
    expect(existsSync(`${fixture.databasePath}.g006b.lock`)).toBe(false);
    expect(temporaryResidue(fixture.root)).toEqual([]);
    const db = new Database(fixture.databasePath, { readonly: true });
    expect(classifySqliteSchemaV1(db).kind).toBe(phase === "COMMITTED" ? "prepared-legacy" : "accepted-legacy");
    db.close();
    if (phase !== "backup") expect(existsSync(base.backupPath)).toBe(true);
    if (phase === "PREPARED" || phase === "COMMITTED") expect(existsSync(base.archiveDirectory)).toBe(true);
  }, 120_000);

  it("broker EOF cleans cleanup-owned children before parents, releases persistent resources, and removes its exact lock", async () => {
    const root = mkdtempSync(join(tmpdir(), "g006b-eof-ledger-"));
    roots.push(root);
    const broker = await startTestBroker(root);
    const cleanupDirectory = join(root, "cleanup-directory");
    const cleanupChild = join(cleanupDirectory, "child.tmp");
    const persistentDirectory = join(root, "persistent-directory");
    await broker.send(`resource-create-directory\t${cleanupDirectory}\tcleanup`); await broker.next();
    await broker.send(`resource-create-file\t${cleanupChild}\tcleanup`); await broker.next();
    await broker.write(cleanupChild, "eof-child-sentinel");
    await broker.send(`resource-create-directory\t${persistentDirectory}\trelease`); await broker.next();
    broker.child.stdin.end();
    expect(await broker.exit()).toBe(15);
    expect(existsSync(cleanupChild)).toBe(false);
    expect(existsSync(cleanupDirectory)).toBe(false);
    expect(existsSync(persistentDirectory)).toBe(true);
    expect(existsSync(join(root, "broker.db.g006b.lock"))).toBe(false);
  });

  it("enforces exact two-broker lock exclusion and removes only the first broker lock identity", async () => {
    const root = mkdtempSync(join(tmpdir(), "g006b-two-locks-"));
    roots.push(root);
    const databasePath = join(root, "shared.db");
    writeFileSync(databasePath, "shared-lock-database");
    const lockPath = `${databasePath}.g006b.lock`;
    const first = await startTestBroker(root, "shared");
    const secondChild = spawn(POWERSHELL, [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", PUBLISHER,
      "-Mode", "LeaseDatabase", "-Path", databasePath, "-LockPath", lockPath,
    ], { shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    expect(await new Promise<number | null>((resolveExit) => secondChild.once("exit", resolveExit))).toBe(16);
    expect(existsSync(lockPath)).toBe(false);
    await first.send("release"); expect(await first.next()).toMatchObject({ status: "lease-released" });
    first.child.stdin.end(); expect(await first.exit()).toBe(0);
    expect(existsSync(lockPath)).toBe(false);
  });

  it("delete-pends the lock before ready and a hard kill leaves no lock or process-held residue", async () => {
    const root = mkdtempSync(join(tmpdir(), "g006b-pre-ready-lock-"));
    roots.push(root);
    const databasePath = join(root, "wide.db");
    writeFileSync(databasePath, Buffer.alloc(0));
    truncateSync(databasePath, 512 * 1024 * 1024);
    const lockPath = `${databasePath}.g006b.lock`;
    const first = spawn(POWERSHELL, [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", PUBLISHER,
      "-Mode", "LeaseDatabase", "-Path", databasePath, "-LockPath", lockPath,
    ], { shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let firstStdout = "";
    first.stdout.setEncoding("utf8"); first.stdout.on("data", (chunk: string) => { firstStdout += chunk; });
    await new Promise((resolveWait) => setTimeout(resolveWait, 750));
    expect(first.exitCode).toBeNull();
    expect(firstStdout).toBe("");
    const second = spawn(POWERSHELL, [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", PUBLISHER,
      "-Mode", "LeaseDatabase", "-Path", databasePath, "-LockPath", lockPath,
    ], { shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    expect(await new Promise<number | null>((resolveExit) => second.once("exit", resolveExit))).toBe(16);
    first.kill();
    await new Promise<void>((resolveExit) => first.once("exit", () => resolveExit()));
    expect(existsSync(lockPath)).toBe(false);
    expect(readdirSync(root).sort()).toEqual(["wide.db"]);
  }, 30_000);

  it("InspectFile denies a 512MiB rename/replacement race and returns the exact occupant", async () => {
    const root = mkdtempSync(join(tmpdir(), "g006b-inspect-race-"));
    roots.push(root);
    const path = join(root, "large.bin");
    writeFileSync(path, "stable-occupant");
    truncateSync(path, 512 * 1024 * 1024);
    const baseline = statSync(path, { bigint: true });
    const beforeDescriptor = openSync(path, "r+"); closeSync(beforeDescriptor);
    const child = spawn(POWERSHELL, [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", PUBLISHER,
      "-Mode", "InspectFile", "-Path", path,
    ], { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout.setEncoding("utf8"); child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8"); child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    const readyDeadline = Date.now() + 5_000;
    let retained = false;
    while (!retained && child.exitCode === null && Date.now() < readyDeadline) {
      try { const descriptor = openSync(path, "r+"); closeSync(descriptor); }
      catch { retained = true; }
      if (!retained) await new Promise((resolveWait) => setTimeout(resolveWait, 10));
    }
    expect(retained).toBe(true);
    expect(child.exitCode).toBeNull();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect(() => renameSync(path, `${path}.attacker-${attempt}`)).toThrow();
      expect(() => writeFileSync(path, `replacement-${attempt}`)).toThrow();
    }
    expect(await new Promise<number | null>((resolveExit) => child.once("exit", resolveExit)), stderr).toBe(0);
    const afterDescriptor = openSync(path, "r+"); closeSync(afterDescriptor);
    const inspected = JSON.parse(stdout) as Record<string, unknown>;
    expect(inspected).toMatchObject({ status: "inspected", size: 512 * 1024 * 1024, finalPath: path });
    expect(statSync(path, { bigint: true }).ino).toBe(baseline.ino);
    const prefix = Buffer.alloc(15);
    const descriptor = openSync(path, "r");
    try { expect(readSync(descriptor, prefix, 0, prefix.length, 0)).toBe(prefix.length); } finally { closeSync(descriptor); }
    expect(prefix.toString("utf8")).toBe("stable-occupant");
    expect(readdirSync(root)).toEqual(["large.bin"]);
  }, 60_000);

  it("retains sidecar identities so disappearance and replacement are denied until post-settle release", async () => {
    const root = mkdtempSync(join(tmpdir(), "g006b-sidecar-retained-"));
    roots.push(root);
    const broker = await startTestBroker(root);
    const databasePath = join(root, "broker.db");
    const walPath = `${databasePath}-wal`;
    const shmPath = `${databasePath}-shm`;
    writeFileSync(walPath, Buffer.alloc(0));
    writeFileSync(shmPath, Buffer.alloc(0));
    await broker.send("settle"); expect(await broker.next()).toMatchObject({ status: "lease-settled" });
    await broker.send(`sidecars-capture\t${walPath}\t${shmPath}`); expect(await broker.next()).toMatchObject({ status: "sidecars-captured" });
    expect(() => renameSync(walPath, `${walPath}.replacement`)).toThrow();
    expect(() => rmSync(shmPath)).toThrow();
    await broker.send("sidecars-inspect"); expect(await broker.next()).toMatchObject({ status: "sidecars-inspected" });
    await broker.send("sidecars-release"); expect(await broker.next()).toMatchObject({ status: "sidecars-released" });
    await broker.send("release"); expect(await broker.next()).toMatchObject({ status: "lease-released" });
    broker.child.stdin.end(); expect(await broker.exit()).toBe(0);
  });

  it.each(["captured growth", "appearance after absent capture"] as const)("rejects WAL %s at the retained post-settle boundary", async (race) => {
    const root = mkdtempSync(join(tmpdir(), "g006b-sidecar-growth-"));
    roots.push(root);
    const broker = await startTestBroker(root);
    const databasePath = join(root, "broker.db");
    const walPath = `${databasePath}-wal`;
    const shmPath = `${databasePath}-shm`;
    if (race === "captured growth") {
      writeFileSync(walPath, Buffer.alloc(0));
      writeFileSync(shmPath, Buffer.alloc(0));
    }
    await broker.send("settle"); expect(await broker.next()).toMatchObject({ status: "lease-settled" });
    await broker.send(`sidecars-capture\t${walPath}\t${shmPath}`); expect(await broker.next()).toMatchObject({ status: "sidecars-captured" });
    writeFileSync(walPath, "concurrent-wal-growth");
    await broker.send("sidecars-inspect");
    expect(await broker.exit()).toBe(17);
    expect(readFileSync(walPath, "utf8")).toBe("concurrent-wal-growth");
    expect(existsSync(`${databasePath}.g006b.lock`)).toBe(false);
  });

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
      expect(await broker.write(temporary, bytes)).toMatchObject({ status: "resource-written", sha256: sha256(bytes) });
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
    const occupantPath = kind === "directory" ? join(path, "victim.txt") : path;
    const occupantIno = statSync(occupantPath, { bigint: true }).ino;
    const occupantBytes = readFileSync(occupantPath);
    const broker = await startTestBroker(root);
    await broker.send(`resource-create-${kind}\t${path}`);
    expect(await broker.exit()).toBe(12);
    expect(readFileSync(occupantPath)).toEqual(occupantBytes);
    expect(statSync(occupantPath, { bigint: true }).ino).toBe(occupantIno);
  });

  it("denies post-registration file/directory substitution and acts only on retained identities", async () => {
    const root = mkdtempSync(join(tmpdir(), "g006b-swap-ledger-"));
    roots.push(root);
    const broker = await startTestBroker(root);
    const destination = join(root, "published.json");
    const source = `${destination}.g006b.tmp.${randomBytes(24).toString("hex")}`;
    const detached = `${source}.detached`;
    await broker.send(`resource-create-file\t${source}`);
    await broker.next();
    await broker.write(source, "registered-file");
    expect(() => renameSync(source, detached)).toThrow();
    expect(() => writeFileSync(source, "replacement-file-occupant")).toThrow();
    await broker.send(`resource-publish\t${source}\t${destination}\t${sha256("registered-file")}\t15`);
    expect(await broker.next()).toMatchObject({ status: "publication-ready" });
    await broker.send("publication-inspect");
    await broker.next();
    await broker.send("publication-release");
    await broker.next();
    expect(readFileSync(destination, "utf8")).toBe("registered-file");
    expect(existsSync(source)).toBe(false);

    const directory = join(root, "registered-directory");
    const detachedDirectory = `${directory}.detached`;
    await broker.send(`resource-create-directory\t${directory}`);
    await broker.next();
    expect(() => renameSync(directory, detachedDirectory)).toThrow();
    await broker.send(`resource-cleanup\t${directory}`);
    expect(await broker.next()).toMatchObject({ status: "resource-cleanup" });
    expect(existsSync(directory)).toBe(false);
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
    await first.write(firstTemp, identicalBytes); await second.write(secondTemp, identicalBytes);
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
    await first.write(winnerTemp, "winner"); await loser.write(loserTemp, "loser");
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
    await broker.write(temporary, bytes);
    await broker.send(`resource-publish\t${temporary}\t${destination}\t${sha256(bytes)}\t${Buffer.byteLength(bytes)}`);
    expect(await broker.next()).toMatchObject({ status: "publication-ready" });
    broker.child.stdin.end();
    expect(await broker.exit()).toBe(14);
    expect(readFileSync(destination, "utf8")).toBe(bytes);
  });

  it.each(["EOF", "hard-death"] as const)("preserves every released final after %s later in the protocol", async (ending) => {
    const root = mkdtempSync(join(tmpdir(), "g006b-released-final-"));
    roots.push(root);
    const broker = await startTestBroker(root);
    const expected = new Map<string, { bytes: Buffer; ino: bigint }>();
    for (let index = 0; index < 3; index += 1) {
      const bytes = Buffer.from(`released-final-${index}`, "utf8");
      const destination = join(root, `final-${index}.json`);
      const temporary = `${destination}.g006b.tmp.${randomBytes(24).toString("hex")}`;
      await broker.send(`resource-create-file\t${temporary}`); await broker.next();
      await broker.write(temporary, bytes);
      await broker.send(`resource-publish\t${temporary}\t${destination}\t${createHash("sha256").update(bytes).digest("hex")}\t${String(bytes.length)}`);
      await broker.next();
      await broker.send("publication-inspect"); await broker.next();
      await broker.send("publication-release"); await broker.next();
      expected.set(destination, { bytes, ino: statSync(destination, { bigint: true }).ino });
    }
    if (ending === "EOF") broker.child.stdin.end();
    else broker.child.kill();
    expect(await broker.exit()).not.toBe(0);
    for (const [path, snapshot] of expected) {
      expect(readFileSync(path), path).toEqual(snapshot.bytes);
      expect(statSync(path, { bigint: true }).ino, path).toBe(snapshot.ino);
    }
    expect(existsSync(join(root, "broker.db.g006b.lock"))).toBe(false);
    expect(temporaryResidue(root)).toEqual([]);
  }, 30_000);

  it("reports a real cleanup identity failure and never deletes the replacement occupant", async () => {
    const root = mkdtempSync(join(tmpdir(), "g006b-identity-cleanup-"));
    roots.push(root);
    const broker = await startTestBroker(root);
    const owned = join(root, "owned.tmp");
    await broker.send(`resource-create-file\t${owned}`);
    const created = await broker.next();
    broker.child.kill();
    expect(await broker.exit()).not.toBe(0);
    rmSync(owned);
    writeFileSync(owned, "replacement-occupant");
    const cleanup = spawnSync(POWERSHELL, [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", PUBLISHER,
      "-Mode", "CleanupOwned", "-Path", owned, "-Kind", "file",
      "-ExpectedVolumeSerialNumber", String(created.volumeSerialNumber), "-ExpectedFileId", String(created.fileId),
    ], { encoding: "utf8", shell: false, windowsHide: true });
    expect(cleanup.status).toBe(11);
    expect(cleanup.stderr).toMatch(/identity (?:mismatch|drift)/iu);
    expect(readFileSync(owned, "utf8")).toBe("replacement-occupant");
  });
});
