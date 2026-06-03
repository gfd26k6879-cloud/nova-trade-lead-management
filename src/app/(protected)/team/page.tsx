import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { isDbStatementTimeoutError, isTransientDbError, withDbStatementTimeout } from "@/lib/db/index";
import { ensureDbReady, getTeamBoardSummary, type TeamBoardSummary } from "@/lib/db/queries";
import { PageShell } from "@/components/page-shell";
import { startRouteTiming } from "@/lib/route-timing";

export const metadata: Metadata = { title: "Team Board | NoSite Leads" };

export default async function TeamBoardPage() {
  const logRouteTiming = startRouteTiming("/team");
  await requirePermission("view:workspace");
  let summary: TeamBoardSummary;
  try {
    summary = await withDbStatementTimeout(10_000, async () => {
      await ensureDbReady();
      return getTeamBoardSummary();
    });
    logRouteTiming(200);
  } catch (error) {
    const reason = routeFailureReason(error);
    logRouteTiming(503, { reason });
    return <TeamUnavailable reason={reason} />;
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
              style={{ background: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.5)" }}
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

function routeFailureReason(error: unknown): string {
  if (isDbStatementTimeoutError(error)) return "db_statement_timeout";
  if (isTransientDbError(error)) return "transient_db_error";
  return "team_load_error";
}

function TeamUnavailable({ reason }: { reason: string }) {
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
          <Link href="/dashboard" className="btn-glass text-sm">Open Dashboard</Link>
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
