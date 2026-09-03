import { readFileSync } from "node:fs";
import { join } from "node:path";

import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createSqliteG002StorageOperationPermit,
  requireSqliteG002StorageOperationPermit,
  type SqliteG002StorageOperation,
  type SqliteG002StorageOperationExpectation,
  type SqliteG002StorageOperationPermitInput,
} from "@/lib/db/sqlite-g002-operation-permit";
import {
  cleanupSqliteG002OperationFixture,
  createFreshSqliteG002OperationFixture,
  createUpgradedSqliteG002OperationFixture,
  type SqliteG002OperationFixture,
} from "./sqlite-g002-operation-fixtures";
import { HAS_G006B_WINDOWS_DURABILITY_CAPABILITY } from "./sqlite-windows-durability-capability";

const OPERATIONS = Object.freeze([
  "user_market_access",
  "crawl_runs",
  "crawl_units",
] as const satisfies readonly SqliteG002StorageOperation[]);

let fresh: SqliteG002OperationFixture;
let upgraded: SqliteG002OperationFixture;
let freshCleanupRef: SqliteG002OperationFixture | undefined;

beforeAll(async () => {
  fresh = await createFreshSqliteG002OperationFixture();
  freshCleanupRef = fresh;
}, 120_000);

afterAll(() => {
  const ownedFresh = freshCleanupRef;
  freshCleanupRef = undefined;
  if (ownedFresh) cleanupSqliteG002OperationFixture(ownedFresh);
});

function permitInput(
  target: SqliteG002OperationFixture,
  operation: SqliteG002StorageOperation = "user_market_access",
  operationWorkspaceId: string | null = target.storageWorkspaceId,
): SqliteG002StorageOperationPermitInput {
  return {
    lifecycle: target.lifecycle,
    binding: target.binding,
    databasePath: target.databasePath,
    tenantId: target.tenantId,
    storageWorkspaceId: target.storageWorkspaceId,
    operationWorkspaceId,
    operation,
  };
}

function expectation(
  target: SqliteG002OperationFixture,
  operation: SqliteG002StorageOperation = "user_market_access",
  operationWorkspaceId: string | null = target.storageWorkspaceId,
): SqliteG002StorageOperationExpectation {
  return {
    lifecycle: target.lifecycle,
    databasePath: target.databasePath,
    tenantId: target.tenantId,
    storageWorkspaceId: target.storageWorkspaceId,
    operationWorkspaceId,
    operation,
  };
}

function tableSnapshot(databasePath: string): Readonly<Record<string, string>> {
  const db = new Database(databasePath, { fileMustExist: true, readonly: true });
  try {
    return Object.freeze(Object.fromEntries(OPERATIONS.map((table) => [
      table,
      JSON.stringify(db.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all()),
    ])));
  } finally {
    db.close();
  }
}

function expectCode(action: () => unknown, code: string): void {
  expect(action).toThrow(expect.objectContaining({ code }));
}

describe("G006C2A SQLite G002 storage-operation permit", () => {
  for (const operation of OPERATIONS) {
    it(`consumes one fresh named-workspace ${operation} permit`, () => {
      const permit = createSqliteG002StorageOperationPermit(permitInput(fresh, operation));
      expect(requireSqliteG002StorageOperationPermit(permit, expectation(fresh, operation)))
        .toMatchObject({ lifecycle: "fresh", operation, operationWorkspaceId: fresh.storageWorkspaceId });
    });

    it(`consumes one fresh explicit tenant-wide ${operation} permit`, () => {
      const permit = createSqliteG002StorageOperationPermit(permitInput(fresh, operation, null));
      expect(requireSqliteG002StorageOperationPermit(permit, expectation(fresh, operation, null)))
        .toMatchObject({ lifecycle: "fresh", operation, operationWorkspaceId: null });
    });
  }

  it("returns exact deeply frozen plain storage evidence with literal false grants", () => {
    const permit = createSqliteG002StorageOperationPermit(permitInput(fresh, "crawl_runs", null));
    const evidence = requireSqliteG002StorageOperationPermit(permit, expectation(fresh, "crawl_runs", null));
    expect(Object.getPrototypeOf(evidence)).toBe(Object.prototype);
    expect(Object.isFrozen(evidence)).toBe(true);
    expect(Reflect.ownKeys(evidence)).toEqual([
      "backend",
      "lifecycle",
      "databasePath",
      "tenantId",
      "storageWorkspaceId",
      "operationWorkspaceId",
      "operation",
      "authority",
      "grantsAuthentication",
      "grantsAuthorization",
      "grantsWorkerExecution",
      "grantsProviderExecution",
    ]);
    expect(evidence).toEqual({
      backend: "sqlite",
      lifecycle: "fresh",
      databasePath: fresh.databasePath,
      tenantId: fresh.tenantId,
      storageWorkspaceId: fresh.storageWorkspaceId,
      operationWorkspaceId: null,
      operation: "crawl_runs",
      authority: "storage-operation-scope-only",
      grantsAuthentication: false,
      grantsAuthorization: false,
      grantsWorkerExecution: false,
      grantsProviderExecution: false,
    });
    for (const value of Object.values(evidence)) {
      expect(value === null || typeof value !== "object" || Object.isFrozen(value)).toBe(true);
    }
  });

  it("mints a frozen fieldless null-prototype permit", () => {
    const permit = createSqliteG002StorageOperationPermit(permitInput(fresh));
    expect(Object.getPrototypeOf(permit)).toBeNull();
    expect(Reflect.ownKeys(permit)).toEqual([]);
    expect(Object.isFrozen(permit)).toBe(true);
    requireSqliteG002StorageOperationPermit(permit, expectation(fresh));
  });

  it("does not mutate the fresh database or any G002 table", () => {
    const bytesBefore = readFileSync(fresh.databasePath);
    const rowsBefore = tableSnapshot(fresh.databasePath);
    const permit = createSqliteG002StorageOperationPermit(permitInput(fresh, "crawl_units", null));
    requireSqliteG002StorageOperationPermit(permit, expectation(fresh, "crawl_units", null));
    expect(tableSnapshot(fresh.databasePath)).toEqual(rowsBefore);
    expect(readFileSync(fresh.databasePath)).toEqual(bytesBefore);
  }, 15_000);

  it("rejects a fresh binding declared as upgraded", () => {
    expectCode(() => createSqliteG002StorageOperationPermit({
      ...permitInput(fresh),
      lifecycle: "upgraded",
    }), "G006C2A_STORAGE_SCOPE_MISMATCH");
  });

  it("rejects a genuine binding against another database", () => {
    expectCode(() => createSqliteG002StorageOperationPermit({
      ...permitInput(fresh),
      databasePath: join(fresh.root, "different.sqlite"),
    }), "G006C2A_STORAGE_SCOPE_MISMATCH");
  });

  it("rejects a genuine binding against another tenant", () => {
    expectCode(() => createSqliteG002StorageOperationPermit({
      ...permitInput(fresh),
      tenantId: "00000000-0000-4000-8000-0000000002c1",
    }), "G006C2A_STORAGE_SCOPE_MISMATCH");
  });

  it("rejects a genuine binding against another storage workspace", () => {
    expectCode(() => createSqliteG002StorageOperationPermit({
      ...permitInput(fresh),
      storageWorkspaceId: "10000000-0000-4000-8000-0000000002c1",
      operationWorkspaceId: "10000000-0000-4000-8000-0000000002c1",
    }), "G006C2A_STORAGE_SCOPE_MISMATCH");
  });

  it("rejects a non-null operation workspace different from storage scope", () => {
    expectCode(() => createSqliteG002StorageOperationPermit({
      ...permitInput(fresh),
      operationWorkspaceId: "10000000-0000-4000-8000-0000000002c1",
    }), "G006C2A_STORAGE_SCOPE_MISMATCH");
  });

  it("rejects omitted and undefined operation workspace selectors", () => {
    const input = permitInput(fresh) as unknown as Record<string, unknown>;
    delete input.operationWorkspaceId;
    expectCode(
      () => createSqliteG002StorageOperationPermit(input as unknown as SqliteG002StorageOperationPermitInput),
      "G006C2A_INPUT_REJECTED",
    );
    input.operationWorkspaceId = undefined;
    expectCode(
      () => createSqliteG002StorageOperationPermit(input as unknown as SqliteG002StorageOperationPermitInput),
      "G006C2A_INPUT_REJECTED",
    );
  });

  it("rejects an operation outside the fixed G002 vocabulary", () => {
    expectCode(() => createSqliteG002StorageOperationPermit({
      ...permitInput(fresh),
      operation: "zip_codes",
    } as unknown as SqliteG002StorageOperationPermitInput), "G006C2A_INPUT_REJECTED");
  });

  it("rejects extra and symbol input keys", () => {
    expectCode(() => createSqliteG002StorageOperationPermit({
      ...permitInput(fresh),
      source: "caller",
    } as unknown as SqliteG002StorageOperationPermitInput), "G006C2A_INPUT_REJECTED");
    const symbolInput = permitInput(fresh) as unknown as Record<PropertyKey, unknown>;
    symbolInput[Symbol("authority")] = true;
    expectCode(
      () => createSqliteG002StorageOperationPermit(symbolInput as unknown as SqliteG002StorageOperationPermitInput),
      "G006C2A_INPUT_REJECTED",
    );
  });

  it("rejects an input accessor without invoking it", () => {
    let calls = 0;
    const input = permitInput(fresh) as unknown as Record<string, unknown>;
    Object.defineProperty(input, "tenantId", {
      enumerable: true,
      get: () => {
        calls += 1;
        return fresh.tenantId;
      },
    });
    expectCode(
      () => createSqliteG002StorageOperationPermit(input as unknown as SqliteG002StorageOperationPermitInput),
      "G006C2A_INPUT_REJECTED",
    );
    expect(calls).toBe(0);
  });

  it("rejects proxy, inherited, and null-prototype inputs", () => {
    expectCode(
      () => createSqliteG002StorageOperationPermit(new Proxy(permitInput(fresh), {})),
      "G006C2A_INPUT_REJECTED",
    );
    expectCode(
      () => createSqliteG002StorageOperationPermit(Object.create(permitInput(fresh)) as SqliteG002StorageOperationPermitInput),
      "G006C2A_INPUT_REJECTED",
    );
    expectCode(
      () => createSqliteG002StorageOperationPermit(Object.assign(Object.create(null), permitInput(fresh))),
      "G006C2A_INPUT_REJECTED",
    );
  });

  it("rejects forged, copied, spread, and proxied storage bindings", () => {
    const candidates = [
      Object.freeze(Object.create(null)),
      Object.assign(Object.create(null), fresh.binding),
      { ...fresh.binding },
      new Proxy(fresh.binding, {}),
    ];
    for (const binding of candidates) {
      expectCode(() => createSqliteG002StorageOperationPermit({
        ...permitInput(fresh),
        binding,
      } as SqliteG002StorageOperationPermitInput), "G006C2A_STORAGE_SCOPE_MISMATCH");
    }
  });

  it("rejects fabricated, copied, spread, proxied, and prototype-derived permits", () => {
    const genuine = createSqliteG002StorageOperationPermit(permitInput(fresh));
    const candidates = [
      Object.freeze(Object.create(null)),
      Object.assign(Object.create(null), genuine),
      { ...genuine },
      new Proxy(genuine, {}),
      Object.create(genuine),
    ];
    for (const candidate of candidates) {
      expectCode(
        () => requireSqliteG002StorageOperationPermit(candidate, expectation(fresh)),
        "G006C2A_PERMIT_REQUIRED",
      );
    }
    requireSqliteG002StorageOperationPermit(genuine, expectation(fresh));
  });

  it("burns a permit after a database mismatch", () => {
    const permit = createSqliteG002StorageOperationPermit(permitInput(fresh));
    expectCode(() => requireSqliteG002StorageOperationPermit(permit, {
      ...expectation(fresh),
      databasePath: join(fresh.root, "different.sqlite"),
    }), "G006C2A_PERMIT_MISMATCH");
    expectCode(
      () => requireSqliteG002StorageOperationPermit(permit, expectation(fresh)),
      "G006C2A_PERMIT_REQUIRED",
    );
  });

  it("burns a permit after an operation mismatch", () => {
    const permit = createSqliteG002StorageOperationPermit(permitInput(fresh, "crawl_runs"));
    expectCode(
      () => requireSqliteG002StorageOperationPermit(permit, expectation(fresh, "crawl_units")),
      "G006C2A_PERMIT_MISMATCH",
    );
    expectCode(
      () => requireSqliteG002StorageOperationPermit(permit, expectation(fresh, "crawl_runs")),
      "G006C2A_PERMIT_REQUIRED",
    );
  });

  it("burns a permit before hostile expectation validation", () => {
    const permit = createSqliteG002StorageOperationPermit(permitInput(fresh));
    let calls = 0;
    const hostile = expectation(fresh) as unknown as Record<string, unknown>;
    Object.defineProperty(hostile, "tenantId", {
      enumerable: true,
      get: () => {
        calls += 1;
        return fresh.tenantId;
      },
    });
    expectCode(
      () => requireSqliteG002StorageOperationPermit(
        permit,
        hostile as unknown as SqliteG002StorageOperationExpectation,
      ),
      "G006C2A_INPUT_REJECTED",
    );
    expect(calls).toBe(0);
    expectCode(
      () => requireSqliteG002StorageOperationPermit(permit, expectation(fresh)),
      "G006C2A_PERMIT_REQUIRED",
    );
  });

  it("rejects expectation proxies, symbols, extras, and inherited records terminally", () => {
    const hostileExpectations = [
      new Proxy(expectation(fresh), {}),
      Object.assign(expectation(fresh) as unknown as Record<PropertyKey, unknown>, { extra: true }),
      Object.assign(expectation(fresh) as unknown as Record<PropertyKey, unknown>, { [Symbol("actor")]: true }),
      Object.create(expectation(fresh)),
    ];
    for (const hostile of hostileExpectations) {
      const permit = createSqliteG002StorageOperationPermit(permitInput(fresh));
      expectCode(
        () => requireSqliteG002StorageOperationPermit(
          permit,
          hostile as SqliteG002StorageOperationExpectation,
        ),
        "G006C2A_INPUT_REJECTED",
      );
      expectCode(
        () => requireSqliteG002StorageOperationPermit(permit, expectation(fresh)),
        "G006C2A_PERMIT_REQUIRED",
      );
    }
  });

  it("rejects replay after successful consumption", () => {
    const permit = createSqliteG002StorageOperationPermit(permitInput(fresh, "crawl_units", null));
    requireSqliteG002StorageOperationPermit(permit, expectation(fresh, "crawl_units", null));
    expectCode(
      () => requireSqliteG002StorageOperationPermit(permit, expectation(fresh, "crawl_units", null)),
      "G006C2A_PERMIT_REQUIRED",
    );
  });

  it("snapshots selectors before caller mutation", () => {
    const input = permitInput(fresh, "crawl_runs", null) as unknown as Record<string, unknown>;
    const permit = createSqliteG002StorageOperationPermit(input as unknown as SqliteG002StorageOperationPermitInput);
    input.lifecycle = "upgraded";
    input.databasePath = join(fresh.root, "different.sqlite");
    input.tenantId = "00000000-0000-4000-8000-0000000002c1";
    input.storageWorkspaceId = "10000000-0000-4000-8000-0000000002c1";
    input.operationWorkspaceId = "10000000-0000-4000-8000-0000000002c1";
    input.operation = "crawl_units";
    expect(requireSqliteG002StorageOperationPermit(permit, expectation(fresh, "crawl_runs", null)))
      .toMatchObject({ lifecycle: "fresh", operation: "crawl_runs", operationWorkspaceId: null });
  });

  it("has no authority import, SQL mutation, database handle, barrel export, or runtime caller wiring", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/db/sqlite-g002-operation-permit.ts"),
      "utf8",
    );
    const moduleSpecifiers = [...source.matchAll(/from "([^"]+)"/g)].map((match) => match[1]);
    expect(moduleSpecifiers).toEqual(["node:util/types", "./sqlite-compatibility-scope"]);
    expect(source).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\s+/i);
    expect(source).not.toContain("better-sqlite3");
    expect(source).not.toContain("getDb");
    expect(source).not.toContain("requireTenantPermission");
    expect(source).not.toContain("requireWorkerTenantContext");

    const barrel = readFileSync(join(process.cwd(), "src/lib/db/index.ts"), "utf8");
    expect(barrel).not.toContain("sqlite-g002-operation-permit");
  });

  describe.skipIf(!HAS_G006B_WINDOWS_DURABILITY_CAPABILITY)("upgraded G006B-backed lifecycle", () => {
    let upgradedCleanupRef: SqliteG002OperationFixture | undefined;

    beforeAll(async () => {
      upgraded = await createUpgradedSqliteG002OperationFixture();
      upgradedCleanupRef = upgraded;
    }, 120_000);

    afterAll(() => {
      const ownedUpgraded = upgradedCleanupRef;
      upgradedCleanupRef = undefined;
      if (ownedUpgraded) cleanupSqliteG002OperationFixture(ownedUpgraded);
    });

    for (const operation of OPERATIONS) {
      it(`consumes one upgraded named-workspace ${operation} permit`, () => {
        const permit = createSqliteG002StorageOperationPermit(permitInput(upgraded, operation));
        expect(requireSqliteG002StorageOperationPermit(permit, expectation(upgraded, operation)))
          .toMatchObject({ lifecycle: "upgraded", operation, operationWorkspaceId: upgraded.storageWorkspaceId });
      });

      it(`consumes one upgraded explicit tenant-wide ${operation} permit`, () => {
        const permit = createSqliteG002StorageOperationPermit(permitInput(upgraded, operation, null));
        expect(requireSqliteG002StorageOperationPermit(permit, expectation(upgraded, operation, null)))
          .toMatchObject({ lifecycle: "upgraded", operation, operationWorkspaceId: null });
      });
    }

    it("does not mutate the upgraded database or any G002 table", () => {
      const bytesBefore = readFileSync(upgraded.databasePath);
      const rowsBefore = tableSnapshot(upgraded.databasePath);
      const permit = createSqliteG002StorageOperationPermit(permitInput(upgraded, "crawl_units", null));
      requireSqliteG002StorageOperationPermit(permit, expectation(upgraded, "crawl_units", null));
      expect(tableSnapshot(upgraded.databasePath)).toEqual(rowsBefore);
      expect(readFileSync(upgraded.databasePath)).toEqual(bytesBefore);
    }, 15_000);

    it("rejects an upgraded binding declared as fresh", () => {
      expectCode(() => createSqliteG002StorageOperationPermit({
        ...permitInput(upgraded),
        lifecycle: "fresh",
      }), "G006C2A_STORAGE_SCOPE_MISMATCH");
    });

    it("rejects a genuine binding combined with the other fixture selectors", () => {
      expectCode(() => createSqliteG002StorageOperationPermit({
        ...permitInput(upgraded),
        lifecycle: "fresh",
        binding: fresh.binding,
      }), "G006C2A_STORAGE_SCOPE_MISMATCH");
    });
  });
});
