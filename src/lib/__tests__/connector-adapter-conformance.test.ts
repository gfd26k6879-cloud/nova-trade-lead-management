import { describe, expect, it } from "vitest";

import {
  CUSTOMER_LIST_FIXTURE_ADAPTER,
  GOOGLE_PLACES_FIXTURE_ADAPTER,
  evaluateConnectorAdapterFixture,
  executeConnectorFixtureWithPolicy,
  type ConnectorAdapterDescriptor,
} from "@/lib/connectors/adapter-contract";
import type { ConnectorPolicyRequest } from "@/lib/connectors/policy";

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
