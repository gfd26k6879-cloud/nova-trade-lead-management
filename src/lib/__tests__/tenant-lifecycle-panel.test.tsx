import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  TenantLifecyclePanel,
  type TenantLifecycleSnapshot,
} from "@/components/admin/tenant-lifecycle-panel";

const TENANT_ID = "10000000-0000-4000-8000-000000000091";
const OTHER_TENANT_ID = "10000000-0000-4000-8000-000000000092";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000091";

type RecordedAudit = Extract<TenantLifecycleSnapshot["audit"], { state: "recorded" }>;

function recordedAudit(override: Partial<RecordedAudit> = {}): RecordedAudit {
  return {
    state: "recorded",
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    lifecycleVersion: 8,
    eventId: "audit-lifecycle-091",
    actorId: "admin-091",
    fromStatus: "paused",
    toStatus: "active",
    recordedAt: "2026-08-30T16:00:00.000Z",
    ...override,
  };
}

function snapshot(override: Partial<TenantLifecycleSnapshot> = {}): TenantLifecycleSnapshot {
  const base: TenantLifecycleSnapshot = {
    tenant: {
      id: TENANT_ID,
      slug: "nova-trade",
      name: "Nova Trade",
      status: "active",
      locale: "en-US",
      timezone: "America/Denver",
      createdAt: "2026-08-01T12:00:00.000Z",
      updatedAt: "2026-08-30T16:00:00.000Z",
    },
    workspace: {
      id: WORKSPACE_ID,
      tenantId: TENANT_ID,
      slug: "revenue-operations",
      name: "Revenue operations",
      status: "active",
      createdAt: "2026-08-01T12:00:00.000Z",
      updatedAt: "2026-08-30T16:00:00.000Z",
    },
    lifecycleVersion: 8,
    reasonCode: "operations.reviewed",
    reason: "Scheduled lifecycle review completed with no unresolved restrictions.",
    freezeHandoffStatus: "acknowledged",
    accessRevocationHandoffStatus: "requested",
    changedAt: "2026-08-30T16:00:00.000Z",
    audit: recordedAudit(),
  };
  return { ...base, ...override };
}

const allAuthorized = {
  read: true,
  request_pause: true,
  request_resume: true,
  request_suspend: true,
} as const;

describe("TenantLifecyclePanel", () => {
  it("renders the exact canonical scope, status, handoffs, reason, version, and audit summary", () => {
    const html = renderToStaticMarkup(
      <TenantLifecyclePanel state="ready" snapshot={snapshot()} authorizations={{ read: true }} />,
    );

    expect(html).toContain('data-surface="tenant-lifecycle-panel"');
    expect(html).toContain('aria-labelledby="tenant-lifecycle-title"');
    expect(html).toContain("Revenue operations");
    expect(html).toContain(TENANT_ID);
    expect(html).toContain(WORKSPACE_ID);
    expect(html).toContain("Canonical lifecycle version 8");
    expect(html).toContain('data-handoff-status="acknowledged"');
    expect(html).toContain('data-handoff-status="requested"');
    expect(html).toContain("Scheduled lifecycle review completed");
    expect(html).toContain("audit-lifecycle-091");
    expect(html).toContain("paused → active");
    expect(html).toContain("This view does not start, retry, or acknowledge either handoff");
  });

  it("shows only supplied final-authorized callbacks permitted by the current status", () => {
    const callbacks = {
      onRequestPause: vi.fn(),
      onRequestResume: vi.fn(),
      onRequestSuspend: vi.fn(),
    };
    const active = renderToStaticMarkup(
      <TenantLifecyclePanel state="ready" snapshot={snapshot()} authorizations={allAuthorized} {...callbacks} />,
    );
    expect(active).toContain("Request workspace pause");
    expect(active).toContain("Request tenant suspension");
    expect(active).not.toContain("Request workspace resume");
    expect(active.match(/<button\b/g)).toHaveLength(2);
    expect(active).toMatch(/<button[^>]*type="button"[^>]*min-h-11/u);

    const pausedWorkspace = snapshot({
      workspace: { ...snapshot().workspace!, status: "paused" },
      audit: recordedAudit({ toStatus: "paused" }),
    });
    const paused = renderToStaticMarkup(
      <TenantLifecyclePanel state="ready" snapshot={pausedWorkspace} authorizations={allAuthorized} {...callbacks} />,
    );
    expect(paused).toContain("Request workspace resume");
    expect(paused).toContain("Request tenant suspension");
    expect(paused).not.toContain("Request workspace pause");

    const suspendedTenant = snapshot({
      tenant: { ...snapshot().tenant, status: "suspended" },
      workspace: null,
      audit: recordedAudit({ workspaceId: null, fromStatus: "active", toStatus: "suspended" }),
    });
    const suspended = renderToStaticMarkup(
      <TenantLifecyclePanel state="ready" snapshot={suspendedTenant} authorizations={allAuthorized} {...callbacks} />,
    );
    expect(suspended).toContain("Request tenant resume");
    expect(suspended).not.toContain("Request tenant suspension");
    expect(suspended).not.toContain("Request workspace pause");

    const missingAuthorization = renderToStaticMarkup(
      <TenantLifecyclePanel state="ready" snapshot={snapshot()} authorizations={{ read: true }} {...callbacks} />,
    );
    expect(missingAuthorization).not.toMatch(/<button\b/u);
    expect(missingAuthorization).toContain("No lifecycle request is authorized for this exact state");
  });

  it("fails closed without enumerating a foreign scope, mismatched version receipt, or missing read decision", () => {
    const foreign = snapshot({ workspace: { ...snapshot().workspace!, tenantId: OTHER_TENANT_ID } });
    const foreignHtml = renderToStaticMarkup(
      <TenantLifecyclePanel state="ready" snapshot={foreign} authorizations={allAuthorized} onRequestSuspend={() => undefined} />,
    );
    expect(foreignHtml).toContain('data-tenant-lifecycle-state="unavailable"');
    expect(foreignHtml).toContain('role="alert"');
    expect(foreignHtml).not.toContain(TENANT_ID);
    expect(foreignHtml).not.toContain(WORKSPACE_ID);
    expect(foreignHtml).not.toMatch(/<button\b/u);

    const staleAudit = snapshot({
      audit: recordedAudit({ lifecycleVersion: 7 }),
    });
    const staleHtml = renderToStaticMarkup(
      <TenantLifecyclePanel state="ready" snapshot={staleAudit} authorizations={allAuthorized} />,
    );
    expect(staleHtml).toContain('data-tenant-lifecycle-state="unavailable"');

    const deniedHtml = renderToStaticMarkup(
      <TenantLifecyclePanel state="ready" snapshot={snapshot()} authorizations={{ request_suspend: true }} onRequestSuspend={() => undefined} />,
    );
    expect(deniedHtml).toContain('data-tenant-lifecycle-state="unavailable"');
    expect(deniedHtml).not.toContain("Nova Trade");
  });

  it("renders pending audit state without claiming a receipt or exposing transition machinery", () => {
    const html = renderToStaticMarkup(
      <TenantLifecyclePanel
        state="ready"
        snapshot={snapshot({ audit: { state: "pending" } })}
        authorizations={allAuthorized}
        onRequestPause={vi.fn()}
        onRequestSuspend={vi.fn()}
      />,
    );

    expect(html).toContain('data-audit-state="pending"');
    expect(html).toContain("Current audit receipt unavailable");
    expect(html).not.toContain("audit-lifecycle-091");
    expect(html).not.toMatch(/<button\b/u);
    expect(html).not.toMatch(/transitionTenantLifecycle|updateWorkspaceStatus|fetch\(|axios|lease|credential/iu);
  });

  it("renders accessible loading, error, empty, and responsive ready layouts", () => {
    const loading = renderToStaticMarkup(<TenantLifecyclePanel state="loading" />);
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Loading tenant lifecycle");

    const error = renderToStaticMarkup(<TenantLifecyclePanel state="error" error="Lifecycle snapshot unavailable." />);
    expect(error).toContain('role="alert"');
    expect(error).toContain("Lifecycle snapshot unavailable.");

    const empty = renderToStaticMarkup(<TenantLifecyclePanel state="empty" />);
    expect(empty).toContain("No lifecycle scope selected");

    const ready = renderToStaticMarkup(
      <TenantLifecyclePanel state="ready" snapshot={snapshot()} authorizations={{ read: true }} />,
    );
    expect(ready).toContain("xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,.65fr)]");
    expect(ready).toContain("sm:grid-cols-2");
    expect(ready).toContain("break-all");
    expect(ready).toMatch(/<h2[\s\S]*<h3/u);
  });
});
