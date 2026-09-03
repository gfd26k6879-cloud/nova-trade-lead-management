import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { HAS_G006B_WINDOWS_DURABILITY_CAPABILITY } from "./sqlite-windows-durability-capability";
import {
  SQLITE_SCHEMA_V1_PHYSICAL_MANIFEST_DIGEST,
  classifySqliteSchemaV1,
  createFreshSqliteSchemaV1,
} from "@/lib/db/sqlite-schema-coordinator";
import {
  SQLITE_SCHEMA_V1_APPLICATION_TABLE_COUNT,
  SQLITE_SCHEMA_V1_CATALOG_DIGEST,
  SQLITE_SCHEMA_V1_CATALOG_VERSION,
  SQLITE_SCHEMA_V1_FINAL_USER_VERSION,
  SQLITE_SCHEMA_V1_INTERNAL_CATALOG_DIGEST,
  SQLITE_SCHEMA_V1_STAGED_USER_VERSION,
} from "@/lib/db/sqlite-schema-v1";
import {
  provisionFreshSqliteCompatibilityScope,
  requireFreshSqliteCompatibilityScope,
  requireSqliteCompatibilityScope,
  verifyCompatibilityScope,
  SqliteCompatibilityScopeError,
  type SqliteCompatibilityBinding,
} from "@/lib/db/sqlite-compatibility-scope";
import {
  __testOnlySqliteFreshDatabaseBytes,
  computeSqliteFreshCanonicalBindingHash,
  computeSqliteFreshFoundationHash,
  computeSqliteFreshPlayBindingId,
  computeSqliteFreshPolicyHash,
  computeSqliteFreshSourceHash,
  createSqliteFreshCompatibilityTestBoundary,
  inspectSqliteFreshFileIdentity,
  SqliteFreshFoundationCommittedUnverifiedError,
  SqliteFreshFoundationError,
  SQLITE_FRESH_COMPATIBILITY_SOURCE_CARD_ID,
  type SqliteFreshCompatibilityTestFault,
  type SqliteFreshCompatibilityProvisionInput,
  type SqliteFreshFoundationInput,
  type SqliteFreshTenantPolicyRow,
} from "@/lib/db/sqlite-fresh-compatibility-scope";
import {
  LEGACY_WEBSITE_LEAD_PLAY_ID,
  LEGACY_WEBSITE_LEAD_PLAY_VERSION,
  createLegacyWebsiteLeadPlaySeed,
} from "@/lib/tenancy/compatibility-play";

const TENANT_ID = "00000000-0000-4000-8000-000000000201";
const WORKSPACE_ID = "10000000-0000-4000-8000-000000000201";
const OWNER_AUTH_ID = "20000000-0000-4000-8000-000000000201";
const MEMBERSHIP_ID = "30000000-0000-4000-8000-000000000201";
const ROLE_BINDING_ID = "40000000-0000-4000-8000-000000000201";
const POLICY_ID = "50000000-0000-4000-8000-000000000201";
const NOW = "2026-07-30T12:00:00.000Z";
const roots: string[] = [];
const children: ChildProcessWithoutNullStreams[] = [];

afterEach(() => {
  for (const child of children.splice(0)) child.kill();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

function emptyDatabasePath(): string {
  const root = mkdtempSync(join(tmpdir(), "g006c1-"));
  roots.push(root);
  const path = join(root, "fresh.sqlite");
  closeSync(openSync(path, "wx+"));
  return realpathSync.native(path);
}

function policy(): SqliteFreshTenantPolicyRow {
  return {
    id: POLICY_ID,
    tenantId: TENANT_ID,
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

function foundation(): SqliteFreshFoundationInput {
  const policyRow = policy();
  return {
    tenant: {
      id: TENANT_ID,
      slug: "test-tenant",
      name: "Test Tenant",
      status: "active",
      locale: "en-US",
      timezone: "America/Denver",
      createdAt: NOW,
      updatedAt: NOW,
    },
    workspace: {
      id: WORKSPACE_ID,
      tenantId: TENANT_ID,
      slug: "main-workspace",
      name: "Main Workspace",
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
    },
    ownerMembership: {
      id: MEMBERSHIP_ID,
      tenantId: TENANT_ID,
      authIdentityId: OWNER_AUTH_ID,
      pendingIdentityRefHash: null,
      workspaceId: WORKSPACE_ID,
      status: "active",
      invitedByMembershipId: null,
      createdAt: NOW,
      updatedAt: NOW,
    },
    ownerRoleBinding: {
      id: ROLE_BINDING_ID,
      tenantId: TENANT_ID,
      membershipId: MEMBERSHIP_ID,
      role: "owner",
      createdAt: NOW,
      validFrom: NOW,
      revokedAt: null,
      assignedByMembershipId: null,
      reasonCode: "initial_provisioning",
    },
    policy: policyRow,
    policyHash: computeSqliteFreshPolicyHash(policyRow),
  };
}

function makeInput(
  databasePath: string,
  journalMode: "delete" | "wal" = "delete",
): SqliteFreshCompatibilityProvisionInput {
  const foundationInput = foundation();
  const seed = createLegacyWebsiteLeadPlaySeed();
  const playBindingId = computeSqliteFreshPlayBindingId({
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    sourceCardId: SQLITE_FRESH_COMPATIBILITY_SOURCE_CARD_ID,
    playId: LEGACY_WEBSITE_LEAD_PLAY_ID,
    playVersion: LEGACY_WEBSITE_LEAD_PLAY_VERSION,
    configurationHash: seed.configurationHash,
  });
  const fileIdentity = inspectSqliteFreshFileIdentity(databasePath);
  const foundationHash = computeSqliteFreshFoundationHash(foundationInput);
  const sourceHash = computeSqliteFreshSourceHash({ cardId: SQLITE_FRESH_COMPATIBILITY_SOURCE_CARD_ID });
  const bindingHash = computeSqliteFreshCanonicalBindingHash({
    databasePath,
    fileIdentity,
    journalMode,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    ownerAuthIdentityId: OWNER_AUTH_ID,
    policyHash: foundationInput.policyHash,
    sourceCardId: SQLITE_FRESH_COMPATIBILITY_SOURCE_CARD_ID,
    sourceHash,
    playBindingId,
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
    expectedJournalMode: journalMode,
    foundation: foundationInput,
    source: { cardId: SQLITE_FRESH_COMPATIBILITY_SOURCE_CARD_ID, sourceHash },
    play: {
      seed,
      playId: LEGACY_WEBSITE_LEAD_PLAY_ID,
      playVersion: LEGACY_WEBSITE_LEAD_PLAY_VERSION,
      configurationHash: seed.configurationHash,
      bindingId: playBindingId,
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
    expectedCanonicalBindingHash: bindingHash,
  };
}

function mutableInput(databasePath: string): Record<string, unknown> {
  return structuredClone(makeInput(databasePath)) as unknown as Record<string, unknown>;
}

function differentFoundationInput(databasePath: string): SqliteFreshCompatibilityProvisionInput {
  const input = structuredClone(makeInput(databasePath)) as SqliteFreshCompatibilityProvisionInput;
  (input.foundation.tenant as { name: string }).name = "Competing Tenant Definition";
  (input as { expectedFoundationHash: string }).expectedFoundationHash = computeSqliteFreshFoundationHash(input.foundation);
  (input as { expectedCanonicalBindingHash: string }).expectedCanonicalBindingHash = computeSqliteFreshCanonicalBindingHash({
    databasePath,
    fileIdentity: input.expectedFileIdentity,
    journalMode: input.expectedJournalMode,
    tenantId: input.foundation.tenant.id,
    workspaceId: input.foundation.workspace.id,
    ownerAuthIdentityId: input.foundation.ownerMembership.authIdentityId,
    policyHash: input.foundation.policyHash,
    sourceCardId: input.source.cardId,
    sourceHash: input.source.sourceHash,
    playBindingId: input.play.bindingId,
    playConfigurationHash: input.play.configurationHash,
    catalogVersion: input.catalog.catalogVersion,
    userVersion: input.catalog.userVersion,
    catalogDigest: input.catalog.catalogDigest,
    internalCatalogDigest: input.catalog.internalCatalogDigest,
    physicalManifestDigest: input.catalog.physicalManifestDigest,
    foundationHash: input.expectedFoundationHash,
  });
  return input;
}

interface CreatorOutcome {
  readonly variant: "canonical" | "different";
  readonly ok: boolean;
  readonly status?: "provisioned" | "replayed";
  readonly code?: string;
  readonly cleanupEvidence?: readonly string[];
}

function spawnCreator(
  databasePath: string,
  outputPath: string,
  variant: CreatorOutcome["variant"],
  fault: SqliteFreshCompatibilityTestFault = "hold-before-commit",
  signalPath?: string,
): Promise<CreatorOutcome> {
  const vitestCli = join(process.cwd(), "node_modules", "vitest", "vitest.mjs");
  const child = spawn(process.execPath, [
    vitestCli,
    "run",
    "src/lib/__tests__/sqlite-fresh-compatibility-scope.test.ts",
    "-t",
    "G006C1 subprocess creator worker",
    "--reporter=dot",
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      G006C1_CREATOR_DATABASE_PATH: databasePath,
      G006C1_CREATOR_OUTPUT_PATH: outputPath,
      G006C1_CREATOR_VARIANT: variant,
      G006C1_CREATOR_FAULT: fault,
      ...(signalPath ? { G006C1_CREATOR_SIGNAL_PATH: signalPath } : {}),
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  children.push(child);
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
  return new Promise<CreatorOutcome>((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => {
      child.kill();
      rejectPromise(new Error(`creator timeout: ${stderr}`));
    }, 20_000);
    child.once("error", (error) => {
      clearTimeout(timer);
      rejectPromise(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      const index = children.indexOf(child);
      if (index >= 0) children.splice(index, 1);
      if (code !== 0) {
        rejectPromise(new Error(`creator exit ${String(code)}: ${stderr}`));
        return;
      }
      resolvePromise(JSON.parse(readFileSync(outputPath, "utf8")) as CreatorOutcome);
    });
  });
}

interface MutatorOutcome {
  readonly ok: boolean;
  readonly elapsedMs: number;
  readonly code?: string;
}

function spawnMarketMutation(databasePath: string, marketId: string): Promise<MutatorOutcome> {
  const script = `const Database=require('better-sqlite3');const started=Date.now();let db;try{db=new Database(process.argv[1],{fileMustExist:true,timeout:5000});db.prepare('INSERT INTO location_markets (id, name, country_code, admin_area1) VALUES (?, ?, ?, ?)').run(process.argv[2],'External','US','CO');process.stdout.write(JSON.stringify({ok:true,elapsedMs:Date.now()-started}));}catch(error){process.stdout.write(JSON.stringify({ok:false,elapsedMs:Date.now()-started,code:String(error&&error.code||'UNKNOWN')}));process.exitCode=1;}finally{if(db&&db.open)db.close();}`;
  const child = spawn(process.execPath, ["-e", script, databasePath, marketId], {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "pipe"],
  });
  children.push(child);
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
  child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
  return new Promise<MutatorOutcome>((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => {
      child.kill();
      rejectPromise(new Error(`mutator timeout: ${stderr}`));
    }, 10_000);
    child.once("error", (error) => {
      clearTimeout(timer);
      rejectPromise(error);
    });
    child.once("exit", () => {
      clearTimeout(timer);
      const index = children.indexOf(child);
      if (index >= 0) children.splice(index, 1);
      if (!stdout) {
        rejectPromise(new Error(`mutator produced no outcome: ${stderr}`));
        return;
      }
      resolvePromise(JSON.parse(stdout) as MutatorOutcome);
    });
  });
}

async function waitForFile(path: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (!existsSync(path)) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${basename(path)}`);
    await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 20));
  }
}

function state(databasePath: string): ReturnType<typeof classifySqliteSchemaV1> {
  const db = new Database(databasePath, { fileMustExist: true });
  try {
    return classifySqliteSchemaV1(db);
  } finally {
    db.close();
  }
}

async function expectFreshInputRejected(value: unknown): Promise<void> {
  await expect(provisionFreshSqliteCompatibilityScope(value as SqliteFreshCompatibilityProvisionInput))
    .rejects.toMatchObject({ code: "G006C0_INPUT_REJECTED" });
}

async function provision(databasePath: string): Promise<SqliteCompatibilityBinding> {
  return provisionFreshSqliteCompatibilityScope(makeInput(databasePath));
}

describe("G006C1 fresh SQLite compatibility foundation", () => {
  // Path-replacement detection assumes the OS will not hand a recreated file
  // the deleted file's identity (accepted Windows/NTFS boundary; Linux ext4 or
  // overlay filesystems may reuse the inode), so it is capability-gated like
  // the other native file-identity cases.
  const windowsFileIdentityIt = HAS_G006B_WINDOWS_DURABILITY_CAPABILITY ? it : it.skip;

  it.skipIf(process.env.G006C1_CREATOR_DATABASE_PATH === undefined)("G006C1 subprocess creator worker", async () => {
    const databasePath = process.env.G006C1_CREATOR_DATABASE_PATH;
    const outputPath = process.env.G006C1_CREATOR_OUTPUT_PATH;
    const variant = process.env.G006C1_CREATOR_VARIANT;
    const fault = process.env.G006C1_CREATOR_FAULT ?? "hold-before-commit";
    const signalPath = process.env.G006C1_CREATOR_SIGNAL_PATH;
    const allowedFaults: readonly string[] = [
      "hold-before-commit",
      "hold-before-final-lease",
      "hold-after-mint",
    ];
    if (!databasePath || !outputPath || (variant !== "canonical" && variant !== "different")
        || !allowedFaults.includes(fault)) {
      throw new Error("invalid subprocess creator environment");
    }
    const input = variant === "canonical" ? makeInput(databasePath) : differentFoundationInput(databasePath);
    const boundary = createSqliteFreshCompatibilityTestBoundary(fault as SqliteFreshCompatibilityTestFault, signalPath);
    try {
      const binding = await provisionFreshSqliteCompatibilityScope(input, boundary);
      const scope = requireFreshSqliteCompatibilityScope(binding, {
        databasePath,
        tenantId: TENANT_ID,
        workspaceId: WORKSPACE_ID,
      });
      writeFileSync(outputPath, JSON.stringify({ variant, ok: true, status: scope.provisioningStatus } satisfies CreatorOutcome));
    } catch (error) {
      const code = error !== null && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : "UNKNOWN";
      const cleanupEvidence = error !== null && typeof error === "object" && "cleanupEvidence" in error
        && Array.isArray((error as { cleanupEvidence: unknown }).cleanupEvidence)
        ? (error as { cleanupEvidence: readonly string[] }).cleanupEvidence
        : undefined;
      writeFileSync(outputPath, JSON.stringify({ variant, ok: false, code, cleanupEvidence } satisfies CreatorOutcome));
    }
  });

  it("provisions the exact staged schema and exactly five foundation rows", async () => {
    const path = emptyDatabasePath();
    await provision(path);
    const db = new Database(path, { readonly: true, fileMustExist: true });
    try {
      expect(classifySqliteSchemaV1(db).kind).toBe("staged");
      const counts = db.prepare(`SELECT
        (SELECT count(*) FROM tenants) AS tenants,
        (SELECT count(*) FROM workspaces) AS workspaces,
        (SELECT count(*) FROM tenant_memberships) AS memberships,
        (SELECT count(*) FROM tenant_role_bindings) AS roles,
        (SELECT count(*) FROM tenant_policies) AS policies,
        (SELECT count(*) FROM compatibility_backfill_receipts) AS receipts,
        (SELECT count(*) FROM location_markets) AS markets,
        (SELECT count(*) FROM settings) AS settings`).get();
      expect(counts).toEqual({ tenants: 1, workspaces: 1, memberships: 1, roles: 1, policies: 1, receipts: 0, markets: 0, settings: 0 });
    } finally {
      db.close();
    }
  });

  it("mints a fresh fieldless capability with storage-only evidence", async () => {
    const path = emptyDatabasePath();
    const binding = await provision(path);
    expect(Reflect.ownKeys(binding as object)).toEqual([]);
    const scope = requireFreshSqliteCompatibilityScope(binding, { databasePath: path, tenantId: TENANT_ID, workspaceId: WORKSPACE_ID });
    expect(scope).toMatchObject({
      backend: "sqlite",
      lifecycle: "fresh",
      provisioningStatus: "provisioned",
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      ownerAuthIdentityId: OWNER_AUTH_ID,
      authority: "storage-scope-only",
      grantsAuthentication: false,
      grantsAuthorization: false,
      grantsProviderExecution: false,
      userVersion: 6001,
      applicationTableCount: 37,
    });
    expect(scope).not.toHaveProperty("databasePath");
    expect(scope).not.toHaveProperty("receipt");
    expect(scope).not.toHaveProperty("session");
    expect(scope).not.toHaveProperty("permission");
  });

  it("replays an identical staged foundation without database-byte mutation", async () => {
    const path = emptyDatabasePath();
    await provision(path);
    const before = __testOnlySqliteFreshDatabaseBytes(path);
    const binding = await provision(path);
    const after = __testOnlySqliteFreshDatabaseBytes(path);
    expect(after).toBe(before);
    expect(requireFreshSqliteCompatibilityScope(binding, { databasePath: path, tenantId: TENANT_ID, workspaceId: WORKSPACE_ID }).provisioningStatus).toBe("replayed");
  });

  it("preserves the original typed fresh rejection on verifyCompatibilityScope", async () => {
    await expect(verifyCompatibilityScope({ backend: "sqlite", lifecycle: "fresh" })).rejects.toMatchObject({
      code: "G006C0_FRESH_FOUNDATION_REQUIRED",
      detail: "C1 must explicitly provision and verify the named fresh foundation",
    });
  });

  it("preserves PostgreSQL as an exact no-op scope", async () => {
    await expect(verifyCompatibilityScope({ backend: "postgresql" })).resolves.toEqual({ backend: "postgresql" });
  });

  it("keeps fresh and upgraded capability stores disjoint", async () => {
    const path = emptyDatabasePath();
    const binding = await provision(path);
    expect(() => requireSqliteCompatibilityScope(binding, { databasePath: path, tenantId: TENANT_ID, workspaceId: WORKSPACE_ID }))
      .toThrowError(expect.objectContaining({ code: "G006C0_CAPABILITY_REQUIRED" }));
  });

  it("rejects forged and copied fresh capabilities", async () => {
    const path = emptyDatabasePath();
    const binding = await provision(path);
    for (const candidate of [{}, Object.create(null), { ...(binding as object) }]) {
      expect(() => requireFreshSqliteCompatibilityScope(candidate as SqliteCompatibilityBinding, {
        databasePath: path, tenantId: TENANT_ID, workspaceId: WORKSPACE_ID,
      })).toThrowError(expect.objectContaining({ code: "G006C0_CAPABILITY_REQUIRED" }));
    }
  });

  it("rejects an exact capability under a different path selector", async () => {
    const path = emptyDatabasePath();
    const binding = await provision(path);
    expect(() => requireFreshSqliteCompatibilityScope(binding, {
      databasePath: `${path}.other`, tenantId: TENANT_ID, workspaceId: WORKSPACE_ID,
    })).toThrowError(expect.objectContaining({ code: "G006C0_SCOPE_MISMATCH" }));
  });

  it("rejects an exact capability under a different tenant or workspace selector", async () => {
    const path = emptyDatabasePath();
    const binding = await provision(path);
    expect(() => requireFreshSqliteCompatibilityScope(binding, {
      databasePath: path, tenantId: TENANT_ID.replace("0201", "0202"), workspaceId: WORKSPACE_ID,
    })).toThrowError(expect.objectContaining({ code: "G006C0_SCOPE_MISMATCH" }));
  });

  it("rejects an outer accessor before touching the database", async () => {
    const path = emptyDatabasePath();
    const input = mutableInput(path);
    Object.defineProperty(input, "databasePath", { get: () => path, enumerable: true });
    await expectFreshInputRejected(input);
    expect(state(path).kind).toBe("fresh");
  });

  it("rejects a deep accessor before touching the database", async () => {
    const path = emptyDatabasePath();
    const input = mutableInput(path);
    const foundationInput = input.foundation as Record<string, unknown>;
    const tenant = foundationInput.tenant as Record<string, unknown>;
    Object.defineProperty(tenant, "name", { get: () => "Trap", enumerable: true });
    await expectFreshInputRejected(input);
    expect(state(path).kind).toBe("fresh");
  });

  it("rejects proxies before touching the database", async () => {
    const path = emptyDatabasePath();
    const input = new Proxy(mutableInput(path), {});
    await expectFreshInputRejected(input);
    expect(state(path).kind).toBe("fresh");
  });

  it("rejects symbol keys before touching the database", async () => {
    const path = emptyDatabasePath();
    const input = mutableInput(path);
    Object.defineProperty(input, Symbol("hidden"), { value: true, enumerable: true });
    await expectFreshInputRejected(input);
    expect(state(path).kind).toBe("fresh");
  });

  it("rejects extra outer fields", async () => {
    const path = emptyDatabasePath();
    const input = mutableInput(path);
    input.receipt = "not-authority";
    await expectFreshInputRejected(input);
    expect(state(path).kind).toBe("fresh");
  });

  it("rejects missing deep persisted facts", async () => {
    const path = emptyDatabasePath();
    const input = mutableInput(path);
    delete ((input.foundation as Record<string, unknown>).policy as Record<string, unknown>).requireOutreachReview;
    await expectFreshInputRejected(input);
    expect(state(path).kind).toBe("fresh");
  });

  it("rejects a noncanonical path alias", async () => {
    const path = emptyDatabasePath();
    const input = makeInput(path);
    const databasePath = `${dirname(path)}\\.\\${basename(path)}`;
    const aliased = { ...input, databasePath };
    aliased.expectedCanonicalBindingHash = computeSqliteFreshCanonicalBindingHash({
      databasePath,
      fileIdentity: aliased.expectedFileIdentity,
      journalMode: aliased.expectedJournalMode,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      ownerAuthIdentityId: OWNER_AUTH_ID,
      policyHash: aliased.foundation.policyHash,
      sourceCardId: aliased.source.cardId,
      sourceHash: aliased.source.sourceHash,
      playBindingId: aliased.play.bindingId,
      playConfigurationHash: aliased.play.configurationHash,
      catalogVersion: aliased.catalog.catalogVersion,
      userVersion: aliased.catalog.userVersion,
      catalogDigest: aliased.catalog.catalogDigest,
      internalCatalogDigest: aliased.catalog.internalCatalogDigest,
      physicalManifestDigest: aliased.catalog.physicalManifestDigest,
      foundationHash: aliased.expectedFoundationHash,
    });
    await expect(provisionFreshSqliteCompatibilityScope(aliased)).rejects.toMatchObject({ code: "G006C1_PATH_REJECTED" });
    expect(state(path).kind).toBe("fresh");
  });

  it("rejects a mismatched retained file identity", async () => {
    const path = emptyDatabasePath();
    const input = makeInput(path);
    const invalid = { ...input, expectedFileIdentity: { ...input.expectedFileIdentity, fileId: "0" } };
    invalid.expectedCanonicalBindingHash = computeSqliteFreshCanonicalBindingHash({
      databasePath: path,
      fileIdentity: invalid.expectedFileIdentity,
      journalMode: invalid.expectedJournalMode,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      ownerAuthIdentityId: OWNER_AUTH_ID,
      policyHash: invalid.foundation.policyHash,
      sourceCardId: invalid.source.cardId,
      sourceHash: invalid.source.sourceHash,
      playBindingId: invalid.play.bindingId,
      playConfigurationHash: invalid.play.configurationHash,
      catalogVersion: invalid.catalog.catalogVersion,
      userVersion: invalid.catalog.userVersion,
      catalogDigest: invalid.catalog.catalogDigest,
      internalCatalogDigest: invalid.catalog.internalCatalogDigest,
      physicalManifestDigest: invalid.catalog.physicalManifestDigest,
      foundationHash: invalid.expectedFoundationHash,
    });
    await expect(provisionFreshSqliteCompatibilityScope(invalid)).rejects.toMatchObject({ code: "G006C1_FILE_IDENTITY_MISMATCH" });
    expect(state(path).kind).toBe("fresh");
  });

  windowsFileIdentityIt("rejects path replacement against the caller-pinned FileId before mutation", async () => {
    const path = emptyDatabasePath();
    const input = makeInput(path);
    rmSync(path);
    closeSync(openSync(path, "wx+"));
    await expect(provisionFreshSqliteCompatibilityScope(input)).rejects.toMatchObject({ code: "G006C1_FILE_IDENTITY_MISMATCH" });
    expect(state(path).kind).toBe("fresh");
  });

  it("rejects a journal-mode mismatch without changing the empty catalog", async () => {
    const path = emptyDatabasePath();
    const input = makeInput(path);
    const rebound = { ...input, expectedJournalMode: "wal" as const };
    rebound.expectedCanonicalBindingHash = computeSqliteFreshCanonicalBindingHash({
      databasePath: path,
      fileIdentity: rebound.expectedFileIdentity,
      journalMode: "wal",
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      ownerAuthIdentityId: OWNER_AUTH_ID,
      policyHash: rebound.foundation.policyHash,
      sourceCardId: rebound.source.cardId,
      sourceHash: rebound.source.sourceHash,
      playBindingId: rebound.play.bindingId,
      playConfigurationHash: rebound.play.configurationHash,
      catalogVersion: rebound.catalog.catalogVersion,
      userVersion: rebound.catalog.userVersion,
      catalogDigest: rebound.catalog.catalogDigest,
      internalCatalogDigest: rebound.catalog.internalCatalogDigest,
      physicalManifestDigest: rebound.catalog.physicalManifestDigest,
      foundationHash: rebound.expectedFoundationHash,
    });
    await expect(provisionFreshSqliteCompatibilityScope(rebound)).rejects.toMatchObject({ code: "G006C1_JOURNAL_MODE_MISMATCH" });
    expect(state(path).kind).toBe("fresh");
  });

  it("provisions and independently verifies an explicitly pinned WAL foundation", async () => {
    const path = emptyDatabasePath();
    const setup = new Database(path);
    expect(setup.pragma("journal_mode = WAL", { simple: true })).toBe("wal");
    setup.close();
    const binding = await provisionFreshSqliteCompatibilityScope(makeInput(path, "wal"));
    expect(requireFreshSqliteCompatibilityScope(binding, {
      databasePath: path, tenantId: TENANT_ID, workspaceId: WORKSPACE_ID,
    }).journalMode).toBe("wal");
    expect(state(path).kind).toBe("staged");
    expect(existsSync(`${path}-wal`)).toBe(false);
    expect(existsSync(`${path}-shm`)).toBe(false);
  });

  it("rejects non-plain deep records before loading SQLite", async () => {
    const path = emptyDatabasePath();
    const input = mutableInput(path);
    Object.setPrototypeOf((input.foundation as Record<string, unknown>).tenant, { inherited: true });
    await expectFreshInputRejected(input);
    expect(state(path).kind).toBe("fresh");
  });

  it("rejects an incorrect policy hash", async () => {
    const path = emptyDatabasePath();
    const input = mutableInput(path);
    (input.foundation as Record<string, unknown>).policyHash = "a".repeat(64);
    await expect(provisionFreshSqliteCompatibilityScope(input as unknown as SqliteFreshCompatibilityProvisionInput)).rejects.toMatchObject({ code: "G006C1_INPUT_REJECTED" });
    expect(state(path).kind).toBe("fresh");
  });

  it("rejects an incorrect foundation hash", async () => {
    const path = emptyDatabasePath();
    const input = { ...makeInput(path), expectedFoundationHash: "a".repeat(64) };
    await expect(provisionFreshSqliteCompatibilityScope(input)).rejects.toMatchObject({ code: "G006C1_INPUT_REJECTED" });
    expect(state(path).kind).toBe("fresh");
  });

  it("rejects an incorrect canonical binding hash", async () => {
    const path = emptyDatabasePath();
    const input = { ...makeInput(path), expectedCanonicalBindingHash: "a".repeat(64) };
    await expect(provisionFreshSqliteCompatibilityScope(input)).rejects.toMatchObject({ code: "G006C1_INPUT_REJECTED" });
    expect(state(path).kind).toBe("fresh");
  });

  it("rejects a source alias", async () => {
    const path = emptyDatabasePath();
    const input = mutableInput(path);
    (input.source as Record<string, unknown>).cardId = "google_places";
    await expect(provisionFreshSqliteCompatibilityScope(input as unknown as SqliteFreshCompatibilityProvisionInput)).rejects.toMatchObject({ code: "G006C1_INPUT_REJECTED" });
    expect(state(path).kind).toBe("fresh");
  });

  it("rejects an augmented play seed", async () => {
    const path = emptyDatabasePath();
    const input = mutableInput(path);
    ((input.play as Record<string, unknown>).seed as Record<string, unknown>).extra = true;
    await expect(provisionFreshSqliteCompatibilityScope(input as unknown as SqliteFreshCompatibilityProvisionInput)).rejects.toMatchObject({ code: "G006C1_INPUT_REJECTED" });
    expect(state(path).kind).toBe("fresh");
  });

  it("rejects a mismatched play configuration hash", async () => {
    const path = emptyDatabasePath();
    const input = mutableInput(path);
    (input.play as Record<string, unknown>).configurationHash = "a".repeat(64);
    await expect(provisionFreshSqliteCompatibilityScope(input as unknown as SqliteFreshCompatibilityProvisionInput)).rejects.toMatchObject({ code: "G006C1_INPUT_REJECTED" });
    expect(state(path).kind).toBe("fresh");
  });

  it("rejects a mismatched play binding", async () => {
    const path = emptyDatabasePath();
    const input = mutableInput(path);
    (input.play as Record<string, unknown>).bindingId = "a".repeat(64);
    await expect(provisionFreshSqliteCompatibilityScope(input as unknown as SqliteFreshCompatibilityProvisionInput)).rejects.toMatchObject({ code: "G006C1_INPUT_REJECTED" });
    expect(state(path).kind).toBe("fresh");
  });

  it("rejects final user_version 6002 as a catalog pin", async () => {
    const path = emptyDatabasePath();
    const input = mutableInput(path);
    (input.catalog as Record<string, unknown>).userVersion = SQLITE_SCHEMA_V1_FINAL_USER_VERSION;
    await expect(provisionFreshSqliteCompatibilityScope(input as unknown as SqliteFreshCompatibilityProvisionInput)).rejects.toMatchObject({ code: "G006C1_INPUT_REJECTED" });
    expect(state(path).kind).toBe("fresh");
  });

  it("rejects an already-finalized database unchanged", async () => {
    const path = emptyDatabasePath();
    await provision(path);
    const db = new Database(path);
    db.pragma(`user_version = ${SQLITE_SCHEMA_V1_FINAL_USER_VERSION}`);
    db.close();
    const before = __testOnlySqliteFreshDatabaseBytes(path);
    await expect(provisionFreshSqliteCompatibilityScope(makeInput(path))).rejects.toMatchObject({ code: "G006C1_STATE_REJECTED" });
    expect(__testOnlySqliteFreshDatabaseBytes(path)).toBe(before);
  });

  it("rejects a partial catalog unchanged", async () => {
    const path = emptyDatabasePath();
    const db = new Database(path);
    db.exec("CREATE TABLE tenants(id TEXT PRIMARY KEY)");
    db.close();
    const before = __testOnlySqliteFreshDatabaseBytes(path);
    await expect(provisionFreshSqliteCompatibilityScope(makeInput(path))).rejects.toMatchObject({ code: "G006C1_STATE_REJECTED" });
    expect(__testOnlySqliteFreshDatabaseBytes(path)).toBe(before);
  });

  it("rejects extra application rows in a staged database unchanged", async () => {
    const path = emptyDatabasePath();
    await provision(path);
    const db = new Database(path);
    db.prepare("INSERT INTO location_markets (id, name, country_code, admin_area1) VALUES (?, ?, ?, ?)")
      .run("market-extra", "Extra", "US", "CO");
    db.close();
    const before = __testOnlySqliteFreshDatabaseBytes(path);
    await expect(provisionFreshSqliteCompatibilityScope(makeInput(path))).rejects.toMatchObject({ code: "G006C1_FOUNDATION_MISMATCH" });
    expect(__testOnlySqliteFreshDatabaseBytes(path)).toBe(before);
  });

  it("rejects different foundation rows in a staged database unchanged", async () => {
    const path = emptyDatabasePath();
    await provision(path);
    const input = makeInput(path);
    const changed = structuredClone(input) as SqliteFreshCompatibilityProvisionInput;
    (changed.foundation.tenant as { name: string }).name = "Different Tenant";
    (changed.foundation as { policyHash: string }).policyHash = computeSqliteFreshPolicyHash(changed.foundation.policy);
    (changed as { expectedFoundationHash: string }).expectedFoundationHash = computeSqliteFreshFoundationHash(changed.foundation);
    (changed as { expectedCanonicalBindingHash: string }).expectedCanonicalBindingHash = computeSqliteFreshCanonicalBindingHash({
      databasePath: path,
      fileIdentity: changed.expectedFileIdentity,
      journalMode: changed.expectedJournalMode,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      ownerAuthIdentityId: OWNER_AUTH_ID,
      policyHash: changed.foundation.policyHash,
      sourceCardId: changed.source.cardId,
      sourceHash: changed.source.sourceHash,
      playBindingId: changed.play.bindingId,
      playConfigurationHash: changed.play.configurationHash,
      catalogVersion: changed.catalog.catalogVersion,
      userVersion: changed.catalog.userVersion,
      catalogDigest: changed.catalog.catalogDigest,
      internalCatalogDigest: changed.catalog.internalCatalogDigest,
      physicalManifestDigest: changed.catalog.physicalManifestDigest,
      foundationHash: changed.expectedFoundationHash,
    });
    const before = __testOnlySqliteFreshDatabaseBytes(path);
    await expect(provisionFreshSqliteCompatibilityScope(changed)).rejects.toMatchObject({ code: "G006C1_FOUNDATION_MISMATCH" });
    expect(__testOnlySqliteFreshDatabaseBytes(path)).toBe(before);
  });

  it("rolls back both schema and rows on a precommit failure and retains the caller file", async () => {
    const path = emptyDatabasePath();
    const boundary = createSqliteFreshCompatibilityTestBoundary("fail-before-commit");
    await expect(provisionFreshSqliteCompatibilityScope(makeInput(path), boundary)).rejects.toBeInstanceOf(SqliteFreshFoundationError);
    expect(existsSync(path)).toBe(true);
    expect(state(path).kind).toBe("fresh");
  });

  it("preserves deterministic primary and cleanup evidence on precommit failure", async () => {
    const path = emptyDatabasePath();
    const boundary = createSqliteFreshCompatibilityTestBoundary("fail-before-commit-with-cleanup-evidence");
    const error = await provisionFreshSqliteCompatibilityScope(makeInput(path), boundary).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(SqliteFreshFoundationError);
    expect(error).toMatchObject({ code: "G006C1_STATE_REJECTED" });
    expect((error as SqliteFreshFoundationError).detail).toContain("simulated precommit failure");
    expect((error as SqliteFreshFoundationError).cleanupEvidence).toEqual(["writer rollback: simulated cleanup evidence"]);
    expect(state(path).kind).toBe("fresh");
  });

  it.each([
    "fail-after-commit",
    "fail-verifier-open",
    "fail-verifier-proof",
    "fail-writer-close",
    "fail-verifier-close",
    "fail-root-close",
  ] as const)("reports %s as committed-unverified recovery-required", async (fault) => {
    const path = emptyDatabasePath();
    const boundary = createSqliteFreshCompatibilityTestBoundary(fault);
    const error = await provisionFreshSqliteCompatibilityScope(makeInput(path), boundary).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(SqliteFreshFoundationCommittedUnverifiedError);
    expect(error).toMatchObject({ code: "G006C1_COMMITTED_UNVERIFIED", committed: true, recoveryRequired: true });
    expect((error as SqliteFreshFoundationCommittedUnverifiedError).primaryEvidence).toContain("simulated");
    if (fault === "fail-root-close") {
      expect((error as SqliteFreshFoundationCommittedUnverifiedError).cleanupEvidence)
        .toEqual(["fresh binding revocation: deleted"]);
    } else {
      expect((error as SqliteFreshFoundationCommittedUnverifiedError).cleanupEvidence)
        .not.toContain("fresh binding revocation: deleted");
    }
    expect(state(path).kind).toBe("staged");
  });

  it("revokes the minted fieldless capability on a post-mint failure before lease release", async () => {
    const path = emptyDatabasePath();
    const boundary = createSqliteFreshCompatibilityTestBoundary("fail-after-mint-before-lease-release");
    const error = await provisionFreshSqliteCompatibilityScope(makeInput(path), boundary).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(SqliteFreshFoundationCommittedUnverifiedError);
    expect(error).toMatchObject({ code: "G006C1_COMMITTED_UNVERIFIED", committed: true, recoveryRequired: true });
    expect((error as SqliteFreshFoundationCommittedUnverifiedError).primaryEvidence)
      .toContain("simulated post-mint pre-release failure");
    expect((error as SqliteFreshFoundationCommittedUnverifiedError).cleanupEvidence)
      .toEqual(["fresh binding revocation: deleted"]);
    expect(state(path).kind).toBe("staged");
    await expect(provision(path)).resolves.toBeDefined();
  });

  it("rejects an arbitrary test-boundary object before provisioning", async () => {
    const path = emptyDatabasePath();
    await expect(provisionFreshSqliteCompatibilityScope(makeInput(path), {} as never)).rejects.toMatchObject({
      code: "G006C1_INPUT_REJECTED",
    });
    expect(state(path).kind).toBe("fresh");
  });

  it("uses the detached pre-import snapshot when the caller mutates its object", async () => {
    const path = emptyDatabasePath();
    const input = mutableInput(path) as unknown as SqliteFreshCompatibilityProvisionInput;
    const pending = provisionFreshSqliteCompatibilityScope(input);
    (input.foundation.tenant as { name: string }).name = "Mutated After Call";
    const binding = await pending;
    const scope = requireFreshSqliteCompatibilityScope(binding, { databasePath: path, tenantId: TENANT_ID, workspaceId: WORKSPACE_ID });
    expect(scope.foundationHash).toBe(makeInput(path).expectedFoundationHash);
    const db = new Database(path, { readonly: true });
    expect((db.prepare("SELECT name FROM tenants").get() as { name: string }).name).toBe("Test Tenant");
    db.close();
  });

  it("fails closed while another SQLite creator holds the immediate writer lock, then succeeds after release", async () => {
    const path = emptyDatabasePath();
    const script = `const Database=require('better-sqlite3');const db=new Database(process.argv[1]);db.exec('BEGIN IMMEDIATE');process.stdout.write('LOCKED\\n');setTimeout(()=>{db.exec('ROLLBACK');db.close();},2500);`;
    const child = spawn(process.execPath, ["-e", script, path], { cwd: process.cwd(), stdio: ["pipe", "pipe", "pipe"] });
    children.push(child);
    await new Promise<void>((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => rejectPromise(new Error("lock holder timeout")), 2_000);
      child.stdout.once("data", () => { clearTimeout(timer); resolvePromise(); });
      child.once("error", rejectPromise);
    });
    await expect(provisionFreshSqliteCompatibilityScope(makeInput(path))).rejects.toMatchObject({ code: "G006C1_STATE_REJECTED" });
    expect(state(path).kind).toBe("fresh");
    await new Promise<void>((resolvePromise) => child.once("exit", () => resolvePromise()));
    children.splice(children.indexOf(child), 1);
    await expect(provision(path)).resolves.toBeDefined();
    expect(state(path).kind).toBe("staged");
  }, 10_000);

  it("rejects a process mutation that wins after readonly proof but before the final lease", async () => {
    const path = emptyDatabasePath();
    const root = dirname(path);
    const signalPath = join(root, "before-final-lease.signal");
    const creator = spawnCreator(
      path,
      join(root, "before-final-lease.json"),
      "canonical",
      "hold-before-final-lease",
      signalPath,
    );
    await waitForFile(signalPath);
    const mutation = await spawnMarketMutation(path, "market-before-final-lease");
    expect(mutation.ok).toBe(true);
    const outcome = await creator;
    expect(outcome).toMatchObject({ ok: false, code: "G006C1_COMMITTED_UNVERIFIED" });
    expect(outcome.cleanupEvidence ?? []).not.toContain("fresh binding revocation: deleted");
    const db = new Database(path, { readonly: true, fileMustExist: true });
    try {
      expect((db.prepare("SELECT count(*) AS count FROM location_markets").get() as { count: number }).count).toBe(1);
    } finally {
      db.close();
    }
  }, 30_000);

  it("holds a process mutation until after successful mint and final lease release", async () => {
    const path = emptyDatabasePath();
    const root = dirname(path);
    const signalPath = join(root, "after-mint.signal");
    const creator = spawnCreator(
      path,
      join(root, "after-mint.json"),
      "canonical",
      "hold-after-mint",
      signalPath,
    );
    await waitForFile(signalPath);
    let mutationSettled = false;
    const mutationPending = spawnMarketMutation(path, "market-after-mint").then((outcome) => {
      mutationSettled = true;
      return outcome;
    });
    await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 200));
    expect(mutationSettled).toBe(false);
    const [creatorOutcome, mutationOutcome] = await Promise.all([creator, mutationPending]);
    expect(creatorOutcome).toMatchObject({ ok: true, status: "provisioned" });
    expect(mutationOutcome.ok).toBe(true);
    expect(mutationOutcome.elapsedMs).toBeGreaterThanOrEqual(500);
    const db = new Database(path, { readonly: true, fileMustExist: true });
    try {
      expect((db.prepare("SELECT count(*) AS count FROM location_markets").get() as { count: number }).count).toBe(1);
    } finally {
      db.close();
    }
  }, 30_000);

  it("serializes simultaneous same-input API creators into one provision and one replay", async () => {
    const path = emptyDatabasePath();
    const root = dirname(path);
    const [left, right] = await Promise.all([
      spawnCreator(path, join(root, "same-left.json"), "canonical"),
      spawnCreator(path, join(root, "same-right.json"), "canonical"),
    ]);
    expect([left, right].map((outcome) => outcome.ok)).toEqual([true, true]);
    expect([left.status, right.status].sort()).toEqual(["provisioned", "replayed"]);
    expect(state(path).kind).toBe("staged");
  }, 30_000);

  it("serializes simultaneous different-input API creators to one intact winner and one exact rejection", async () => {
    const path = emptyDatabasePath();
    const root = dirname(path);
    const outcomes = await Promise.all([
      spawnCreator(path, join(root, "different-canonical.json"), "canonical"),
      spawnCreator(path, join(root, "different-competitor.json"), "different"),
    ]);
    const winner = outcomes.find((outcome) => outcome.ok);
    const loser = outcomes.find((outcome) => !outcome.ok);
    expect(winner?.status).toBe("provisioned");
    expect(loser?.code).toBe("G006C1_FOUNDATION_MISMATCH");
    const beforeReplay = __testOnlySqliteFreshDatabaseBytes(path);
    const winningInput = winner?.variant === "different" ? differentFoundationInput(path) : makeInput(path);
    const binding = await provisionFreshSqliteCompatibilityScope(winningInput);
    expect(requireFreshSqliteCompatibilityScope(binding, {
      databasePath: path, tenantId: TENANT_ID, workspaceId: WORKSPACE_ID,
    }).provisioningStatus).toBe("replayed");
    expect(__testOnlySqliteFreshDatabaseBytes(path)).toBe(beforeReplay);
  }, 30_000);

  it("keeps only the canonical fixed source and accepted play as evidence without persisting source or play rows", async () => {
    const path = emptyDatabasePath();
    const binding = await provision(path);
    const scope = requireFreshSqliteCompatibilityScope(binding, { databasePath: path, tenantId: TENANT_ID, workspaceId: WORKSPACE_ID });
    expect(scope.sourceCardId).toBe("google_places_legacy");
    expect(scope.playId).toBe(LEGACY_WEBSITE_LEAD_PLAY_ID);
    expect(scope.playVersion).toBe(LEGACY_WEBSITE_LEAD_PLAY_VERSION);
    const db = new Database(path, { readonly: true });
    try {
      expect((db.prepare("SELECT count(*) AS count FROM places_master").get() as { count: number }).count).toBe(0);
      expect((db.prepare("SELECT count(*) AS count FROM compatibility_backfill_receipts").get() as { count: number }).count).toBe(0);
    } finally {
      db.close();
    }
  });

  it("returns typed scope mismatch errors without exposing stored evidence", async () => {
    const path = emptyDatabasePath();
    const binding = await provision(path);
    let error: unknown;
    try {
      requireFreshSqliteCompatibilityScope(binding, { databasePath: path, tenantId: TENANT_ID, workspaceId: "wrong" });
    } catch (value) {
      error = value;
    }
    expect(error).toBeInstanceOf(SqliteCompatibilityScopeError);
    expect(error).toMatchObject({ code: "G006C0_SCOPE_MISMATCH", detail: "" });
    expect(error).not.toHaveProperty("scope");
  });

  it("rejects a staged schema with no foundation rows without populating it", async () => {
    const path = emptyDatabasePath();
    const db = new Database(path);
    createFreshSqliteSchemaV1(db);
    db.close();
    const before = __testOnlySqliteFreshDatabaseBytes(path);
    await expect(provisionFreshSqliteCompatibilityScope(makeInput(path))).rejects.toMatchObject({ code: "G006C1_FOUNDATION_MISMATCH" });
    expect(__testOnlySqliteFreshDatabaseBytes(path)).toBe(before);
    const check = new Database(path, { readonly: true });
    expect((check.prepare("SELECT count(*) AS count FROM tenants").get() as { count: number }).count).toBe(0);
    check.close();
  });

  it("does not delete or replace the caller-owned file on validation failure", async () => {
    const path = emptyDatabasePath();
    writeFileSync(path, "caller-owned-invalid-content");
    const originalIdentity = inspectSqliteFreshFileIdentity(path);
    const input = makeInput(path);
    await expect(provisionFreshSqliteCompatibilityScope(input)).rejects.toBeDefined();
    expect(existsSync(path)).toBe(true);
    expect(inspectSqliteFreshFileIdentity(path)).toEqual(originalIdentity);
  });
});
