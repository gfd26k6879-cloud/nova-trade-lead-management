import { describe, expect, it } from "vitest";

import {
  KEY_FORMAT_PREFIX,
  KEY_FORMAT_VERSION,
  MAX_KEY_COMPONENT_BYTES,
  MAX_KEY_COMPONENTS,
  MAX_KEY_LENGTH,
  TENANT_SCOPE_SENTINEL,
  buildCacheKey,
  buildIdempotencyKey,
  buildJobKey,
  buildObjectStorageKey,
  getKeyFormatVersion,
  type CacheKeyPurpose,
  type IdempotencyKeyPurpose,
  type JobKeyPurpose,
  type ObjectKeyPurpose,
} from "@/lib/tenancy/keys";

const TENANT_A = "11111111-1111-1111-9111-111111111111";
const TENANT_B = "22222222-2222-2222-9222-222222222222";
const WORKSPACE_A = "33333333-3333-3333-9333-333333333333";
const WORKSPACE_B = "44444444-4444-4444-9444-444444444444";
const TENANT_CASE_MIXED_LOWER = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const TENANT_CASE_MIXED_UPPER = "F47AC10B-58CC-4372-A567-0E02B2C3D479";
const WORKSPACE_CASE_MIXED_LOWER = "0f8fad5b-d9cb-469f-a165-70867728950e";
const WORKSPACE_CASE_MIXED_UPPER = "0F8FAD5B-D9CB-469F-A165-70867728950E";
const TENANT_CASE_MIXED_DIFFERENT = "c47ac10b-58cc-4372-a567-0e02b2c3d479";

const VALID_CACHE_PURPOSE: CacheKeyPurpose = "query";
const VALID_OBJECT_PURPOSE: ObjectKeyPurpose = "document";
const VALID_IDEMPOTENCY_PURPOSE: IdempotencyKeyPurpose = "mutation";
const VALID_JOB_PURPOSE: JobKeyPurpose = "run";

const SENSITIVE_COMPONENT_CASES = [
  { value: "alice@example.com", fragments: ["alice", "example.com"] },
  { value: "Bearer abc123-secret-token", fragments: ["Bearer", "abc123", "secret-token"] },
  { value: "+1-555-555-5555", fragments: ["+1", "555-555-5555", "5555555555"] },
  {
    value: "https://example.com/search?q=token&email=alice@example.com",
    fragments: ["token", "email", "alice@example.com", "example.com"],
  },
  { value: "customer-file-name.csv", fragments: ["customer-file-name", ".csv", "file-name"] },
] as const;

type FamilyLabel = "cache" | "object" | "idempotency" | "job";

type FamilyFixture = Readonly<{
  label: FamilyLabel;
  validPurpose: CacheKeyPurpose | ObjectKeyPurpose | IdempotencyKeyPurpose | JobKeyPurpose;
  buildKey: (tenantId: string, workspaceId: string, purpose: string, components: readonly string[]) => string;
}>;

const FAMILY_FIXTURES: readonly FamilyFixture[] = [
  {
    label: "cache",
    validPurpose: VALID_CACHE_PURPOSE,
    buildKey: (tenantId: string, workspaceId: string, purpose: string, components: readonly string[]) =>
      buildCacheKey({
        tenantId,
        workspaceId,
        purpose: purpose as CacheKeyPurpose,
        components,
      }),
  },
  {
    label: "object",
    validPurpose: VALID_OBJECT_PURPOSE,
    buildKey: (tenantId: string, workspaceId: string, purpose: string, components: readonly string[]) =>
      buildObjectStorageKey({
        tenantId,
        workspaceId,
        purpose: purpose as ObjectKeyPurpose,
        components,
      }),
  },
  {
    label: "idempotency",
    validPurpose: VALID_IDEMPOTENCY_PURPOSE,
    buildKey: (tenantId: string, workspaceId: string, purpose: string, components: readonly string[]) =>
      buildIdempotencyKey({
        tenantId,
        workspaceId,
        purpose: purpose as IdempotencyKeyPurpose,
        components,
      }),
  },
  {
    label: "job",
    validPurpose: VALID_JOB_PURPOSE,
    buildKey: (tenantId: string, workspaceId: string, purpose: string, components: readonly string[]) =>
      buildJobKey({
        tenantId,
        workspaceId,
        purpose: purpose as JobKeyPurpose,
        components,
      }),
  },
] as const;

type BuildMismatchFixture = Readonly<{
  label: FamilyLabel;
  buildKey: (tenantId: string, workspaceId: string, purpose: string, components: readonly string[]) => string;
  mismatchedPurpose: string;
}>;

const PURPOSE_MISMATCH_FIXTURES: readonly BuildMismatchFixture[] = [
  {
    label: "cache",
    buildKey: FAMILY_FIXTURES[0].buildKey,
    mismatchedPurpose: VALID_IDEMPOTENCY_PURPOSE,
  },
  {
    label: "object",
    buildKey: FAMILY_FIXTURES[1].buildKey,
    mismatchedPurpose: VALID_CACHE_PURPOSE,
  },
  {
    label: "idempotency",
    buildKey: FAMILY_FIXTURES[2].buildKey,
    mismatchedPurpose: VALID_OBJECT_PURPOSE,
  },
  {
    label: "job",
    buildKey: FAMILY_FIXTURES[3].buildKey,
    mismatchedPurpose: VALID_IDEMPOTENCY_PURPOSE,
  },
] as const;

const captureErrorMessage = (callback: () => unknown): string => {
  try {
    callback();
    return "<no-error>";
  } catch (error) {
    return error instanceof Error ? error.message : `${error}`;
  }
};

const extractComponentDigests = (key: string): string[] => {
  const delimited = key.match(/components:(.*)$/);
  if (delimited !== null) {
    return delimited[1]?.split(",") ?? [];
  }

  const parts = key.split("/");
  const marker = parts.lastIndexOf("components");
  if (marker < 0) {
    return [];
  }

  return parts.slice(marker + 1);
};

describe("tenant-safe key helpers: deterministic family helpers", () => {
  it.each(FAMILY_FIXTURES)("builds stable deterministic keys for $label family", ({ buildKey, validPurpose }) => {
    const components = ["lead-001", "query", "ab", "c"];
    const first = buildKey(TENANT_A, WORKSPACE_A, validPurpose, components);
    const second = buildKey(TENANT_A, WORKSPACE_A, validPurpose, components);
    expect(first).toBe(second);
  });

  it.each(FAMILY_FIXTURES)("separates tenants and workspaces for $label family", ({ buildKey, validPurpose }) => {
    const components = ["lead-001", "query"];
    const tenantOne = buildKey(TENANT_A, WORKSPACE_A, validPurpose, components);
    const tenantTwo = buildKey(TENANT_B, WORKSPACE_A, validPurpose, components);
    const workspaceTwo = buildKey(TENANT_A, WORKSPACE_B, validPurpose, components);

    expect(tenantOne).not.toBe(tenantTwo);
    expect(tenantOne).not.toBe(workspaceTwo);
    expect(tenantTwo).not.toBe(workspaceTwo);
  });

  it.each(FAMILY_FIXTURES)(
    "accepts explicit tenant-scope workspace sentinel for $label family",
    ({ buildKey, validPurpose }) => {
      const components = ["lead-001", "query"];
      const tenantScoped = buildKey(TENANT_A, TENANT_SCOPE_SENTINEL, validPurpose, components);
      const withWorkspace = buildKey(TENANT_A, WORKSPACE_A, validPurpose, components);
      expect(tenantScoped).not.toBe(withWorkspace);
      expect(tenantScoped).toContain(TENANT_SCOPE_SENTINEL);
    },
  );

  it.each(FAMILY_FIXTURES)(
    "normalizes tenant UUID case for identical semantic identifiers in $label family",
    ({ buildKey, validPurpose }) => {
      const keyLowerTenant = buildKey(
        TENANT_CASE_MIXED_LOWER,
        WORKSPACE_A,
        validPurpose,
        ["lead-001"],
      );
      const keyUpperTenant = buildKey(
        TENANT_CASE_MIXED_UPPER,
        WORKSPACE_A,
        validPurpose,
        ["lead-001"],
      );
      expect(keyLowerTenant).toBe(keyUpperTenant);
    },
  );

  it.each(FAMILY_FIXTURES)(
    "normalizes workspace UUID case for identical semantic identifiers in $label family",
    ({ buildKey, validPurpose }) => {
      const keyLowerWorkspace = buildKey(
        TENANT_A,
        WORKSPACE_CASE_MIXED_LOWER,
        validPurpose,
        ["lead-001"],
      );
      const keyUpperWorkspace = buildKey(
        TENANT_A,
        WORKSPACE_CASE_MIXED_UPPER,
        validPurpose,
        ["lead-001"],
      );
      expect(keyLowerWorkspace).toBe(keyUpperWorkspace);
    },
  );

  it.each(FAMILY_FIXTURES)(
    "keeps truly different tenant UUIDs distinct after canonicalization in $label family",
    ({ buildKey, validPurpose }) => {
      const tenantCanonicalA = buildKey(
        TENANT_CASE_MIXED_LOWER,
        WORKSPACE_A,
        validPurpose,
        ["lead-001"],
      );
      const tenantCanonicalB = buildKey(
        TENANT_CASE_MIXED_DIFFERENT,
        WORKSPACE_A,
        validPurpose,
        ["lead-001"],
      );
      expect(tenantCanonicalA).not.toBe(tenantCanonicalB);
    },
  );
});

describe("tenant-safe key helpers: hardening and rejection", () => {
  it.each(FAMILY_FIXTURES)("rejects malformed tenant identifiers for $label family", ({ buildKey, validPurpose }) => {
    const components = ["lead-001"];
    expect(() => buildKey("", WORKSPACE_A, validPurpose, components)).toThrow("tenantId");
    expect(() => buildKey("not-a-uuid", WORKSPACE_A, validPurpose, components)).toThrow("tenantId");
  });

  it.each(FAMILY_FIXTURES)("rejects malformed workspace identifiers for $label family", ({ buildKey, validPurpose }) => {
    const components = ["lead-001"];
    expect(() => buildKey(TENANT_A, "", validPurpose, components)).toThrow("workspaceId");
    expect(() => buildKey(TENANT_A, "not-a-uuid", validPurpose, components)).toThrow("workspaceId");
  });

  it.each(FAMILY_FIXTURES)(
    "rejects malformed component arrays for $label family",
    ({ buildKey, validPurpose }) => {
      expect(() =>
        buildKey(TENANT_A, WORKSPACE_A, validPurpose, 123 as unknown as string[]),
      ).toThrow("components must");
      expect(() => buildKey(TENANT_A, WORKSPACE_A, validPurpose, undefined as unknown as string[])).toThrow(
        "components must",
      );
      expect(() => buildKey(TENANT_A, WORKSPACE_A, validPurpose, [] as string[])).toThrow("components must contain");
    },
  );

  it.each(FAMILY_FIXTURES)("rejects whitespace-only and empty components for $label family", ({ buildKey, validPurpose }) => {
    expect(() => buildKey(TENANT_A, WORKSPACE_A, validPurpose, ["  "] as string[])).toThrow("non-empty");
    expect(() => buildKey(TENANT_A, WORKSPACE_A, validPurpose, ["\t"] as string[])).toThrow("non-empty");
    expect(() => buildKey(TENANT_A, WORKSPACE_A, validPurpose, [""] as string[])).toThrow("non-empty");
  });

  it.each(FAMILY_FIXTURES)("preserves leading/trailing spaces in component identity for $label family", ({ buildKey, validPurpose }) => {
    const bare = buildKey(TENANT_A, WORKSPACE_A, validPurpose, ["account"]);
    const leading = buildKey(TENANT_A, WORKSPACE_A, validPurpose, [" account"]);
    const trailing = buildKey(TENANT_A, WORKSPACE_A, validPurpose, ["account "]);
    const both = buildKey(TENANT_A, WORKSPACE_A, validPurpose, [" account "]);

    expect(new Set([bare, leading, trailing, both]).size).toBe(4);
  });

  it.each(FAMILY_FIXTURES)("rejects oversized component byte values at max and over for $label family", ({ buildKey, validPurpose }) => {
    const exactBoundary = Array.from({ length: MAX_KEY_COMPONENTS }, (_, index) => `comp-${index}`);
    const tooMany = Array.from({ length: MAX_KEY_COMPONENTS + 1 }, (_, index) => `comp-${index}`);

    const boundaryComponent = "x".repeat(MAX_KEY_COMPONENT_BYTES);
    const overflowComponent = "x".repeat(MAX_KEY_COMPONENT_BYTES + 1);

    expect(buildKey(TENANT_A, WORKSPACE_A, validPurpose, exactBoundary)).toBeTypeOf("string");
    expect(() => buildKey(TENANT_A, WORKSPACE_A, validPurpose, tooMany)).toThrow("components must contain");
    expect(buildKey(TENANT_A, WORKSPACE_A, validPurpose, [boundaryComponent])).toBeTypeOf("string");
    expect(() => buildKey(TENANT_A, WORKSPACE_A, validPurpose, [overflowComponent])).toThrow("byte length");
  });

  it.each(FAMILY_FIXTURES)(
    "rejects traversal/control/separator-heavy purpose labels for $label family",
    ({ buildKey }) => {
      const components = ["lead-001"];
      expect(() => buildKey(TENANT_A, WORKSPACE_A, "path/lookup" as string, components)).toThrow("path-safe");
      expect(() => buildKey(TENANT_A, WORKSPACE_A, "..lookup" as string, components)).toThrow("path-safe");
      expect(() => buildKey(TENANT_A, WORKSPACE_A, "lookup\\x" as string, components)).toThrow("path-safe");
      expect(() => buildKey(TENANT_A, WORKSPACE_A, "lookup\x00" as string, components)).toThrow("path-safe");
      expect(() => buildKey(TENANT_A, WORKSPACE_A, "BadCase" as string, components)).toThrow("path-safe");
    },
  );
});

describe("tenant-safe key helpers: purpose-family boundary checks", () => {
  it.each(PURPOSE_MISMATCH_FIXTURES)("rejects known purpose for the wrong family for $label family", ({ buildKey, mismatchedPurpose }) => {
    expect(() =>
      buildKey(TENANT_A, WORKSPACE_A, mismatchedPurpose, ["lead-001"]),
    ).toThrow("allow-listed");
  });
});

describe("tenant-safe key helpers: namespace and collision safety", () => {
  it("scopes component digests across tenant/workspace/family/purpose/index boundaries", () => {
    const components = ["shared-resource-id"];
    const indexComponents = ["same", "same"];

    const cacheTenantA = buildCacheKey({
      tenantId: TENANT_A,
      workspaceId: WORKSPACE_A,
      purpose: VALID_CACHE_PURPOSE,
      components,
    });
    const cacheTenantB = buildCacheKey({
      tenantId: TENANT_B,
      workspaceId: WORKSPACE_A,
      purpose: VALID_CACHE_PURPOSE,
      components,
    });
    const cacheWorkspaceB = buildCacheKey({
      tenantId: TENANT_A,
      workspaceId: WORKSPACE_B,
      purpose: VALID_CACHE_PURPOSE,
      components,
    });
    const cacheDifferentPurpose = buildCacheKey({
      tenantId: TENANT_A,
      workspaceId: WORKSPACE_A,
      purpose: "run-state",
      components,
    });
    const objectWithTenantA = buildObjectStorageKey({
      tenantId: TENANT_A,
      workspaceId: WORKSPACE_A,
      purpose: VALID_OBJECT_PURPOSE,
      components,
    });
    const idemWithTenantA = buildIdempotencyKey({
      tenantId: TENANT_A,
      workspaceId: WORKSPACE_A,
      purpose: VALID_IDEMPOTENCY_PURPOSE,
      components,
    });
    const jobWithTenantA = buildJobKey({
      tenantId: TENANT_A,
      workspaceId: WORKSPACE_A,
      purpose: VALID_JOB_PURPOSE,
      components,
    });

    const indexBoundKey = buildCacheKey({
      tenantId: TENANT_A,
      workspaceId: WORKSPACE_A,
      purpose: VALID_CACHE_PURPOSE,
      components: indexComponents,
    });

    const cacheTenantADigest = extractComponentDigests(cacheTenantA)[0];
    const cacheTenantBDigest = extractComponentDigests(cacheTenantB)[0];
    const cacheWorkspaceBDigest = extractComponentDigests(cacheWorkspaceB)[0];
    const cacheDifferentPurposeDigest = extractComponentDigests(cacheDifferentPurpose)[0];
    const objectDigest = extractComponentDigests(objectWithTenantA)[0];
    const idemDigest = extractComponentDigests(idemWithTenantA)[0];
    const jobDigest = extractComponentDigests(jobWithTenantA)[0];
    const indexZero = extractComponentDigests(indexBoundKey)[0];
    const indexOne = extractComponentDigests(indexBoundKey)[1];

    const allDigests = [
      cacheTenantADigest,
      cacheTenantBDigest,
      cacheWorkspaceBDigest,
      cacheDifferentPurposeDigest,
      objectDigest,
      idemDigest,
      jobDigest,
      indexZero,
      indexOne,
    ];

    expect(new Set(allDigests).size).toBe(allDigests.length);
  });

  it.each(FAMILY_FIXTURES)("does not include component byte-length in the returned key for $label family", ({ buildKey, validPurpose }) => {
    const key = buildKey(TENANT_A, WORKSPACE_A, validPurpose, ["account-id"]);
    const digests = extractComponentDigests(key);
    expect(digests).toHaveLength(1);
    expect(digests[0]).toMatch(/^[a-f0-9]{32}$/);
    for (const digest of digests) {
      expect(digest).not.toContain(":");
      expect(digest).not.toContain(" ");
      expect(digest).toHaveLength(32);
    }
  });

  it.each(FAMILY_FIXTURES)(
    "hides full sensitive values and truncated fragments in output for $label family",
    ({ buildKey, validPurpose }) => {
      for (const caseData of SENSITIVE_COMPONENT_CASES) {
        const key = buildKey(TENANT_A, WORKSPACE_A, validPurpose, [caseData.value]);
        expect(key).not.toContain(caseData.value);
        for (const fragment of caseData.fragments) {
          expect(key).not.toContain(fragment);
        }
      }
    },
  );

  it.each(FAMILY_FIXTURES)(
    "keeps sensitive material out of error messages for $label family",
    ({ buildKey, validPurpose }) => {
      for (const caseData of SENSITIVE_COMPONENT_CASES) {
        const errorMessage = captureErrorMessage(() =>
          buildKey(TENANT_A, WORKSPACE_A, validPurpose, [`${caseData.value}\x00`] as string[]),
        );
        expect(errorMessage).not.toBe("<no-error>");
        expect(errorMessage).not.toContain(caseData.value);
        for (const fragment of caseData.fragments) {
          expect(errorMessage).not.toContain(fragment);
        }
      }
    },
  );

  it.each(FAMILY_FIXTURES)(
    "maintains non-path delimiter safety for $label family while rejecting ambiguous concatenation",
    ({ buildKey, validPurpose }) => {
      const abThenC = buildKey(TENANT_A, WORKSPACE_A, validPurpose, ["ab", "c"]);
      const aThenBC = buildKey(TENANT_A, WORKSPACE_A, validPurpose, ["a", "bc"]);
      expect(abThenC).not.toBe(aThenBC);

      const cacheKey = buildCacheKey({ tenantId: TENANT_A, workspaceId: WORKSPACE_A, purpose: VALID_CACHE_PURPOSE, components: ["x"] });
      const idemKey = buildIdempotencyKey({
        tenantId: TENANT_A,
        workspaceId: WORKSPACE_A,
        purpose: VALID_IDEMPOTENCY_PURPOSE,
        components: ["x"],
      });
      const jobKey = buildJobKey({ tenantId: TENANT_A, workspaceId: WORKSPACE_A, purpose: VALID_JOB_PURPOSE, components: ["x"] });
      const objectKey = buildObjectStorageKey({
        tenantId: TENANT_A,
        workspaceId: WORKSPACE_A,
        purpose: VALID_OBJECT_PURPOSE,
        components: ["x"],
      });

      expect(new Set([cacheKey, idemKey, jobKey, objectKey]).size).toBe(4);
    },
  );
});

describe("tenant-safe key helpers: object storage constraints", () => {
  it("uses only forward slashes and remains relative", () => {
    const key = buildObjectStorageKey({
      tenantId: TENANT_A,
      workspaceId: WORKSPACE_A,
      purpose: VALID_OBJECT_PURPOSE,
      components: ["lead-001", "artifact"],
    });

    expect(key.startsWith("/")).toBe(false);
    expect(key.includes("\\")).toBe(false);
    expect(key.includes("..")).toBe(false);

    const parts = key.split("/");
    expect(parts).not.toContain(".");
    expect(parts).not.toContain("..");
  });
});

describe("tenant-safe key helpers: format/version invariants", () => {
  it.each(FAMILY_FIXTURES)("uses stable versioned format prefix for $label family", ({ buildKey, validPurpose, label }) => {
    const key = buildKey(TENANT_A, WORKSPACE_A, validPurpose, ["lead-001", "component"]);
    expect(key).toMatch(new RegExp(`^${KEY_FORMAT_PREFIX}`));
    if (label === "object") {
      expect(key.startsWith(`${KEY_FORMAT_PREFIX}/tenant/`)).toBe(true);
      expect(key).toContain("/components/");
    } else {
      expect(key.includes("|")).toBe(true);
      expect(key).not.toContain("/");
    }
  });

  it.each(FAMILY_FIXTURES)("enforces global key-length bounds for $label family", ({ buildKey, validPurpose }) => {
    const key = buildKey(TENANT_A, WORKSPACE_A, validPurpose, ["lead-001", "x".repeat(256)]);
    expect(key.length).toBeLessThanOrEqual(MAX_KEY_LENGTH);
    expect(KEY_FORMAT_VERSION).toBe(getKeyFormatVersion());
  });

  it("rejects non-string component values with mixed-type arrays", () => {
    expect(() =>
      buildCacheKey({
        tenantId: TENANT_A,
        workspaceId: WORKSPACE_A,
        purpose: VALID_CACHE_PURPOSE,
        components: ["lead-001", 12 as unknown as string],
      }),
    ).toThrow("text value");
  });

  it("uses unicode input with canonical normalization for determinism", () => {
    const input = ["\u00e9", "\u4e16\u754c", "na\u00efve"];
    const one = buildIdempotencyKey({
      tenantId: TENANT_A,
      workspaceId: WORKSPACE_A,
      purpose: VALID_IDEMPOTENCY_PURPOSE,
      components: input,
    });
    const two = buildIdempotencyKey({
      tenantId: TENANT_A,
      workspaceId: WORKSPACE_A,
      purpose: VALID_IDEMPOTENCY_PURPOSE,
      components: input,
    });

    expect(one).toBe(two);
  });

  it("uses getKeyFormatVersion helper for consistency checks", () => {
    expect(getKeyFormatVersion()).toBe("v1");
  });
});
