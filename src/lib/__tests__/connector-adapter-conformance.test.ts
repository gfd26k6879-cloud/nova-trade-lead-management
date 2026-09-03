import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  CUSTOMER_LIST_FIXTURE_ADAPTER,
  GOOGLE_PLACES_FIXTURE_ADAPTER,
  evaluateConnectorAdapterFixture,
  executeConnectorFixtureWithPolicy,
  type ConnectorAdapterDescriptor,
} from "@/lib/connectors/adapter-contract";
import type { ConnectorPolicyRequest } from "@/lib/connectors/policy";
import {
  createCustomerListFixtureAdapter,
  type ApprovedCustomerListTableSnapshot,
  type CustomerListPageRequest,
} from "@/lib/connectors/customer-list-adapter";
import {
  GOOGLE_PLACES_APPROVED_FIELD_MASKS,
  createGooglePlacesOnePageAdapter,
  type GooglePlacesAdapterRequest,
  type GooglePlacesInjectedClient,
} from "@/lib/connectors/google-places-adapter";

const googleObservation = {
  sourceCardId: "google_places_legacy",
  operation: "search_text",
  tenantId: "tenant-a",
  runId: "run-a",
  observedAt: "2026-08-29T18:00:00.000Z",
  fields: {
    place_id: "places/example",
    business_name: "Example Industrial",
    website: "https://example.test",
    rating: 4.6,
    review_count: 23,
  },
} as const;

const customerListObservation = {
  sourceCardId: "customer_list_csv_upload",
  operation: "parse_list",
  tenantId: "tenant-a",
  runId: "run-b",
  observedAt: "2026-08-29T18:00:00.000Z",
  fields: {
    account_name: "Example Industrial",
    website: "https://example.test",
    industry: "manufacturing",
    tenant_id: "tenant-a",
    tag: "customer-provided",
  },
} as const;

describe("connector adapter fixture conformance", () => {
  it("rejects a descriptor bound to a different source before invoking the connector", async () => {
    const request: ConnectorPolicyRequest = {
      sourceCardId: "google_places_legacy",
      executionMode: "fixture",
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      authorizedTenantId: "tenant-a",
      operation: "search_text",
      fields: ["place_id", "business_name"],
      termsState: "approved",
      budget: { requestedUnits: 1, remainingUnits: 5 },
      now: "2026-08-29T12:00:00.000Z",
    };
    let calls = 0;

    const execution = await executeConnectorFixtureWithPolicy(
      request,
      CUSTOMER_LIST_FIXTURE_ADAPTER,
      async () => {
        calls += 1;
        return customerListObservation;
      },
    );

    expect(execution).toMatchObject({
      policy: { decision: "allow", code: "D015_PASS" },
      conformance: { decision: "block", code: "D015_SOURCE_POLICY_FAIL" },
    });
    expect(execution).not.toHaveProperty("output");
    expect(calls).toBe(0);
  });

  it("rejects a time-varying source-card accessor before invoking the connector", async () => {
    const request: ConnectorPolicyRequest = {
      sourceCardId: "google_places_legacy",
      executionMode: "fixture",
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      authorizedTenantId: "tenant-a",
      operation: "search_text",
      fields: ["place_id", "business_name"],
      termsState: "approved",
      budget: { requestedUnits: 1, remainingUnits: 5 },
      now: "2026-08-29T12:00:00.000Z",
    };
    let sourceReads = 0;
    let calls = 0;
    const descriptor = {
      get sourceCardId() {
        sourceReads += 1;
        return sourceReads === 4 ? "google_places_legacy" : "customer_list_csv_upload";
      },
      executionMode: "fixture",
      transport: "none",
      operations: CUSTOMER_LIST_FIXTURE_ADAPTER.operations,
      outputFields: CUSTOMER_LIST_FIXTURE_ADAPTER.outputFields,
    } as ConnectorAdapterDescriptor;

    const execution = await executeConnectorFixtureWithPolicy(request, descriptor, async () => {
      calls += 1;
      return customerListObservation;
    });

    expect(execution).toMatchObject({
      policy: { decision: "allow", code: "D015_PASS" },
      conformance: { decision: "block", code: "D015_MALFORMED" },
    });
    expect(execution).not.toHaveProperty("output");
    expect(sourceReads).toBe(0);
    expect(calls).toBe(0);
  });

  it.each([
    ["transparent", new Proxy(GOOGLE_PLACES_FIXTURE_ADAPTER, {})],
    ["throwing getPrototypeOf", new Proxy(GOOGLE_PLACES_FIXTURE_ADAPTER, {
      getPrototypeOf() {
        throw new Error("descriptor prototype trap");
      },
    })],
    ["throwing ownKeys", new Proxy(GOOGLE_PLACES_FIXTURE_ADAPTER, {
      ownKeys() {
        throw new Error("descriptor keys trap");
      },
    })],
  ] as const)("rejects a %s descriptor proxy before invoking the connector", async (_name, descriptor) => {
    const request: ConnectorPolicyRequest = {
      sourceCardId: "google_places_legacy",
      executionMode: "fixture",
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      authorizedTenantId: "tenant-a",
      operation: "search_text",
      fields: ["place_id", "business_name"],
      termsState: "approved",
      budget: { requestedUnits: 1, remainingUnits: 5 },
      now: "2026-08-29T12:00:00.000Z",
    };
    let calls = 0;

    const execution = executeConnectorFixtureWithPolicy(request, descriptor, async () => {
      calls += 1;
      return googleObservation;
    });

    await expect(execution).resolves.toMatchObject({
      policy: { decision: "allow", code: "D015_PASS" },
      conformance: { decision: "block", code: "D015_MALFORMED" },
    });
    await expect(execution).resolves.not.toHaveProperty("output");
    expect(calls).toBe(0);
  });

  it("accepts normalized Google Places and customer-list fixture observations", () => {
    expect(evaluateConnectorAdapterFixture(GOOGLE_PLACES_FIXTURE_ADAPTER, googleObservation)).toEqual({
      decision: "allow",
      code: "D015_PASS",
      sourceCardId: "google_places_legacy",
    });
    expect(evaluateConnectorAdapterFixture(CUSTOMER_LIST_FIXTURE_ADAPTER, customerListObservation)).toEqual({
      decision: "allow",
      code: "D015_PASS",
      sourceCardId: "customer_list_csv_upload",
    });
  });

  it("fails closed for an unknown source card", () => {
    const descriptor: ConnectorAdapterDescriptor = {
      ...GOOGLE_PLACES_FIXTURE_ADAPTER,
      sourceCardId: "unregistered_provider",
    };

    expect(evaluateConnectorAdapterFixture(descriptor, googleObservation)).toMatchObject({
      decision: "block",
      code: "D015_PROVIDER_UNKNOWN",
    });
  });

  it("rejects descriptor operations or output fields outside the source contract", () => {
    const unknownOperation: ConnectorAdapterDescriptor = {
      ...GOOGLE_PLACES_FIXTURE_ADAPTER,
      operations: [...GOOGLE_PLACES_FIXTURE_ADAPTER.operations, "maps_page_scrape"],
    };
    const unknownOutput: ConnectorAdapterDescriptor = {
      ...CUSTOMER_LIST_FIXTURE_ADAPTER,
      outputFields: [...CUSTOMER_LIST_FIXTURE_ADAPTER.outputFields, "personal_email"],
    };

    expect(evaluateConnectorAdapterFixture(unknownOperation, googleObservation)).toMatchObject({
      code: "D015_SOURCE_POLICY_FAIL",
    });
    expect(evaluateConnectorAdapterFixture(unknownOutput, customerListObservation)).toMatchObject({
      code: "D015_SOURCE_POLICY_FAIL",
    });
  });

  it("rejects observations that request an undeclared operation or output field", () => {
    expect(evaluateConnectorAdapterFixture(GOOGLE_PLACES_FIXTURE_ADAPTER, {
      ...googleObservation,
      operation: "maps_page_scrape",
    })).toMatchObject({ code: "D015_SOURCE_POLICY_FAIL" });
    expect(evaluateConnectorAdapterFixture(CUSTOMER_LIST_FIXTURE_ADAPTER, {
      ...customerListObservation,
      fields: { ...customerListObservation.fields, personal_email: "person@example.test" },
    })).toMatchObject({ code: "D015_SOURCE_POLICY_FAIL" });
  });

  it("rejects any descriptor that declares live execution or network access", () => {
    expect(evaluateConnectorAdapterFixture({
      ...GOOGLE_PLACES_FIXTURE_ADAPTER,
      executionMode: "live",
    }, googleObservation)).toMatchObject({ code: "D015_SOURCE_POLICY_FAIL" });
    expect(evaluateConnectorAdapterFixture({
      ...GOOGLE_PLACES_FIXTURE_ADAPTER,
      transport: "network",
    }, googleObservation)).toMatchObject({ code: "D015_SOURCE_POLICY_FAIL" });
  });

  it("rejects nested raw Google review bodies even under an allowed output field", () => {
    expect(evaluateConnectorAdapterFixture(GOOGLE_PLACES_FIXTURE_ADAPTER, {
      ...googleObservation,
      fields: {
        ...googleObservation.fields,
        business_name: {
          label: "Example Industrial",
          nested: { Review_Text: "private review body" },
        },
      },
    })).toMatchObject({
      decision: "block",
      code: "D015_SOURCE_POLICY_FAIL",
    });
  });

  it.each(["review_content", "review", "reviewsText", "customer_reviews"])(
    "rejects raw Google review bodies under variant key %s",
    (key) => {
      expect(evaluateConnectorAdapterFixture(GOOGLE_PLACES_FIXTURE_ADAPTER, {
        ...googleObservation,
        fields: { ...googleObservation.fields, business_name: { [key]: "private review body" } },
      })).toMatchObject({ decision: "block", code: "D015_SOURCE_POLICY_FAIL" });
    },
  );

  it("accepts finite nested Google metadata including arrays", () => {
    expect(evaluateConnectorAdapterFixture(GOOGLE_PLACES_FIXTURE_ADAPTER, {
      ...googleObservation,
      fields: {
        ...googleObservation.fields,
        operating_hours_metadata: {
          openNow: true,
          periods: [{ day: 1, opensAt: "09:00", closesAt: "17:00" }],
        },
      },
    })).toMatchObject({ decision: "allow", code: "D015_PASS" });
  });

  it("treats malformed nested customer-list values as malformed observations", () => {
    expect(evaluateConnectorAdapterFixture(CUSTOMER_LIST_FIXTURE_ADAPTER, {
      ...customerListObservation,
      fields: { ...customerListObservation.fields, industry: Number.NaN },
    })).toMatchObject({ decision: "block", code: "D015_MALFORMED" });
  });

  it.each([
    { review_count: "Amazing service. Full raw review body." },
    { business_name: { text: "Amazing service. Full raw review body." } },
    { rating: 6 },
    { website: "javascript:alert(1)" },
    { business_status: "Amazing service. Full raw review body." },
  ])("rejects malformed Google field values (%j)", (fields) => {
    expect(evaluateConnectorAdapterFixture(GOOGLE_PLACES_FIXTURE_ADAPTER, {
      ...googleObservation,
      fields: { ...googleObservation.fields, ...fields },
    })).toMatchObject({ decision: "block", code: "D015_MALFORMED" });
  });

  it("binds a customer-list tenant field to the observation tenant", () => {
    expect(evaluateConnectorAdapterFixture(CUSTOMER_LIST_FIXTURE_ADAPTER, {
      ...customerListObservation,
      fields: { ...customerListObservation.fields, tenant_id: "tenant-b" },
    })).toMatchObject({ decision: "block", code: "D015_SOURCE_POLICY_FAIL" });
  });

  it.each([
    null,
    {},
    { ...googleObservation, tenantId: "" },
    { ...googleObservation, runId: " " },
    { ...googleObservation, observedAt: "not-a-timestamp" },
    { ...googleObservation, observedAt: "2026-02-31T00:00:00.000Z" },
    { ...googleObservation, observedAt: "2026-08-29" },
    { ...googleObservation, fields: [] },
  ])("returns D015_MALFORMED for a malformed observation (%j)", (observation) => {
    expect(evaluateConnectorAdapterFixture(GOOGLE_PLACES_FIXTURE_ADAPTER, observation)).toMatchObject({
      decision: "block",
      code: "D015_MALFORMED",
    });
  });

  it("fails closed for prototype keys and malformed descriptor arrays", () => {
    expect(evaluateConnectorAdapterFixture({
      ...GOOGLE_PLACES_FIXTURE_ADAPTER,
      sourceCardId: "__proto__",
    }, googleObservation)).toMatchObject({ decision: "block", code: "D015_PROVIDER_UNKNOWN" });
    expect(evaluateConnectorAdapterFixture({
      ...GOOGLE_PLACES_FIXTURE_ADAPTER,
      operations: null,
    } as unknown as ConnectorAdapterDescriptor, googleObservation)).toMatchObject({
      decision: "block",
      code: "D015_MALFORMED",
    });
  });
});

const SHARED_TENANT_ID = "tenant-a";
const SHARED_WORKSPACE_ID = "workspace-a";
const RAW_PROVIDER_SENTINEL = "raw-provider-body-must-not-escape";
const RAW_REVIEW_SENTINEL = "raw-review-body-must-not-escape";
const SHARED_NOW = "2026-08-29T18:00:00.000Z";

type ConcreteAdapterEvidence = Readonly<{
  raw: object;
  tenantIds: readonly string[];
  canonicalMutationFlags: readonly boolean[];
  observationCount: number;
  maximumObservationCount: number;
  operationCalls: number;
  immutable: boolean;
  fixtureOnly: boolean;
  transportNone: boolean;
}>;

type ConcreteAdapterHarness = Readonly<{
  run(): Promise<ConcreteAdapterEvidence>;
  malformed(): Promise<object>;
  crossTenant(): Promise<object>;
  resetExternalCalls(): void;
  externalCalls(): number;
}>;

const CUSTOMER_DOCUMENT_ID = "00000000-0000-4000-8000-000000000201";
const CUSTOMER_VERSION_ID = "00000000-0000-4000-8000-000000000202";

function customerListHarness(): ConcreteAdapterHarness {
  const snapshot: ApprovedCustomerListTableSnapshot = {
    schemaVersion: 1,
    approvalState: "approved",
    tenantId: SHARED_TENANT_ID,
    workspaceId: SHARED_WORKSPACE_ID,
    documentId: CUSTOMER_DOCUMENT_ID,
    documentVersionId: CUSTOMER_VERSION_ID,
    snapshotVersion: "approved-table-v3",
    sheet: "Customers",
    headerRow: 1,
    columns: ["Company", "Website", "Private provider/review body"],
    rows: [["Example Industrial", "https://example.test", `${RAW_PROVIDER_SENTINEL} ${RAW_REVIEW_SENTINEL}`]],
    permittedPurposes: ["account_identity"],
  };
  const creation = createCustomerListFixtureAdapter(snapshot, {
    schemaVersion: 1,
    columns: { accountName: "Company", website: "Website", industry: null, tag: null },
    maxPageSize: 1,
  });
  expect(creation).toMatchObject({ ok: true, code: "D015_PASS" });
  if (!creation.ok) throw new Error("expected customer-list fixture adapter");
  const adapter = creation.adapter;
  const request: CustomerListPageRequest = {
    version: 1,
    runId: "run-shared-customer-list",
    authorizedTenantId: SHARED_TENANT_ID,
    authorizedWorkspaceId: SHARED_WORKSPACE_ID,
    tenantId: SHARED_TENANT_ID,
    workspaceId: SHARED_WORKSPACE_ID,
    documentId: CUSTOMER_DOCUMENT_ID,
    documentVersionId: CUSTOMER_VERSION_ID,
    snapshotVersion: "approved-table-v3",
    permittedPurpose: "account_identity",
    operation: "normalize",
    cursor: null,
    pageSize: 1,
    observedAt: SHARED_NOW,
  };

  return {
    async run() {
      const result = await adapter.readPage(request);
      if (!result.ok) throw new Error("expected customer-list conformance success");
      return {
        raw: result,
        tenantIds: result.observations.map((item) => item.observation.tenantId),
        canonicalMutationFlags: result.observations.map((item) => item.canonicalAccount),
        observationCount: result.observations.length,
        maximumObservationCount: adapter.capability.maxPageSize,
        operationCalls: result.usage.providerRequests,
        immutable: Object.isFrozen(result)
          && Object.isFrozen(result.observations)
          && result.observations.every((item) => Object.isFrozen(item)
            && Object.isFrozen(item.observation)
            && Object.isFrozen(item.observation.fields)),
        fixtureOnly: adapter.capability.executionMode === "fixture",
        transportNone: adapter.capability.transport === "none"
          && adapter.capability.providerAccess === "none",
      };
    },
    malformed: () => adapter.readPage({}),
    crossTenant: () => adapter.readPage({ ...request, authorizedTenantId: "tenant-b" }),
    resetExternalCalls: () => undefined,
    externalCalls: () => 0,
  };
}

function googlePlacesHarness(): ConcreteAdapterHarness {
  const textSearch = vi.fn(async () => ({
    places: [{
      id: "places/example-industrial",
      displayName: { text: "Example Industrial" },
      websiteUri: "https://example.test",
      regularOpeningHours: { openNow: true, periods: [{ body: RAW_REVIEW_SENTINEL }] },
      photos: [{ name: RAW_PROVIDER_SENTINEL }],
    }],
    nextPageToken: null,
  }));
  const getPlaceDetails = vi.fn(async () => ({ place: null }));
  const client: GooglePlacesInjectedClient = { textSearch, getPlaceDetails };
  const adapter = createGooglePlacesOnePageAdapter(client, {
    activation: "fixture_only",
    approvedPolicyVersion: "launch-v1",
    maxDeadlineMs: 30_000,
    clock: () => Date.parse(SHARED_NOW),
  });
  const request: GooglePlacesAdapterRequest = {
    version: 1,
    executionMode: "fixture",
    tenantId: SHARED_TENANT_ID,
    authorizedTenantId: SHARED_TENANT_ID,
    workspaceId: SHARED_WORKSPACE_ID,
    runId: "run-shared-google-places",
    observedAt: SHARED_NOW,
    deadlineAt: "2026-08-29T18:00:10.000Z",
    policyVersion: "launch-v1",
    operation: "search_text",
    fields: ["place_id", "business_name", "website", "operating_hours_metadata"],
    fieldMask: GOOGLE_PLACES_APPROVED_FIELD_MASKS.search_text,
    query: "industrial coatings near Denver Colorado",
    pageToken: null,
    locationBias: null,
  };

  return {
    async run() {
      const result = await adapter.execute(request);
      if (!result.ok) throw new Error("expected Google Places conformance success");
      return {
        raw: result,
        tenantIds: result.observations.map((item) => item.observation.tenantId),
        canonicalMutationFlags: result.observations.map((item) => item.canonicalMutation),
        observationCount: result.observations.length,
        maximumObservationCount: adapter.capability.maximumResultsPerPage,
        operationCalls: result.usage.clientCalls,
        immutable: Object.isFrozen(result)
          && Object.isFrozen(result.observations)
          && result.observations.every((item) => Object.isFrozen(item)
            && Object.isFrozen(item.observation)
            && Object.isFrozen(item.observation.fields)),
        fixtureOnly: adapter.descriptor.executionMode === "fixture"
          && adapter.capability.activation === "fixture_only",
        transportNone: adapter.descriptor.transport === "none",
      };
    },
    malformed: () => adapter.execute({}),
    crossTenant: () => adapter.execute({ ...request, authorizedTenantId: "tenant-b" }),
    resetExternalCalls() {
      textSearch.mockClear();
      getPlaceDetails.mockClear();
    },
    externalCalls: () => textSearch.mock.calls.length + getPlaceDetails.mock.calls.length,
  };
}

describe("shared concrete launch adapter conformance", () => {
  it.each([
    ["customer list", customerListHarness],
    ["Google Places", googlePlacesHarness],
  ] as const)("enforces the material launch invariants for %s", async (_label, createHarness) => {
    const network = vi.fn();
    vi.stubGlobal("fetch", network);
    try {
      const harness = createHarness();
      const first = await harness.run();
      const replay = await harness.run();

      expect(replay.raw).toEqual(first.raw);
      expect(first.fixtureOnly).toBe(true);
      expect(first.transportNone).toBe(true);
      expect(first.tenantIds).toEqual([SHARED_TENANT_ID]);
      expect(first.canonicalMutationFlags).toEqual([false]);
      expect(first.observationCount).toBeGreaterThan(0);
      expect(first.observationCount).toBeLessThanOrEqual(first.maximumObservationCount);
      expect(first.operationCalls).toBeLessThanOrEqual(1);
      expect(first.immutable).toBe(true);
      expect(first.raw).not.toHaveProperty("accounts");
      expect(first.raw).not.toHaveProperty("leads");
      expect(JSON.stringify(first.raw)).not.toContain(RAW_PROVIDER_SENTINEL);
      expect(JSON.stringify(first.raw)).not.toContain(RAW_REVIEW_SENTINEL);
      expect(network).not.toHaveBeenCalled();

      harness.resetExternalCalls();
      await expect(harness.malformed()).resolves.toMatchObject({ ok: false, status: "blocked" });
      expect(harness.externalCalls()).toBe(0);
      harness.resetExternalCalls();
      await expect(harness.crossTenant()).resolves.toMatchObject({ ok: false, status: "blocked" });
      expect(harness.externalCalls()).toBe(0);
      expect(network).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
