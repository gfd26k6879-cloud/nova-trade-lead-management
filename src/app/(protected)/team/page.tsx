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
  const claimed = summary.members.reduce((sum, member) => sum + member.claimed_active, 0);
  const fulfillmentOpen = summary.members.reduce((sum, member) => sum + member.fulfillment_open, 0);

  return (
    <PageShell
      title="Team Board"
      description="See ownership, follow-ups, and recent outreach across the team."
      stats={[
        { label: "Claimed Active", value: String(claimed) },
        { label: "Unclaimed Ready", value: String(summary.unassignedReady) },
        { label: "Overdue Follow-ups", value: String(summary.overdueFollowUps) },
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
                  <td colSpan={11}>No active team members yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="glass rounded-2xl p-5">
        <h3 className="section-label">Latest activity</h3>
        <div className="mt-4 space-y-3">
          {summary.latestActivity.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No outreach activity yet.</p>
          ) : summary.latestActivity.map((activity) => (
            <article
              key={activity.id}
              className="rounded-xl px-4 py-3"
              style={{ background: "var(--surface-card)", border: "1px solid var(--surface-card-border)" }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link className="link-accent font-medium" href={`/leads/${activity.lead_id}`} prefetch={false}>
                  {activity.lead_name ?? "Unknown lead"}
                </Link>
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  {new Date(activity.created_at).toLocaleString()}
                </span>
              </div>
              <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                {activity.actor_email ?? "Someone"} logged {channelLabel(activity.channel)} as {activity.outcome.replace(/_/g, " ")}.
              </p>
              {activity.note && (
                <p className="mt-2 text-sm" style={{ color: "var(--text-primary)" }}>{activity.note}</p>
              )}
            </article>
          ))}
        </div>
      </section>
    </PageShell>
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

      <section className="glass rounded-2xl p-5">
        <h3 className="section-label">My latest activity</h3>
        <div className="mt-4 space-y-3">
          {summary.latestActivity.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No outreach activity logged by you yet.</p>
          ) : summary.latestActivity.map((activity) => (
            <article
              key={activity.id}
              className="rounded-xl px-4 py-3"
              style={{ background: "var(--surface-card)", border: "1px solid var(--surface-card-border)" }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link className="link-accent font-medium" href={`/leads/${activity.lead_id}`} prefetch={false}>
                  {activity.lead_name ?? "Unknown lead"}
                </Link>
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  {new Date(activity.created_at).toLocaleString()}
                </span>
              </div>
              <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                You logged {channelLabel(activity.channel)} as {activity.outcome.replace(/_/g, " ")}.
              </p>
              {activity.note && (
                <p className="mt-2 text-sm" style={{ color: "var(--text-primary)" }}>{activity.note}</p>
              )}
            </article>
          ))}
        </div>
      </section>
    </PageShell>
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

function channelLabel(channel: string): string {
  return channel === "walkin" ? "in person" : channel;
}

function teamLabel(member: { is_team_lead: boolean; team_label: string | null; team_lead_display_name: string | null; team_lead_email: string | null }): string {
  if (member.is_team_lead) return member.team_label || "Team lead";
  return member.team_lead_display_name || member.team_lead_email || "No team";
}
