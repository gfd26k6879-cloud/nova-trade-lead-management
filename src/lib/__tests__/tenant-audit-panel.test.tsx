import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TenantAuditPanel, type TenantAuditEntry } from "@/components/admin/tenant-audit-panel";

const ENTRIES: readonly TenantAuditEntry[] = [
  {
    id: "audit-2",
    occurredAt: "2026-08-29T12:05:00.000Z",
    actorLabel: "Support operator",
    actorLayer: "support",
    action: "support.access.denied",
    resource: "workspace/workspace-a",
    workspaceLabel: "Research",
    outcome: "denied",
    correlationId: "correlation-support-denial",
  },
  {
    id: "audit-1",
    occurredAt: "2026-08-29T12:00:00.000Z",
    actorLabel: "Workspace admin",
    actorLayer: "member",
    action: "membership.role.changed",
    resource: "membership/member-a",
    workspaceLabel: null,
    outcome: "allowed",
    correlationId: "correlation-membership-change",
  },
];

describe("tenant audit panel", () => {
  it("renders scoped events, outcomes, and correlation references accessibly", () => {
    const html = renderToStaticMarkup(<TenantAuditPanel state="ready" entries={ENTRIES} integrity="verified" />);

    expect(html).toContain('aria-labelledby="tenant-audit-title"');
    expect(html).toContain('aria-label="Audit events"');
    expect(html).toContain('data-integrity="verified"');
    expect(html).toContain('data-outcome="denied"');
    expect(html).toContain("support.access.denied");
    expect(html).toContain("Research");
    expect(html).toContain("Tenant-wide");
    expect(html).toContain("correlation-membership-change");
    expect(html).toContain('dateTime="2026-08-29T12:05:00.000Z"');
  });

  it("does not claim verified chronology for unordered entries", () => {
    const html = renderToStaticMarkup(<TenantAuditPanel state="ready" entries={[...ENTRIES].reverse()} integrity="verified" />);

    expect(html).toContain('data-integrity="unverified"');
    expect(html).toContain("Chronology not verified");
  });

  it("renders explicit loading, error, and non-enumerating empty states", () => {
    const loading = renderToStaticMarkup(<TenantAuditPanel state="loading" />);
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');

    const error = renderToStaticMarkup(<TenantAuditPanel state="error" error="Audit view unavailable." />);
    expect(error).toContain('role="alert"');
    expect(error).toContain("Audit view unavailable.");

    const empty = renderToStaticMarkup(<TenantAuditPanel state="empty" />);
    expect(empty).toContain("No events match the current authorized scope.");
    expect(empty).not.toContain("tenant ID");
  });
});
