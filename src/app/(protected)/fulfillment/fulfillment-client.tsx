"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { HelpTip } from "@/components/help-tip";
import { StatusNotice, type Notice } from "@/components/status-notice";
import { updateAdminRequestStatusAction } from "@/lib/admin-requests/actions";
import type { AdminRequest, AdminRequestStatus, AdminRequestType } from "@/lib/db/queries";

export function FulfillmentClient({
  initialRequests,
  activeType,
  activeStatus,
}: {
  initialRequests: AdminRequest[];
  activeType: AdminRequestType | "all";
  activeStatus: AdminRequestStatus | "open" | "all";
}) {
  const router = useRouter();
  const [requests, setRequests] = useState(initialRequests);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<Notice | null>(null);
  const [, startTransition] = useTransition();

  const flash = (text: string, tone: Notice["tone"] = "success") => {
    setMessage({ text, tone });
    window.setTimeout(() => setMessage(null), 3000);
  };

  const updateStatus = (request: AdminRequest, status: AdminRequestStatus, openLead = false) => {
    setPendingId(request.id);
    startTransition(async () => {
      const result = await updateAdminRequestStatusAction(request.id, status);
      if ("error" in result) {
        flash(result.error ?? "Unable to update request", "danger");
      } else {
        setRequests((current) => current.map((item) => item.id === request.id ? result.request : item));
        flash("Fulfillment request updated");
        router.refresh();
        if (openLead) router.push(`/leads/${request.lead_id}`);
      }
      setPendingId(null);
    });
  };

  return (
    <div className="space-y-5">
      {message && (
        <StatusNotice notice={message} />
      )}

      <section className="glass rounded-2xl p-5">
        <div className="flex flex-wrap items-center gap-2">
          <FilterLink href="/fulfillment" active={activeType === "all" && activeStatus === "open"}>Open</FilterLink>
          <FilterLink href="/fulfillment?type=website_request" active={activeType === "website_request"}>Website needed</FilterLink>
          <FilterLink href="/fulfillment?type=quote_request" active={activeType === "quote_request"}>Quote requested</FilterLink>
          <FilterLink href="/fulfillment?status=waiting_on_researcher" active={activeStatus === "waiting_on_researcher"}>Waiting on researcher</FilterLink>
          <FilterLink href="/fulfillment?status=all" active={activeStatus === "all"}>All</FilterLink>
        </div>
      </section>

      {requests.length === 0 ? (
        <section className="glass rounded-2xl p-8 text-center">
          <h3 className="section-label">No fulfillment requests</h3>
          <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            Website and quote requests from researchers will appear here.
          </p>
        </section>
      ) : (
        <section className="grid gap-4 lg:grid-cols-2">
          {requests.map((request) => (
            <FulfillmentCard
              key={request.id}
              request={request}
              busy={pendingId === request.id}
              onStatus={updateStatus}
            />
          ))}
        </section>
      )}
    </div>
  );
}

function FulfillmentCard({
  request,
  busy,
  onStatus,
}: {
  request: AdminRequest;
  busy: boolean;
  onStatus: (request: AdminRequest, status: AdminRequestStatus, openLead?: boolean) => void;
}) {
  const owner = request.lead_owner_display_name || request.lead_owner_email || "Unassigned";
  const creator = request.creator_display_name || request.creator_email || request.created_by_email || "Unknown";
  const teamLead = request.creator_team_lead_display_name || request.creator_team_lead_email || request.creator_team_label || "No team lead";
  const phoneHref = request.lead_phone ? `tel:${request.lead_phone.replace(/[^\d+]/g, "")}` : null;
  return (
    <article
      className="rounded-2xl p-5"
      style={{ background: "var(--surface-card)", border: "1px solid var(--surface-card-border)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link className="link-accent block break-words text-lg font-semibold" href={`/leads/${request.lead_id}`} prefetch={false}>
            {request.lead_name ?? "Unknown business"}
          </Link>
          <p className="mt-1 text-xs uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
            {requestLabel(request.request_type)} · {statusLabel(request.status)} · {request.priority}
          </p>
        </div>
        <Link href={`/leads/${request.lead_id}`} prefetch={false} className="btn-glass text-sm">Open Lead</Link>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <InfoChip label="Owner" value={owner} />
        <InfoChip label="Created by" value={creator} />
        <InfoChip label="Team lead" value={teamLead} />
        <InfoChip label="Contact person" value={request.contact_person_name ?? "Not captured"} />
        <InfoChip label="Phone" value={request.lead_phone ?? "No phone"} href={phoneHref ?? undefined} />
        <InfoChip label="Budget" value={request.budget_hint ?? "Not captured"} />
        <InfoChip label="Due" value={request.due_at ? new Date(request.due_at).toLocaleString() : "No due date"} />
        <InfoChip label="Website" value={request.lead_website_status ?? "Unknown"} />
      </div>

      <div className="mt-4 rounded-xl p-4" style={{ background: "var(--surface-muted)" }}>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>
          {request.summary ?? "No summary provided."}
        </p>
        {request.next_step && (
          <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            Next: {request.next_step}
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {request.status === "new" && (
          <ActionWithHelp help="Acknowledges the request without starting work yet.">
            <button type="button" className="btn-glass text-sm" disabled={busy} onClick={() => onStatus(request, "seen")}>Mark seen</button>
          </ActionWithHelp>
        )}
        <ActionWithHelp help="Marks the request in progress and opens the lead record.">
          <button type="button" className="btn-primary text-sm" disabled={busy} onClick={() => onStatus(request, "in_progress", true)}>
            {busy ? "Opening..." : "Start design"}
          </button>
        </ActionWithHelp>
        <ActionWithHelp help="Moves the item into waiting status when the researcher needs to clarify details.">
          <button type="button" className="btn-glass text-sm" disabled={busy} onClick={() => onStatus(request, "waiting_on_researcher")}>Ask researcher</button>
        </ActionWithHelp>
        <ActionWithHelp help="Closes the request as completed.">
          <button type="button" className="btn-glass text-sm" disabled={busy} onClick={() => onStatus(request, "done")}>Done</button>
        </ActionWithHelp>
        <ActionWithHelp help="Closes the request without marking it completed.">
          <button type="button" className="btn-glass text-sm" disabled={busy} onClick={() => onStatus(request, "cancelled")}>Cancel</button>
        </ActionWithHelp>
      </div>
    </article>
  );
}

function ActionWithHelp({ children, help }: { children: React.ReactNode; help: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {children}
      <HelpTip>{help}</HelpTip>
    </span>
  );
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link className={active ? "btn-primary text-sm" : "btn-glass text-sm"} href={href}>
      {children}
    </Link>
  );
}

function InfoChip({ label, value, href }: { label: string; value: string; href?: string }) {
  const content = (
    <>
      <span className="block text-[0.68rem] uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>{label}</span>
      <span className="mt-0.5 block break-words text-sm font-medium" style={{ color: "var(--text-primary)" }}>{value}</span>
    </>
  );
  if (href) {
    return (
      <a className="rounded-lg px-3 py-2" style={{ background: "var(--surface-muted)" }} href={href}>
        {content}
      </a>
    );
  }
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: "var(--surface-muted)" }}>
      {content}
    </div>
  );
}

function requestLabel(type: AdminRequestType): string {
  return type === "quote_request" ? "Quote requested" : "Website needed";
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}
