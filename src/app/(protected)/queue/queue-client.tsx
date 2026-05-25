"use client";

import { type FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HelpTip } from "@/components/help-tip";
import { PageShell } from "@/components/page-shell";
import { ScoreBandBadge } from "@/components/score-band-badge";
import { createAdminRequestAction } from "@/lib/admin-requests/actions";
import { claimLeadAction, logOutreachEventAction, unclaimLeadAction } from "@/lib/leads/actions";
import type { AdminRequestType, OutreachOutcome, QueueLead, ResearcherWorkbench } from "@/lib/db/queries";
import type { ScoreBandThresholds } from "@/lib/score-bands";
import type { AppRole } from "@/lib/permissions";

interface Props {
  workbench: ResearcherWorkbench;
  scoreThresholds: ScoreBandThresholds;
  currentUser: { userId: string; email: string; role: AppRole };
}

type ContactChannel = "call" | "text" | "email" | "walkin";

type LogDraft = {
  channel: ContactChannel;
  outcome: OutreachOutcome;
  contactPersonName: string;
  note: string;
  followUpAt: string;
  nextStep: string;
};

const OUTCOME_OPTIONS: Array<{ value: OutreachOutcome; label: string }> = [
  { value: "not_reached", label: "Not reached" },
  { value: "left_voicemail", label: "Left voicemail" },
  { value: "contacted", label: "Contacted" },
  { value: "decision_maker_reached", label: "Decision-maker reached" },
  { value: "demo_sent", label: "Demo sent" },
  { value: "meeting_set", label: "Meeting set" },
  { value: "follow_up_needed", label: "Follow-up needed" },
  { value: "not_interested", label: "Not interested" },
];

export function QueueClient({ workbench, scoreThresholds, currentUser }: Props) {
  const router = useRouter();
  const [busyLeadId, setBusyLeadId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [activeLogLead, setActiveLogLead] = useState<QueueLead | null>(null);
  const [logDraft, setLogDraft] = useState<LogDraft>(createLogDraft("call"));
  const [requestBusy, setRequestBusy] = useState<AdminRequestType | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [router]);

  const flash = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(null), 3500);
  };

  const claimLead = async (leadId: string) => {
    setBusyLeadId(leadId);
    const result = await claimLeadAction(leadId);
    if ("error" in result) flash(result.error ?? "Unable to claim lead");
    else flash("Lead claimed");
    router.refresh();
    setBusyLeadId(null);
  };

  const releaseLead = async (leadId: string) => {
    setBusyLeadId(leadId);
    const result = await unclaimLeadAction(leadId);
    if ("error" in result) flash(result.error ?? "Unable to release lead");
    else flash("Lead released");
    router.refresh();
    setBusyLeadId(null);
  };

  const openLogSheet = (lead: QueueLead, channel: ContactChannel) => {
    setActiveLogLead(lead);
    setLogDraft(createLogDraft(channel, lead.next_best_action ?? undefined));
  };

  const closeLogSheet = () => {
    setActiveLogLead(null);
    setLogDraft(createLogDraft("call"));
  };

  const submitLog = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeLogLead) return;

    setBusyLeadId(activeLogLead.id);
    const result = await logOutreachEventAction(activeLogLead.id, {
      channel: logDraft.channel,
      outcome: logDraft.outcome,
      contactPersonName: cleanText(logDraft.contactPersonName),
      note: cleanText(logDraft.note),
      followUpAt: normalizeDateTime(logDraft.followUpAt),
      nextStep: cleanText(logDraft.nextStep),
    });

    if ("error" in result) {
      flash(result.error ?? "Unable to log outcome");
    } else {
      flash("Outcome logged");
      closeLogSheet();
    }
    router.refresh();
    setBusyLeadId(null);
  };

  const sendToSteve = async (requestType: AdminRequestType) => {
    if (!activeLogLead) return;
    setRequestBusy(requestType);
    const result = await createAdminRequestAction(activeLogLead.id, {
      requestType,
      contactPersonName: cleanText(logDraft.contactPersonName),
      summary: buildAdminRequestSummary(requestType, logDraft),
      dueAt: normalizeDateTime(logDraft.followUpAt),
      nextStep: cleanText(logDraft.nextStep),
    });
    if ("error" in result) {
      flash(result.error ?? "Unable to send to Steve");
    } else {
      flash(result.alreadyExists ? "Already in admin queue" : "Sent to Steve");
      setActiveLogLead((lead) => lead ? {
        ...lead,
        open_website_request_id: requestType === "website_request" ? result.request.id : lead.open_website_request_id,
        open_quote_request_id: requestType === "quote_request" ? result.request.id : lead.open_quote_request_id,
      } : lead);
    }
    router.refresh();
    setRequestBusy(null);
  };

  return (
    <PageShell
      title="Workbench"
      description="Work the leads you own, log every touch, and keep follow-ups visible for the team."
      stats={[
        { label: "My Claimed", value: String(workbench.summary.myClaimed) },
        { label: "Due Today", value: String(workbench.summary.dueToday) },
        { label: "Contacts This Week", value: String(workbench.summary.contactedThisWeek) },
      ]}
    >
      {message && (
        <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(99,102,241,0.1)", color: "var(--text-primary)" }}>
          {message}
        </div>
      )}

      <section className="glass rounded-2xl p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="section-label">Your next action</h3>
            <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
              Start here, then use Log outcome after every call, text, email, or in-person visit.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/leads?assigned=me" className="btn-glass text-sm">Open My Leads</Link>
            <Link href="/explore" className="btn-primary text-sm">Find Leads</Link>
          </div>
        </div>
        {workbench.nextAction ? (
          <LeadActionCard
            lead={workbench.nextAction}
            scoreThresholds={scoreThresholds}
            busy={busyLeadId === workbench.nextAction.id}
            currentUserId={currentUser.userId}
            onClaim={claimLead}
            onRelease={releaseLead}
            onOpenLogSheet={openLogSheet}
            prominent
          />
        ) : (
          <EmptyState text="No claimed lead needs action yet. Use Lead Explorer to find and claim your next lead." />
        )}
      </section>

      <section className="glass rounded-2xl p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="section-label">My claimed leads</h3>
            <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
              This page only shows leads assigned to you.
            </p>
          </div>
          <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>{workbench.myLeads.length}</span>
        </div>
        <LeadList
          leads={workbench.myLeads}
          scoreThresholds={scoreThresholds}
          busyLeadId={busyLeadId}
          currentUserId={currentUser.userId}
          onClaim={claimLead}
          onRelease={releaseLead}
          onOpenLogSheet={openLogSheet}
          emptyText="You have no claimed leads. Use Lead Explorer to claim one."
        />
      </section>

      <LogOutcomeSheet
        lead={activeLogLead}
        draft={logDraft}
        busy={Boolean(activeLogLead && busyLeadId === activeLogLead.id)}
        requestBusy={requestBusy}
        onChange={setLogDraft}
        onClose={closeLogSheet}
        onSubmit={submitLog}
        onSendToSteve={sendToSteve}
      />
    </PageShell>
  );
}

function LeadList({
  leads,
  scoreThresholds,
  busyLeadId,
  currentUserId,
  onClaim,
  onRelease,
  onOpenLogSheet,
  emptyText,
}: {
  leads: QueueLead[];
  scoreThresholds: ScoreBandThresholds;
  busyLeadId: string | null;
  currentUserId: string;
  onClaim: (leadId: string) => void;
  onRelease: (leadId: string) => void;
  onOpenLogSheet: (lead: QueueLead, channel: ContactChannel) => void;
  emptyText: string;
}) {
  if (leads.length === 0) return <EmptyState text={emptyText} />;
  return (
    <div className="space-y-3">
      {leads.map((lead) => (
        <LeadActionCard
          key={lead.id}
          lead={lead}
          scoreThresholds={scoreThresholds}
          busy={busyLeadId === lead.id}
          currentUserId={currentUserId}
          onClaim={onClaim}
          onRelease={onRelease}
          onOpenLogSheet={onOpenLogSheet}
        />
      ))}
    </div>
  );
}

function LeadActionCard({
  lead,
  scoreThresholds,
  busy,
  currentUserId,
  onClaim,
  onRelease,
  onOpenLogSheet,
  prominent = false,
}: {
  lead: QueueLead;
  scoreThresholds: ScoreBandThresholds;
  busy: boolean;
  currentUserId: string;
  onClaim: (leadId: string) => void;
  onRelease: (leadId: string) => void;
  onOpenLogSheet: (lead: QueueLead, channel: ContactChannel) => void;
  prominent?: boolean;
}) {
  const isMine = lead.assigned_to_user_id === currentUserId;
  const isTaken = Boolean(lead.assigned_to_user_id && !isMine);

  return (
    <article
      className="rounded-xl p-3 sm:p-4"
      style={{ background: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.55)" }}
    >
      <div className="space-y-3">
        <div className="min-w-0">
          <Link
            href={`/leads/${lead.id}`}
            className={`${prominent ? "text-lg" : "text-base"} link-accent block break-words font-semibold leading-snug`}
          >
            {lead.name ?? "Unknown business"}
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ScoreBandBadge score={lead.score} thresholds={scoreThresholds} compact={!prominent} />
            <OwnerBadge lead={lead} currentUserId={currentUserId} />
          </div>
        </div>

        <div className="space-y-2">
          <p className="break-words text-sm" style={{ color: "var(--text-secondary)" }}>{lead.address ?? "No address"}</p>
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>
            {lead.next_best_action ?? lead.quality_reason ?? "Call and confirm owner interest."}
          </p>
          <div className="flex flex-wrap gap-2">
            <MetaChip label={lead.phone ?? "No phone"} />
            <MetaChip label={lead.website_status.replace(/_/g, " ")} />
            <MetaChip label={lead.rating ? `${lead.rating.toFixed(1)} rating` : "No rating"} />
            <MetaChip label={`${lead.review_count ?? 0} reviews`} />
            {lead.reminder_date && <MetaChip label={`Follow-up ${formatDate(lead.reminder_date)}`} />}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t pt-3" style={{ borderColor: "rgba(255,255,255,0.45)" }}>
          {!lead.assigned_to_user_id && (
            <ActionWithHelp help="Assigns this lead to you so teammates know you own the next outreach step.">
              <button type="button" className="btn-primary flex-1 text-sm sm:flex-none" disabled={busy} onClick={() => onClaim(lead.id)}>
                {busy ? "Claiming..." : "Claim"}
              </button>
            </ActionWithHelp>
          )}
          {isMine && (
            <ActionWithHelp help="Removes your ownership and returns the lead to the unclaimed pool.">
              <button type="button" className="btn-glass flex-1 text-sm sm:flex-none" disabled={busy} onClick={() => onRelease(lead.id)}>
                Release
              </button>
            </ActionWithHelp>
          )}
          <Link href={`/leads/${lead.id}`} className="btn-glass flex-1 text-sm sm:flex-none">Open</Link>
          {isMine && (
            <ActionWithHelp help="Records what happened and keeps follow-ups visible to the team.">
              <button type="button" className="btn-glass flex-1 text-sm sm:flex-none" disabled={busy} onClick={() => onOpenLogSheet(lead, "call")}>
                Log outcome
              </button>
            </ActionWithHelp>
          )}
        </div>

        {isMine && (
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {lead.phone && <a className="btn-primary text-sm" href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`}>Call</a>}
            <button type="button" className="btn-glass text-sm" disabled={busy} onClick={() => onOpenLogSheet(lead, "text")}>Text</button>
            <button type="button" className="btn-glass text-sm" disabled={busy} onClick={() => onOpenLogSheet(lead, "email")}>Email</button>
            <button type="button" className="btn-glass text-sm" disabled={busy} onClick={() => onOpenLogSheet(lead, "walkin")}>In person</button>
          </div>
        )}
        {isTaken && (
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
            This lead is already owned by {ownerName(lead)}.
          </p>
        )}
      </div>
    </article>
  );
}

function LogOutcomeSheet({
  lead,
  draft,
  busy,
  requestBusy,
  onChange,
  onClose,
  onSubmit,
  onSendToSteve,
}: {
  lead: QueueLead | null;
  draft: LogDraft;
  busy: boolean;
  requestBusy: AdminRequestType | null;
  onChange: (draft: LogDraft) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSendToSteve: (requestType: AdminRequestType) => void;
}) {
  if (!lead) return null;

  const update = <Key extends keyof LogDraft>(key: Key, value: LogDraft[Key]) => {
    onChange({ ...draft, [key]: value });
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 px-3 py-4 sm:items-center">
      <form
        onSubmit={onSubmit}
        className="glass-lg max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl p-5"
        style={{ background: "rgba(255,255,255,0.98)", boxShadow: "0 24px 80px rgba(15,23,42,0.28)" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="workbench-log-outcome-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id="workbench-log-outcome-title" className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Log outcome</h3>
            <p className="mt-1 break-words text-sm" style={{ color: "var(--text-secondary)" }}>
              {lead.name ?? "Unknown business"}
            </p>
          </div>
          <button type="button" className="btn-glass text-sm" onClick={onClose} disabled={busy}>Close</button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>Channel</span>
            <select className="glass-select" value={draft.channel} onChange={(event) => update("channel", event.target.value as ContactChannel)}>
              <option value="call">Call</option>
              <option value="text">Text</option>
              <option value="email">Email</option>
              <option value="walkin">In person</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>Outcome</span>
            <select className="glass-select" value={draft.outcome} onChange={(event) => update("outcome", event.target.value as OutreachOutcome)}>
              {OUTCOME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="mt-3 flex flex-col gap-1">
          <span className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>Contact person</span>
          <input
            className="glass-input"
            value={draft.contactPersonName}
            onChange={(event) => update("contactPersonName", event.target.value)}
            placeholder="Owner, manager, front desk..."
          />
        </label>

        <label className="mt-3 flex flex-col gap-1">
          <span className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>Note</span>
          <textarea
            className="glass-input min-h-24 resize-y"
            value={draft.note}
            onChange={(event) => update("note", event.target.value)}
            placeholder="What happened?"
          />
        </label>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>Follow-up date/time</span>
            <input
              type="datetime-local"
              className="glass-input"
              value={draft.followUpAt}
              onChange={(event) => update("followUpAt", event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>Next step</span>
            <input
              className="glass-input"
              value={draft.nextStep}
              onChange={(event) => update("nextStep", event.target.value)}
              placeholder="Send demo, call back, visit..."
            />
          </label>
        </div>

        <div className="mt-4 rounded-xl p-4" style={{ background: "rgba(238,242,255,0.96)", border: "1px solid rgba(99,102,241,0.18)" }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Send to Steve</h4>
              <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                Use this when the lead needs a website or a quote from the admin queue.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <AdminRequestButton
                label="Website needed"
                help="Creates one admin fulfillment item for a website build request."
                alreadyQueued={Boolean(lead.open_website_request_id)}
                busy={requestBusy === "website_request"}
                disabled={busy || Boolean(requestBusy)}
                onClick={() => onSendToSteve("website_request")}
              />
              <AdminRequestButton
                label="Quote requested"
                help="Creates one admin fulfillment item for a price or scope quote."
                alreadyQueued={Boolean(lead.open_quote_request_id)}
                busy={requestBusy === "quote_request"}
                disabled={busy || Boolean(requestBusy)}
                onClick={() => onSendToSteve("quote_request")}
              />
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-glass text-sm" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn-primary text-sm" disabled={busy}>
            {busy ? "Logging..." : "Log outcome"}
          </button>
        </div>
      </form>
    </div>
  );
}

function AdminRequestButton({
  label,
  help,
  alreadyQueued,
  busy,
  disabled,
  onClick,
}: {
  label: string;
  help: string;
  alreadyQueued: boolean;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <ActionWithHelp help={help}>
      <button type="button" className="btn-glass text-sm" disabled={disabled || alreadyQueued} onClick={onClick}>
        {alreadyQueued ? "Already in admin queue" : busy ? "Sending..." : label}
      </button>
    </ActionWithHelp>
  );
}

function ActionWithHelp({ children, help }: { children: React.ReactNode; help: string }) {
  return (
    <span className="inline-flex flex-1 items-center gap-1.5 sm:flex-none">
      {children}
      <HelpTip>{help}</HelpTip>
    </span>
  );
}

function OwnerBadge({ lead, currentUserId }: { lead: QueueLead; currentUserId: string }) {
  const label = !lead.assigned_to_user_id
    ? "Unclaimed"
    : lead.assigned_to_user_id === currentUserId
      ? "Mine"
      : ownerName(lead);
  const mine = lead.assigned_to_user_id === currentUserId;
  const color = !lead.assigned_to_user_id
    ? { bg: "rgba(107,114,128,0.1)", text: "#4b5563" }
    : mine
      ? { bg: "rgba(34,197,94,0.12)", text: "#166534" }
      : { bg: "rgba(245,158,11,0.12)", text: "#92400e" };
  return (
    <span className="rounded-md px-2 py-1 text-xs font-semibold" style={{ background: color.bg, color: color.text }}>
      {label}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl p-5 text-center text-sm" style={{ background: "rgba(255,255,255,0.35)", color: "var(--text-tertiary)" }}>
      {text}
    </div>
  );
}

function ownerName(lead: QueueLead): string {
  return lead.assigned_user_display_name || lead.assigned_user_email || "another researcher";
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function MetaChip({ label }: { label: string }) {
  return (
    <span
      className="max-w-full break-words rounded-md px-2 py-1 text-xs"
      style={{ background: "rgba(255,255,255,0.45)", color: "var(--text-tertiary)" }}
    >
      {label}
    </span>
  );
}

function createLogDraft(channel: ContactChannel, nextStep = ""): LogDraft {
  return {
    channel,
    outcome: channel === "call" ? "contacted" : "follow_up_needed",
    contactPersonName: "",
    note: "",
    followUpAt: "",
    nextStep,
  };
}

function cleanText(value: string): string {
  const clean = value.trim();
  return clean;
}

function normalizeDateTime(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function buildAdminRequestSummary(requestType: AdminRequestType, draft: LogDraft): string {
  const parts = [
    requestType === "website_request" ? "Website needed." : "Quote requested.",
    draft.contactPersonName.trim() ? `Contact: ${draft.contactPersonName.trim()}.` : null,
    draft.note.trim() || null,
  ].filter(Boolean);
  return parts.join(" ");
}
