import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TenantPolicyPanel, type TenantLimitUsageSnapshot } from "@/components/admin/tenant-policy-panel";
import { TENANT_LIMIT_ACTIONS, TENANT_LIMIT_ACTION_POLICY, type TenantLimitRuntimeState } from "@/lib/tenancy/limits";
import type { MembershipView } from "@/lib/tenancy/memberships";
import type { Workspace } from "@/lib/tenancy/queries";
import type { TenantPolicy } from "@/lib/tenancy/types";

const TENANT_ID = "10000000-0000-4000-8000-000000000081";
const OTHER_TENANT_ID = "10000000-0000-4000-8000-000000000082";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000081";
const NOW = "2026-08-30T18:00:00.000Z";

const actor: MembershipView = {
  tenantId: TENANT_ID,
  membershipId: "membership-owner-081",
  status: "active",
  role: "owner",
  workspaceId: null,
};

const workspace: Workspace = {
  id: WORKSPACE_ID,
  tenantId: TENANT_ID,
  slug: "revenue-ops",
  name: "Revenue operations",
  status: "active",
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-29T12:00:00.000Z",
};

const policy: TenantPolicy = {
  id: "tenant-policy-081",
  tenantId: TENANT_ID,
  version: 4,
  locale: "en-US",
  timezone: "America/Denver",
  exportRetentionDays: 7,
  operationalLogRetentionDays: 30,
  rawSourceRetentionDays: 180,
  contactFreshnessDays: 90,
  primaryDeleteWithinDays: 30,
  backupExpireWithinDays: 35,
  tombstoneRetentionYears: 7,
  activeMaterialsMode: "while_authorized_until_superseded_policy_or_deletion",
  aiProcessingEnabled: true,
  sourceResearchEnabled: true,
  contactResearchEnabled: true,
  outreachDraftingEnabled: true,
  copyExportEnabled: true,
  autonomousSendEnabled: false,
  requireSourcePlanApproval: true,
  requireKnowledgeReview: true,
  requireIcpReview: true,
  requireLeadPlayReview: true,
  requireContactReview: true,
  requireOutreachReview: true,
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-29T12:00:00.000Z",
};

const limits: TenantLimitRuntimeState = {
  tenantId: TENANT_ID,
  tenantStatus: "active",
  configurationVersion: 7,
  platformConfigurationVersion: 3,
  platformGlobalKill: false,
  platformActionKills: {},
  tenantActionKills: {},
  tenantPolicyCaps: { worker_start: 80, export_request: 20 },
};

const usage: TenantLimitUsageSnapshot = {
  tenantId: TENANT_ID,
  workspaceId: WORKSPACE_ID,
  configurationVersion: 7,
  measuredAt: "2026-08-30T17:30:00.000Z",
  usage: TENANT_LIMIT_ACTIONS.map((action, index) => ({
    action,
    used: index + 1,
    resetAt: "2026-08-31T00:00:00.000Z",
  })),
};

const audit = {
  state: "recorded",
  tenantId: TENANT_ID,
  workspaceId: WORKSPACE_ID,
  policyId: policy.id,
  policyVersion: policy.version,
  configurationVersion: limits.configurationVersion,
  eventId: "audit-policy-081",
  actorId: "admin-081",
  recordedAt: "2026-08-30T17:00:00.000Z",
} as const;

const authorizations = {
  "tenant:read": true,
  "usage:read": true,
  "tenant:manage": true,
  "budget:manage": true,
} as const;

describe("TenantPolicyPanel", () => {
  it("renders exact scope, source/outreach/privacy policy, versioned audit, and current usage against caps", () => {
    const html = renderToStaticMarkup(
      <TenantPolicyPanel state="ready" actor={actor} workspace={workspace} policy={policy} limits={limits} usage={usage} audit={audit} asOf={NOW} policyAuthorizations={authorizations} />,
    );

    expect(html).toContain('data-surface="tenant-policy-panel"');
    expect(html).toContain('aria-labelledby="tenant-policy-title"');
    expect(html).toContain("Tenant and workspace settings");
    expect(html).toContain(TENANT_ID);
    expect(html).toContain(WORKSPACE_ID);
    expect(html).toContain("Effective policy v4 · quota configuration v7");
    expect(html).toContain("Research authority");
    expect(html).toContain("Human-reviewed export");
    expect(html).toContain("This surface grants no send authority");
    expect(html).toContain("Retention and deletion");
    expect(html).toContain("Usage against effective caps");
    expect(html).toContain('data-limit-action="worker_start"');
    expect(html).toContain("7 / 80");
    expect(html).toContain('data-limit-action="export_request"');
    expect(html).toContain("5 / 20");
    expect(html).toContain("Recorded for current versions");
    expect(html).not.toMatch(/autonomous send[^<]*enabled/iu);
  });

  it("offers only human controls allowed by exact state, role, and supplied final authorizations", () => {
    const callbacks = {
      onEditPolicy: vi.fn(),
      onEditLimits: vi.fn(),
      onReviewAudit: vi.fn(),
    };
    const authorized = renderToStaticMarkup(
      <TenantPolicyPanel state="ready" actor={actor} workspace={workspace} policy={policy} limits={limits} usage={usage} audit={audit} asOf={NOW} policyAuthorizations={authorizations} {...callbacks} />,
    );
    expect(authorized).toContain("Edit tenant policy");
    expect(authorized).toContain("Edit quota limits");
    expect(authorized).not.toContain("Review policy audit");
    expect(authorized.match(/<button\b/g)).toHaveLength(2);
    expect(authorized).toMatch(/<button[^>]*type="button"[^>]*min-h-11/u);

    const missingPermissions = renderToStaticMarkup(
      <TenantPolicyPanel state="ready" actor={actor} workspace={workspace} policy={policy} limits={limits} usage={usage} audit={audit} asOf={NOW} policyAuthorizations={{ "tenant:read": true, "usage:read": true }} {...callbacks} />,
    );
    expect(missingPermissions).not.toMatch(/<button\b/u);
    expect(missingPermissions).toContain("No policy changes are authorized");

    const review = renderToStaticMarkup(
      <TenantPolicyPanel state="ready" actor={actor} workspace={workspace} policy={policy} limits={limits} usage={usage} audit={{ state: "pending" }} asOf={NOW} policyAuthorizations={authorizations} {...callbacks} />,
    );
    expect(review).toContain("Review policy audit");
    expect(review).not.toContain("Edit tenant policy");
    expect(review).not.toContain("Edit quota limits");

    const suspended = renderToStaticMarkup(
      <TenantPolicyPanel state="ready" actor={actor} workspace={{ ...workspace, status: "paused" }} policy={policy} limits={limits} usage={usage} audit={{ state: "pending" }} asOf={NOW} policyAuthorizations={authorizations} {...callbacks} />,
    );
    expect(suspended).not.toMatch(/<button\b/u);
  });

  it("fails closed without enumerating policy or usage when scope, version, or read authorization is invalid", () => {
    const foreign = renderToStaticMarkup(
      <TenantPolicyPanel state="ready" actor={actor} workspace={workspace} policy={{ ...policy, tenantId: OTHER_TENANT_ID }} limits={limits} usage={usage} audit={audit} asOf={NOW} policyAuthorizations={authorizations} onEditPolicy={() => undefined} />,
    );
    expect(foreign).toContain('data-tenant-policy-state="denied"');
    expect(foreign).toContain('role="alert"');
    expect(foreign).not.toContain(TENANT_ID);
    expect(foreign).not.toContain(WORKSPACE_ID);
    expect(foreign).not.toContain("Research authority");
    expect(foreign).not.toContain("Membership invitations");
    expect(foreign).not.toMatch(/<button\b/u);

    const staleUsage = renderToStaticMarkup(
      <TenantPolicyPanel state="ready" actor={actor} workspace={workspace} policy={policy} limits={limits} usage={{ ...usage, configurationVersion: 6 }} audit={audit} asOf={NOW} policyAuthorizations={authorizations} />,
    );
    expect(staleUsage).toContain('data-tenant-policy-state="denied"');

    const deniedRead = renderToStaticMarkup(
      <TenantPolicyPanel state="ready" actor={actor} workspace={workspace} policy={policy} limits={limits} usage={usage} audit={audit} asOf={NOW} policyAuthorizations={{ "tenant:read": true }} />,
    );
    expect(deniedRead).toContain('data-tenant-policy-state="denied"');
    expect(deniedRead).not.toContain(policy.id);
  });

  it("shows kill switches and platform ceilings without exposing edit controls", () => {
    const blockedLimits: TenantLimitRuntimeState = {
      ...limits,
      platformGlobalKill: true,
      platformActionKills: { worker_start: true },
    };
    const blockedAudit = { ...audit, configurationVersion: blockedLimits.configurationVersion };
    const html = renderToStaticMarkup(
      <TenantPolicyPanel state="ready" actor={actor} workspace={workspace} policy={policy} limits={blockedLimits} usage={usage} audit={blockedAudit} asOf={NOW} policyAuthorizations={authorizations} onEditLimits={() => undefined} />,
    );

    expect(html).toContain('data-limit-state="blocked"');
    expect(html).toContain(`platform ceiling ${TENANT_LIMIT_ACTION_POLICY.worker_start.platformHardCap}`);
    expect(html).not.toContain("Edit quota limits");
  });

  it("renders accessible loading, error, empty, and responsive ready layouts", () => {
    const loading = renderToStaticMarkup(<TenantPolicyPanel state="loading" />);
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Loading tenant policy");

    const error = renderToStaticMarkup(<TenantPolicyPanel state="error" error="Policy snapshot unavailable." />);
    expect(error).toContain('role="alert"');
    expect(error).toContain("Policy snapshot unavailable.");

    const empty = renderToStaticMarkup(<TenantPolicyPanel state="empty" />);
    expect(empty).toContain("No tenant policy selected");

    const ready = renderToStaticMarkup(
      <TenantPolicyPanel state="ready" actor={actor} workspace={workspace} policy={policy} limits={limits} usage={usage} audit={audit} asOf={NOW} policyAuthorizations={authorizations} />,
    );
    expect(ready).toContain("xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,.65fr)]");
    expect(ready).toContain("lg:grid-cols-3");
    expect(ready).toContain("lg:grid-cols-2");
    expect(ready).toMatch(/class="[^"]*break-all[^"]*"[^>]*>10000000/u);
    expect(ready.match(/<h2\b/g)).toHaveLength(1);
    expect(ready.indexOf("<h2")).toBeLessThan(ready.indexOf("<h3"));
  });
});
