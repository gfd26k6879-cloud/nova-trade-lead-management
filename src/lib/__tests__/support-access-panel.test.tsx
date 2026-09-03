import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { SupportAccessPanel } from "@/components/admin/support-access-panel";
import type { SupportAccessGrant } from "@/lib/tenancy/types";

const TENANT = "10000000-0000-4000-8000-000000000001";
const WORKSPACE = "20000000-0000-4000-8000-000000000001";
const GRANT = "30000000-0000-4000-8000-000000000001";
const SUPPORT = "40000000-0000-4000-8000-000000000001";
const REQUESTER = "50000000-0000-4000-8000-000000000001";
const APPROVER = "60000000-0000-4000-8000-000000000001";
const REVOKER = "70000000-0000-4000-8000-000000000001";
const AUDIT = "80000000-0000-4000-8000-000000000001";
const CREATED = "2026-08-30T12:00:00.000Z";
const STARTS = "2026-08-30T13:00:00.000Z";
const EXPIRES = "2026-08-30T15:00:00.000Z";
const NOW = "2026-08-30T14:00:00.000Z";

function grant(state: SupportAccessGrant["state"] = "approved"): SupportAccessGrant {
  const approved = state !== "pending";
  const revoked = state === "revoked";
  return {
    id: GRANT,
    tenantId: TENANT,
    workspaceId: WORKSPACE,
    supportActorAuthIdentityId: SUPPORT,
    platformRole: "platform_support",
    requestedByAuthIdentityId: REQUESTER,
    approvedByAuthIdentityId: approved ? APPROVER : null,
    approvedAt: approved ? "2026-08-30T12:30:00.000Z" : null,
    revokedByAuthIdentityId: revoked ? REVOKER : null,
    revokedAt: revoked ? "2026-08-30T14:30:00.000Z" : null,
    state,
    reasonCode: "diagnostic-review",
    reason: "Investigate an exact failed enrichment run with the tenant administrator.",
    startsAt: STARTS,
    expiresAt: EXPIRES,
    correlationId: "corr-support-panel-001",
    auditEventId: AUDIT,
    permissions: ["tenant:read", "audit:read"],
    dataClasses: ["tenant_metadata", "audit_operational_metadata"],
    createdAt: CREATED,
    updatedAt: revoked ? "2026-08-30T14:30:00.000Z" : approved ? "2026-08-30T12:30:00.000Z" : CREATED,
  };
}

const SCOPE = { tenantId: TENANT, workspaceId: WORKSPACE } as const;
const AUTHORIZED = { request: true, approve: true, revoke: true } as const;

describe("SupportAccessPanel", () => {
  it("shows exact scope, purpose, least-content permissions, and the active time window", () => {
    const html = renderToStaticMarkup(
      <SupportAccessPanel state="ready" grant={grant()} scope={SCOPE} actorAuthIdentityId={APPROVER} asOf={NOW} actionAuthorizations={AUTHORIZED} />,
    );

    expect(html).toContain('aria-labelledby="support-access-title"');
    expect(html).toContain('data-support-access-state="ready"');
    expect(html).toContain('data-effective-state="active"');
    expect(html).toContain(TENANT);
    expect(html).toContain(WORKSPACE);
    expect(html).toContain("Investigate an exact failed enrichment run");
    expect(html).toContain("tenant · read");
    expect(html).toContain("audit operational metadata");
    expect(html).toContain('dateTime="2026-08-30T13:00:00.000Z"');
    expect(html).toContain('dateTime="2026-08-30T15:00:00.000Z"');
  });

  it("renders the human request, approval, and revocation chronology without inventing audit IDs", () => {
    const html = renderToStaticMarkup(
      <SupportAccessPanel state="ready" grant={grant("revoked")} scope={SCOPE} actorAuthIdentityId={APPROVER} asOf="2026-08-30T14:45:00.000Z" actionAuthorizations={AUTHORIZED} />,
    );

    expect(html).toContain('data-audit-event-count="3"');
    expect(html).toContain("Grant requested");
    expect(html).toContain(`Audit event ${AUDIT}`);
    expect(html).toContain("Grant approved");
    expect(html).toContain(APPROVER);
    expect(html).toContain("Grant revoked");
    expect(html).toContain(REVOKER);
    expect(html).toContain('aria-label="Support access audit chronology"');
  });

  it("shows only the human action allowed by canonical state, current time, and supplied authorization", () => {
    const pending = renderToStaticMarkup(
      <SupportAccessPanel state="ready" grant={grant("pending")} scope={SCOPE} actorAuthIdentityId={APPROVER} asOf={NOW} actionAuthorizations={AUTHORIZED} onRequest={vi.fn()} onApprove={vi.fn()} onRevoke={vi.fn()} />,
    );
    expect(pending).toContain("Approve grant");
    expect(pending).not.toContain("Request new grant");
    expect(pending).not.toContain("Revoke grant");

    const approved = renderToStaticMarkup(
      <SupportAccessPanel state="ready" grant={grant()} scope={SCOPE} actorAuthIdentityId={APPROVER} asOf={NOW} actionAuthorizations={AUTHORIZED} onRequest={vi.fn()} onApprove={vi.fn()} onRevoke={vi.fn()} />,
    );
    expect(approved).toContain("Revoke grant");
    expect(approved).not.toContain("Approve grant");
    expect(approved).not.toContain("Request new grant");

    const revoked = renderToStaticMarkup(
      <SupportAccessPanel state="ready" grant={grant("revoked")} scope={SCOPE} actorAuthIdentityId={APPROVER} asOf="2026-08-30T14:45:00.000Z" actionAuthorizations={AUTHORIZED} onRequest={vi.fn()} onApprove={vi.fn()} onRevoke={vi.fn()} />,
    );
    expect(revoked).toContain("Request new grant");
    expect(revoked).not.toContain("Approve grant");
    expect(revoked).not.toContain("Revoke grant");
  });

  it("fails closed for missing permission, self-approval, expired approval, and stale snapshots", () => {
    const missing = renderToStaticMarkup(
      <SupportAccessPanel state="ready" grant={grant("pending")} scope={SCOPE} actorAuthIdentityId={APPROVER} asOf={NOW} actionAuthorizations={{}} onApprove={vi.fn()} />,
    );
    expect(missing).not.toContain("Approve grant");

    const selfApproval = renderToStaticMarkup(
      <SupportAccessPanel state="ready" grant={grant("pending")} scope={SCOPE} actorAuthIdentityId={SUPPORT} asOf={NOW} actionAuthorizations={AUTHORIZED} onApprove={vi.fn()} />,
    );
    expect(selfApproval).not.toContain("Approve grant");

    const expiredPending = renderToStaticMarkup(
      <SupportAccessPanel state="ready" grant={grant("pending")} scope={SCOPE} actorAuthIdentityId={APPROVER} asOf={EXPIRES} actionAuthorizations={AUTHORIZED} onApprove={vi.fn()} />,
    );
    expect(expiredPending).not.toContain("Approve grant");

    const stale = renderToStaticMarkup(
      <SupportAccessPanel state="ready" grant={grant()} scope={SCOPE} actorAuthIdentityId={APPROVER} asOf="2026-08-30T12:15:00.000Z" actionAuthorizations={AUTHORIZED} onRevoke={vi.fn()} />,
    );
    expect(stale).toContain("view predates the latest recorded update");
    expect(stale).not.toContain("Revoke grant");
  });

  it("does not enumerate a malformed or mismatched grant and has responsive native controls", () => {
    const mismatched = renderToStaticMarkup(
      <SupportAccessPanel state="ready" grant={grant()} scope={{ tenantId: "90000000-0000-4000-8000-000000000001", workspaceId: WORKSPACE }} actorAuthIdentityId={APPROVER} asOf={NOW} actionAuthorizations={AUTHORIZED} onRevoke={vi.fn()} />,
    );
    expect(mismatched).toContain('data-support-access-state="denied"');
    expect(mismatched).toContain("record or scope could not be verified");
    expect(mismatched).not.toContain(GRANT);
    expect(mismatched).not.toContain(TENANT);

    const impossibleChronology = renderToStaticMarkup(
      <SupportAccessPanel state="ready" grant={{ ...grant(), updatedAt: CREATED }} scope={SCOPE} actorAuthIdentityId={APPROVER} asOf={NOW} actionAuthorizations={AUTHORIZED} onRevoke={vi.fn()} />,
    );
    expect(impossibleChronology).toContain('data-support-access-state="denied"');
    expect(impossibleChronology).not.toContain(GRANT);

    const ready = renderToStaticMarkup(
      <SupportAccessPanel state="ready" grant={grant()} scope={SCOPE} actorAuthIdentityId={APPROVER} asOf={NOW} actionAuthorizations={AUTHORIZED} onRevoke={vi.fn()} />,
    );
    expect(ready).toContain("xl:grid-cols-[minmax(0,1.3fr)_minmax(19rem,.7fr)]");
    expect(ready).toContain("grid gap-3 sm:grid-cols-2");
    expect(ready).toContain('type="button"');
    expect(ready).toContain("min-h-11 w-full");
    expect(ready).toContain('aria-describedby="support-actions-help"');
  });

  it("renders explicit loading, error, and empty states", () => {
    const loading = renderToStaticMarkup(<SupportAccessPanel state="loading" />);
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Loading support access");

    const error = renderToStaticMarkup(<SupportAccessPanel state="error" error="Support grant fixture unavailable." />);
    expect(error).toContain('role="alert"');
    expect(error).toContain("Support grant fixture unavailable.");

    const empty = renderToStaticMarkup(<SupportAccessPanel state="empty" />);
    expect(empty).toContain('data-support-access-state="empty"');
    expect(empty).toContain("No support access grant selected");
  });
});
