import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { isDbStatementTimeoutError, isTransientDbError, withDbStatementTimeout } from "@/lib/db/index";
import { ensureDbReady, getResearcherTeamBoardSummary, getTeamBoardSummary, type TeamBoardSummary } from "@/lib/db/queries";
import { PageShell } from "@/components/page-shell";
import { startRouteTiming } from "@/lib/route-timing";

export const metadata: Metadata = { title: "Team Board | NoSite Leads" };

export default async function TeamBoardPage() {
  const logRouteTiming = startRouteTiming("/team");
  const session = await requirePermission("view:workspace");
  let summary: TeamBoardSummary;
  try {
    summary = await withDbStatementTimeout(10_000, async () => {
      await ensureDbReady();
      return session.role === "admin" ? getTeamBoardSummary() : getResearcherTeamBoardSummary(session.userId);
    });
    logRouteTiming(200);
  } catch (error) {
    const reason = routeFailureReason(error);
    logRouteTiming(503, { reason });
    return <TeamUnavailable reason={reason} canOpenDashboard={session.role === "admin"} />;
  }

  if (session.role !== "admin") {
    return <ResearcherTeamBoard summary={summary} />;
  }

  const contacts7d = summary.members.reduce((sum, member) => sum + member.contacts_7d, 0);
  const activityToday = summary.members.reduce((sum, member) => sum + member.activity_today, 0);
  const contactsToday = summary.members.reduce((sum, member) => sum + member.contacts_today, 0);
  const callsToday = summary.members.reduce((sum, member) => sum + member.calls_today, 0);
  const decisionMakersToday = summary.members.reduce((sum, member) => sum + member.decision_makers_today, 0);
  const claimed = summary.members.reduce((sum, member) => sum + member.claimed_active, 0);
  const fulfillmentOpen = summary.members.reduce((sum, member) => sum + member.fulfillment_open, 0);
  const activeTodayMembers = summary.members.filter((member) =>
    member.activity_today > 0 ||
    member.contacts_today > 0 ||
    member.calls_today > 0 ||
    member.decision_makers_today > 0 ||
    member.followups_set_today > 0
  );

  return (
    <PageShell
      title="Team Board"
      description="See ownership, follow-ups, and recent outreach across the team."
      stats={[
        { label: "Claimed Active", value: String(claimed) },
        { label: "Unclaimed Ready", value: String(summary.unassignedReady) },
        { label: "Overdue Follow-ups", value: String(summary.overdueFollowUps) },
        { label: "Activity Today", value: String(activityToday) },
        { label: "Contacts Today", value: String(contactsToday) },
        { label: "Calls Today", value: String(callsToday) },
        { label: "Decision Makers", value: String(decisionMakersToday) },
        { label: "Contacts 7 Days", value: String(contacts7d) },
        { label: "Steve Queue", value: String(fulfillmentOpen) },
      ]}
    >
      <section className="glass rounded-2xl p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="section-label">Team workload</h3>
          <Link href="/explore?assigned=unassigned&sortBy=opportunity" className="btn-glass text-sm">Open unclaimed leads</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="glass-table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Team</th>
                <th>Claimed</th>
                <th>Due Today</th>
                <th>Stale</th>
                <th>Today</th>
                <th>Contacts 7d</th>
                <th>Meetings</th>
                <th>Steve Queue</th>
                <th>Web / Quote</th>
                <th>Won</th>
                <th>Lost</th>
              </tr>
            </thead>
            <tbody>
              {summary.members.map((member) => (
                <tr key={member.user_id}>
                  <td>
                    <Link className="link-accent font-medium" href={`/leads?owner=${encodeURIComponent(member.user_id)}`}>
                      {member.display_name || member.email}
                    </Link>
                    <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                      {member.role}{member.is_team_lead ? " · team lead" : ""}
                    </div>
                  </td>
                  <td>{teamLabel(member)}</td>
                  <td>{member.claimed_active}</td>
                  <td>{member.due_today}</td>
                  <td>{member.stale_claimed}</td>
                  <td>
                    <div className="whitespace-nowrap text-sm">
                      <span className="font-medium" style={{ color: "var(--text-primary)" }}>{member.activity_today}</span>
                      <span style={{ color: "var(--text-tertiary)" }}> actions</span>
                    </div>
                    <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                      {member.contacts_today} contacts · {member.calls_today} calls · {member.decision_makers_today} decision makers · {member.followups_set_today} follow-ups
                    </div>
                  </td>
                  <td>{member.contacts_7d}</td>
                  <td>{member.meetings}</td>
                  <td>{member.fulfillment_open}</td>
                  <td>{member.website_requests_open} / {member.quote_requests_open}</td>
                  <td>{member.closed_won}</td>
                  <td>{member.closed_lost}</td>
                </tr>
              ))}
              {summary.members.length === 0 && (
                <tr>
                  <td colSpan={12}>No active team members yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="glass rounded-2xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="section-label">Today by researcher</h3>
            <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
              Calls, notes, review requests, follow-ups, and logged outcomes from today.
            </p>
          </div>
          <span className="rounded-lg px-2 py-1 text-xs" style={{ background: "var(--surface-card)", border: "1px solid var(--surface-card-border)", color: "var(--text-tertiary)" }}>
            {summary.todayActivity.length} logged today
          </span>
        </div>
        {activeTodayMembers.length === 0 ? (
          <p className="mt-4 rounded-xl p-4 text-sm" style={{ background: "var(--surface-card)", border: "1px solid var(--surface-card-border)", color: "var(--text-tertiary)" }}>
            No team activity has been logged today.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {activeTodayMembers.map((member) => (
              <TodayMemberCard key={member.user_id} member={member} />
            ))}
          </div>
        )}
      </section>

      <ActivityLog
        title="Today's activity log"
        description="Every logged call, note, request, and operational update from today with the details attached."
        activities={summary.todayActivity}
        emptyMessage="No activity has been logged today."
        showActor
      />

      <ActivityLog
        title="Latest activity"
        description="Recent outreach and operational updates across the team, including older entries."
        activities={summary.latestActivity}
        emptyMessage="No outreach activity yet."
        showActor
      />
    </PageShell>
  );
}

function TodayMemberCard({ member }: { member: TeamBoardSummary["members"][number] }) {
  return (
    <article className="rounded-xl p-4" style={{ background: "var(--surface-card)", border: "1px solid var(--surface-card-border)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold" style={{ color: "var(--text-primary)" }}>{member.display_name || member.email}</p>
          <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>{teamLabel(member)}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl font-semibold leading-none" style={{ color: "var(--text-primary)" }}>{member.activity_today}</p>
          <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>actions</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <ResearcherMetric label="Contacts" value={member.contacts_today} />
        <ResearcherMetric label="Calls" value={member.calls_today} />
        <ResearcherMetric label="Reached" value={member.decision_makers_today} />
        <ResearcherMetric label="Follow-ups" value={member.followups_set_today} />
      </div>
    </article>
  );
}

function ResearcherTeamBoard({ summary }: { summary: TeamBoardSummary }) {
  const member = summary.members[0] ?? null;
  return (
    <PageShell
      title="My Team Board"
      description="Your claimed leads, follow-ups, and recent outreach."
    >
      <section className="glass rounded-2xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="section-label">My workload</h3>
            <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
              Your assigned leads and follow-ups. Team-wide workload is admin-only.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/queue" className="btn-primary text-sm">Open Workbench</Link>
            <Link href="/leads?assigned=me" className="btn-glass text-sm">My leads</Link>
            <Link href="/explore" className="btn-glass text-sm">Explore</Link>
          </div>
        </div>
        {member ? (
          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <ResearcherMetric label="Claimed active" value={member.claimed_active} />
            <ResearcherMetric label="Due today" value={member.due_today} />
            <ResearcherMetric label="Activity today" value={member.activity_today} />
            <ResearcherMetric label="Contacts today" value={member.contacts_today} />
            <ResearcherMetric label="Calls today" value={member.calls_today} />
            <ResearcherMetric label="Decision makers" value={member.decision_makers_today} />
            <ResearcherMetric label="Follow-ups set" value={member.followups_set_today} />
            <ResearcherMetric label="Stale claimed" value={member.stale_claimed} />
            <ResearcherMetric label="Contacts 7d" value={member.contacts_7d} />
            <ResearcherMetric label="Meetings" value={member.meetings} />
            <ResearcherMetric label="Steve queue" value={member.fulfillment_open} />
            <ResearcherMetric label="Website requests" value={member.website_requests_open} />
            <ResearcherMetric label="Quote requests" value={member.quote_requests_open} />
          </div>
        ) : (
          <p className="mt-5 rounded-xl p-4 text-sm" style={{ background: "var(--surface-card)", border: "1px solid var(--surface-card-border)", color: "var(--text-tertiary)" }}>
            Your researcher profile is active, but no workload row was found yet.
          </p>
        )}
      </section>

      <ActivityLog
        title="My activity today"
        description="Your logged calls, notes, requests, and follow-ups from today."
        activities={summary.todayActivity}
        emptyMessage="No activity logged by you today."
      />

      <ActivityLog
        title="My latest activity"
        description="Your recent outreach and operational updates, including older entries."
        activities={summary.latestActivity}
        emptyMessage="No activity logged by you yet."
      />
    </PageShell>
  );
}

function ActivityLog({
  title,
  description,
  activities,
  emptyMessage,
  showActor = false,
}: {
  title: string;
  description: string;
  activities: TeamBoardSummary["latestActivity"];
  emptyMessage: string;
  showActor?: boolean;
}) {
  return (
    <section className="glass rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="section-label">{title}</h3>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>{description}</p>
        </div>
        <span className="rounded-lg px-2 py-1 text-xs" style={{ background: "var(--surface-card)", border: "1px solid var(--surface-card-border)", color: "var(--text-tertiary)" }}>
          {activities.length} entries
        </span>
      </div>
      <div className="mt-4 space-y-3">
        {activities.length === 0 ? (
          <p className="rounded-xl p-4 text-sm" style={{ background: "var(--surface-card)", border: "1px solid var(--surface-card-border)", color: "var(--text-tertiary)" }}>
            {emptyMessage}
          </p>
        ) : activities.map((activity) => (
          <ActivityCard key={activity.id} activity={activity} showActor={showActor} />
        ))}
      </div>
    </section>
  );
}

function ActivityCard({ activity, showActor }: { activity: TeamBoardSummary["latestActivity"][number]; showActor: boolean }) {
  const actor = showActor ? activity.actor_display_name || activity.actor_email || "Someone" : "You";
  const details = activityDetails(activity);

  return (
    <article
      className="rounded-xl px-4 py-3"
      style={{ background: "var(--surface-card)", border: "1px solid var(--surface-card-border)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {activity.lead_id ? (
            <Link className="link-accent break-words font-medium" href={`/leads/${activity.lead_id}`} prefetch={false}>
              {activity.lead_name ?? "Unknown lead"}
            </Link>
          ) : (
            <p className="break-words font-medium" style={{ color: "var(--text-primary)" }}>
              {activity.lead_name ?? activityTitle(activity)}
            </p>
          )}
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            {actor} {activityVerb(activity)}.
          </p>
        </div>
        <span className="shrink-0 text-xs" style={{ color: "var(--text-tertiary)" }}>
          {formatDateTime(activity.created_at)}
        </span>
      </div>
      {details.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {details.map((detail) => (
            <span key={detail} className="rounded-lg px-2 py-1 text-xs" style={{ background: "rgba(255,255,255,0.35)", color: "var(--text-secondary)", border: "1px solid rgba(255,255,255,0.45)" }}>
              {detail}
            </span>
          ))}
        </div>
      )}
      {activity.note && (
        <p className="mt-3 text-sm" style={{ color: "var(--text-primary)" }}>{activity.note}</p>
      )}
      {!activity.note && activity.summary && (
        <p className="mt-3 text-sm" style={{ color: "var(--text-primary)" }}>{activity.summary}</p>
      )}
      {activity.next_step && (
        <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
          <span className="font-medium" style={{ color: "var(--text-primary)" }}>Next:</span> {activity.next_step}
        </p>
      )}
    </article>
  );
}

function ResearcherMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: "var(--surface-card)", border: "1px solid var(--surface-card-border)" }}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-xs" style={{ color: "var(--text-secondary)" }}>{label}</span>
        <p className="text-lg font-semibold leading-none" style={{ color: "var(--text-primary)" }}>{value}</p>
      </div>
    </div>
  );
}

function routeFailureReason(error: unknown): string {
  if (isDbStatementTimeoutError(error)) return "db_statement_timeout";
  if (isTransientDbError(error)) return "transient_db_error";
  return "team_load_error";
}

function TeamUnavailable({ reason, canOpenDashboard }: { reason: string; canOpenDashboard: boolean }) {
  return (
    <PageShell
      title="Team Board"
      description="See ownership, follow-ups, and recent outreach across the team."
      stats={[
        { label: "Claimed Active", value: "0" },
        { label: "Unclaimed Ready", value: "0" },
        { label: "Overdue Follow-ups", value: "0" },
        { label: "Contacts 7 Days", value: "0" },
        { label: "Steve Queue", value: "0" },
      ]}
    >
      <section className="glass rounded-2xl p-6">
        <p className="section-label">Team board is taking too long to load.</p>
        <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
          Team workload data is temporarily unavailable, but the rest of the workspace can still be used.
        </p>
        <p className="mt-2 text-xs" style={{ color: "var(--text-tertiary)" }}>Diagnostic: {reason}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/team" className="btn-primary text-sm">Retry Team Board</Link>
          {canOpenDashboard && <Link href="/dashboard" className="btn-glass text-sm">Open Dashboard</Link>}
        </div>
      </section>
    </PageShell>
  );
}

function activityDetails(activity: TeamBoardSummary["latestActivity"][number]): string[] {
  const details: string[] = [];
  if (activity.contact_person_name || activity.contact_person_role) {
    details.push([
      activity.contact_person_name,
      activity.contact_person_role ? `(${activity.contact_person_role})` : null,
    ].filter(Boolean).join(" "));
  }
  if (activity.decision_maker_reached) details.push("Decision maker reached");
  if (activity.follow_up_at) details.push(`Follow-up ${formatDateOnly(activity.follow_up_at)}`);
  if (activity.objection_reason) details.push(`Objection: ${activity.objection_reason}`);
  if (activity.quoted_amount > 0) details.push(`Quote ${formatMoney(activity.quoted_amount)}`);
  if (activity.close_value > 0) details.push(`Close ${formatMoney(activity.close_value)}`);
  if (activity.activity_type === "audit") {
    const status = metadataText(activity.metadata.status);
    const reason = metadataText(activity.metadata.reason);
    const workAction = metadataText(activity.metadata.action);
    if (status) details.push(`Status ${formatOutcome(status)}`);
    if (workAction) details.push(`Action ${formatOutcome(workAction)}`);
    if (reason) details.push(`Reason: ${reason}`);
  }
  return details;
}

function activityTitle(activity: TeamBoardSummary["latestActivity"][number]): string {
  if (activity.activity_type === "admin_request") return "Admin request";
  if (activity.activity_type === "note") return "Lead note";
  return formatOutcome(activity.action || activity.outcome || "Activity");
}

function activityVerb(activity: TeamBoardSummary["latestActivity"][number]): string {
  if (activity.activity_type === "outreach") {
    return `logged ${channelLabel(activity.channel)} as ${formatOutcome(activity.outcome)}`;
  }
  if (activity.activity_type === "note") return "added a note";
  if (activity.activity_type === "admin_request") {
    return `created a ${formatOutcome(activity.channel)} (${formatOutcome(activity.outcome)})`;
  }
  return `recorded ${formatOutcome(activity.action || activity.outcome || "activity")}`;
}

function metadataText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatOutcome(outcome: string): string {
  return outcome.replace(/_/g, " ");
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatDateOnly(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

function channelLabel(channel: string): string {
  return channel === "walkin" ? "in person" : channel;
}

function teamLabel(member: { is_team_lead: boolean; team_label: string | null; team_lead_display_name: string | null; team_lead_email: string | null }): string {
  if (member.is_team_lead) return member.team_label || "Team lead";
  return member.team_lead_display_name || member.team_lead_email || "No team";
}
