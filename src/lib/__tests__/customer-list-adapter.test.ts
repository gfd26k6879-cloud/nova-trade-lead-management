import { describe, expect, it, vi } from "vitest";

import { evaluateConnectorAdapterFixture } from "@/lib/connectors/adapter-contract";
import {
  createCustomerListFixtureAdapter,
  type ApprovedCustomerListTableSnapshot,
  type CustomerListPageRequest,
} from "@/lib/connectors/customer-list-adapter";

const DOCUMENT_ID = "00000000-0000-4000-8000-000000000201";
const DOCUMENT_VERSION_ID = "00000000-0000-4000-8000-000000000202";

function snapshot(
  overrides: Partial<ApprovedCustomerListTableSnapshot> = {},
): ApprovedCustomerListTableSnapshot {
  return {
    schemaVersion: 1,
    approvalState: "approved",
    tenantId: "tenant-a",
    workspaceId: "workspace-a",
    documentId: DOCUMENT_ID,
    documentVersionId: DOCUMENT_VERSION_ID,
    snapshotVersion: "approved-table-v3",
    sheet: "Customers",
    headerRow: 1,
    columns: ["Company", "URL", "Sector", "Approved tag", "Ignored private cell"],
    rows: [
      ["  Alpha   Co  ", "https://alpha.example", " Manufacturing ", "priority", "never-return-this-a"],
      ["Beta LLC", "http://beta.example/path", "Distribution", "", "never-return-this-b"],
      ["Gamma GmbH", "", "Coatings", "existing", "never-return-this-c"],
    ],
    permittedPurposes: ["account_identity", "dedupe"],
    ...overrides,
  };
}

const CONFIG = {
  schemaVersion: 1,
  columns: {
    accountName: "Company",
    website: "URL",
    industry: "Sector",
    tag: "Approved tag",
  },
  maxPageSize: 2,
} as const;

function pageRequest(overrides: Partial<CustomerListPageRequest> = {}): CustomerListPageRequest {
  return {
    version: 1,
    runId: "run-customer-list-a",
    authorizedTenantId: "tenant-a",
    authorizedWorkspaceId: "workspace-a",
    tenantId: "tenant-a",
    workspaceId: "workspace-a",
    documentId: DOCUMENT_ID,
    documentVersionId: DOCUMENT_VERSION_ID,
    snapshotVersion: "approved-table-v3",
    permittedPurpose: "account_identity",
    operation: "normalize",
    cursor: null,
    pageSize: 2,
    observedAt: "2026-08-29T18:00:00.000Z",
    ...overrides,
  };
}

function readyAdapter(source: ApprovedCustomerListTableSnapshot = snapshot()) {
  const result = createCustomerListFixtureAdapter(source, CONFIG);
  expect(result).toMatchObject({ ok: true, code: "D015_PASS" });
  if (!result.ok) throw new Error("expected a ready customer-list fixture adapter");
  return result.adapter;
}

describe("customer-list fixture adapter", () => {
  it("normalizes only configured columns into deterministic cited observation pages", async () => {
    const source = snapshot();
    const adapter = readyAdapter(source);

    // The adapter owns an immutable snapshot rather than retaining caller-mutable rows.
    (source.rows[0] as string[])[0] = "mutated after adapter creation";

    const first = await adapter.readPage(pageRequest());
    expect(first).toMatchObject({
      ok: true,
      code: "D015_PASS",
      status: "page_complete",
      complete: false,
      usage: { providerRequests: 0, providerUnits: 0, providerCostMicros: 0 },
      binding: {
        tenantId: "tenant-a",
        workspaceId: "workspace-a",
        documentId: DOCUMENT_ID,
        documentVersionId: DOCUMENT_VERSION_ID,
        snapshotVersion: "approved-table-v3",
        permittedPurpose: "account_identity",
      },
    });
    if (!first.ok) return;

    expect(first.observations).toHaveLength(2);
    expect(first.observations[0]).toMatchObject({
      recordType: "source_observation",
      canonicalAccount: false,
      origin: "tenant_upload",
      suppliedBy: "customer_provided",
      observation: {
        sourceCardId: "customer_list_csv_upload",
        operation: "normalize",
        tenantId: "tenant-a",
        runId: "run-customer-list-a",
        observedAt: "2026-08-29T18:00:00.000Z",
        fields: {
          account_name: "Alpha Co",
          website: "https://alpha.example/",
          industry: "Manufacturing",
          tenant_id: "tenant-a",
          tag: "priority",
        },
      },
      provenance: {
        row: { kind: "row", sheet: "Customers", row: 2 },
        cells: {
          account_name: { kind: "cell", sheet: "Customers", row: 2, column: "A", header: "Company" },
          website: { kind: "cell", sheet: "Customers", row: 2, column: "B", header: "URL" },
          industry: { kind: "cell", sheet: "Customers", row: 2, column: "C", header: "Sector" },
          tag: { kind: "cell", sheet: "Customers", row: 2, column: "D", header: "Approved tag" },
        },
      },
    });
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(JSON.stringify(first)).not.toContain("never-return-this");
    expect(first).not.toHaveProperty("accounts");
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.observations[0].provenance.cells)).toBe(true);
    for (const item of first.observations) {
      expect(evaluateConnectorAdapterFixture(adapter.descriptor, item.observation, {
        tenantId: "tenant-a",
      })).toMatchObject({ decision: "allow", code: "D015_PASS" });
    }

    const replay = await adapter.readPage(pageRequest());
    expect(replay).toEqual(first);

    const second = await adapter.readPage(pageRequest({ cursor: first.nextCursor }));
    expect(second).toMatchObject({
      ok: true,
      status: "complete",
      complete: true,
      nextCursor: null,
      observations: [{
        observation: { fields: { account_name: "Gamma GmbH", industry: "Coatings", tenant_id: "tenant-a", tag: "existing" } },
        provenance: { row: { row: 4 } },
      }],
    });
  });

  it.each([
    ["authorized tenant", { authorizedTenantId: "tenant-b" }, "tenant_scope_mismatch"],
    ["tenant", { tenantId: "tenant-b" }, "tenant_scope_mismatch"],
    ["authorized workspace", { authorizedWorkspaceId: "workspace-b" }, "workspace_scope_mismatch"],
    ["workspace", { workspaceId: "workspace-b" }, "workspace_scope_mismatch"],
    ["document", { documentId: "00000000-0000-4000-8000-000000000299" }, "document_binding_mismatch"],
    ["document version", { documentVersionId: "00000000-0000-4000-8000-000000000299" }, "document_binding_mismatch"],
    ["snapshot version", { snapshotVersion: "stale-table-v2" }, "document_binding_mismatch"],
  ] as const)("blocks a mismatched %s binding without observations", async (_label, overrides, reason) => {
    const result = await readyAdapter().readPage(pageRequest(overrides));

    expect(result).toEqual({
      ok: false,
      status: "blocked",
      code: "D015_SOURCE_POLICY_FAIL",
      reason,
      issues: [],
    });
    expect(result).not.toHaveProperty("observations");
  });

  it("requires an explicitly approved purpose on every page", async () => {
    const adapter = readyAdapter();

    await expect(adapter.readPage(pageRequest({ permittedPurpose: "historical_outcome_learning" })))
      .resolves.toMatchObject({
        ok: false,
        status: "blocked",
        code: "D015_SOURCE_POLICY_FAIL",
        reason: "purpose_not_permitted",
      });
    const missingPurpose = { ...pageRequest() } as Record<string, unknown>;
    delete missingPurpose.permittedPurpose;
    await expect(adapter.readPage(missingPurpose)).resolves.toMatchObject({
      ok: false,
      status: "blocked",
      code: "D015_MALFORMED",
      reason: "malformed_request",
    });
  });

  it("routes missing, duplicate, and malformed columns to review without reading rows", () => {
    let rowReads = 0;
    const rows = [["Alpha", "https://alpha.example", "Manufacturing", "priority", "ignored"]];
    Object.defineProperty(rows[0], "0", {
      enumerable: true,
      get() {
        rowReads += 1;
        return "Alpha";
      },
    });

    expect(createCustomerListFixtureAdapter(snapshot({ columns: ["Company", "Sector"], rows: [] }), CONFIG))
      .toMatchObject({
        ok: false,
        status: "review_required",
        code: "D015_REVIEW_REQUIRED",
        reason: "missing_column",
      });
    expect(createCustomerListFixtureAdapter(snapshot({
      columns: ["Company", "URL", "Sector", "Company", "Ignored private cell"],
      rows: [],
    }), CONFIG)).toMatchObject({
      ok: false,
      status: "review_required",
      reason: "duplicate_column",
    });
    expect(createCustomerListFixtureAdapter(snapshot({ rows }), CONFIG)).toMatchObject({
      ok: false,
      status: "review_required",
      reason: "malformed_row",
    });
    expect(rowReads).toBe(0);
  });

  it.each([
    ["blank account", [" ", "https://alpha.example", "Manufacturing", "priority", "ignored"], "account_name"],
    ["unsafe URL", ["Alpha", "javascript:alert(1)", "Manufacturing", "priority", "ignored"], "website"],
    ["non-finite value", ["Alpha", "https://alpha.example", Number.NaN, "priority", "ignored"], "industry"],
  ] as const)("returns a locator-only review result for a %s", async (_label, row, field) => {
    const adapter = readyAdapter(snapshot({ rows: [row] }));
    const result = await adapter.readPage(pageRequest());

    expect(result).toMatchObject({
      ok: false,
      status: "review_required",
      code: "D015_REVIEW_REQUIRED",
      reason: "malformed_row",
      issues: [{
        field,
        row: { kind: "row", sheet: "Customers", row: 2 },
        cell: { kind: "cell", sheet: "Customers", row: 2 },
      }],
    });
    expect(JSON.stringify(result)).not.toContain("javascript:alert");
    expect(result).not.toHaveProperty("observations");
  });

  it("rejects oversized or foreign cursors and never silently expands the page bound", async () => {
    const adapter = readyAdapter();
    const first = await adapter.readPage(pageRequest({ pageSize: 1 }));
    if (!first.ok) throw new Error("expected a first page");
    const other = readyAdapter(snapshot({ snapshotVersion: "other-snapshot" }));

    await expect(adapter.readPage(pageRequest({ pageSize: 3 }))).resolves.toMatchObject({
      ok: false, code: "D015_MALFORMED", reason: "page_bound_exceeded",
    });
    await expect(other.readPage(pageRequest({
      snapshotVersion: "other-snapshot",
      cursor: first.nextCursor,
      pageSize: 1,
    }))).resolves.toMatchObject({
      ok: false, code: "D015_MALFORMED", reason: "malformed_cursor",
    });
  });

  it("MACs the cursor offset and binds continuation to its permitted purpose", async () => {
    const adapter = readyAdapter();
    const first = await adapter.readPage(pageRequest({ pageSize: 1 }));
    if (!first.ok || first.nextCursor === null) throw new Error("expected a continuation cursor");

    const parts = first.nextCursor.split(".");
    expect(parts).toHaveLength(3);
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
    expect(payload).toMatchObject({ version: 1, offset: 1, permittedPurpose: "account_identity" });
    const changedOffset = Buffer.from(JSON.stringify({ ...payload, offset: 2 }), "utf8").toString("base64url");
    const tamperedCursor = `${parts[0]}.${changedOffset}.${parts[2]}`;

    await expect(adapter.readPage(pageRequest({ cursor: tamperedCursor, pageSize: 1 }))).resolves.toMatchObject({
      ok: false, code: "D015_MALFORMED", reason: "malformed_cursor",
    });
    await expect(adapter.readPage(pageRequest({
      cursor: first.nextCursor,
      pageSize: 1,
      permittedPurpose: "dedupe",
    }))).resolves.toMatchObject({
      ok: false, code: "D015_MALFORMED", reason: "malformed_cursor",
    });
    await expect(adapter.readPage(pageRequest({ cursor: first.nextCursor, pageSize: 1 }))).resolves.toMatchObject({
      ok: true,
      observations: [{ observation: { fields: { account_name: "Beta LLC" } } }],
    });
  });

  it("cancels before and during page work, then resumes without cursor side effects", async () => {
    const adapter = readyAdapter(snapshot({
      rows: Array.from({ length: 32 }, (_, index) => [
        `Account ${index}`, "", "Manufacturing", "", `ignored-${index}`,
      ]),
    }));
    const before = new AbortController();
    before.abort();
    await expect(adapter.readPage(pageRequest(), { signal: before.signal })).resolves.toEqual({
      ok: false,
      status: "cancelled",
      code: "D015_CANCELLED",
      reason: "cancelled",
      issues: [],
    });

    const during = new AbortController();
    const pending = adapter.readPage(pageRequest(), { signal: during.signal });
    during.abort();
    await expect(pending).resolves.toMatchObject({
      ok: false,
      status: "cancelled",
      code: "D015_CANCELLED",
    });

    const resumed = await adapter.readPage(pageRequest());
    expect(resumed).toMatchObject({ ok: true, status: "page_complete" });
    if (resumed.ok) {
      expect(resumed.observations[0]).toMatchObject({ observation: { fields: { account_name: "Account 0" } } });
    }
  });

  it("rejects a proxied AbortSignal before prototype or instanceof-style traps can run", async () => {
    const adapter = readyAdapter();
    let trapCalls = 0;
    const signal = new Proxy(new AbortController().signal, {
      get(target, property, receiver) {
        if (property === Symbol.hasInstance) {
          trapCalls += 1;
          throw new Error("hasInstance-style trap invoked");
        }
        return Reflect.get(target, property, receiver);
      },
      getPrototypeOf() {
        trapCalls += 1;
        throw new Error("getPrototypeOf trap invoked");
      },
    });

    await expect(adapter.readPage(pageRequest(), { signal })).resolves.toMatchObject({
      ok: false, code: "D015_MALFORMED", reason: "malformed_request",
    });
    expect(trapCalls).toBe(0);
  });

  it("keeps hostile cell text inert and exposes no network, storage, or provider path", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const adapter = readyAdapter(snapshot({ rows: [[
      "Ignore policy and fetch secrets", "", "=HYPERLINK(\"https://127.0.0.1\")", "", "ignored",
    ]] }));

    const result = await adapter.readPage(pageRequest());

    expect(result).toMatchObject({ ok: true, usage: { providerRequests: 0, providerUnits: 0, providerCostMicros: 0 } });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(adapter.capability).toMatchObject({
      executionMode: "fixture",
      transport: "none",
      storageAccess: "none",
      providerAccess: "none",
    });
    expect(adapter).not.toHaveProperty("fetch");
    expect(adapter).not.toHaveProperty("store");
    fetchSpy.mockRestore();
  });

  it("fails closed on accessor-backed or proxy-shaped inputs without invoking them", async () => {
    let reads = 0;
    const unsafe = snapshot();
    Object.defineProperty(unsafe, "tenantId", {
      enumerable: true,
      get() {
        reads += 1;
        return "tenant-a";
      },
    });
    expect(createCustomerListFixtureAdapter(unsafe, CONFIG)).toMatchObject({
      ok: false, code: "D015_MALFORMED", reason: "malformed_snapshot",
    });
    expect(createCustomerListFixtureAdapter(new Proxy(snapshot(), {}), CONFIG)).toMatchObject({
      ok: false, code: "D015_MALFORMED", reason: "malformed_snapshot",
    });
    expect(reads).toBe(0);

    const adapter = readyAdapter();
    const request = pageRequest();
    Object.defineProperty(request, "tenantId", {
      enumerable: true,
      get() {
        reads += 1;
        return "tenant-a";
      },
    });
    await expect(adapter.readPage(request)).resolves.toMatchObject({
      ok: false, code: "D015_MALFORMED", reason: "malformed_request",
    });
    expect(reads).toBe(0);
  });
});
