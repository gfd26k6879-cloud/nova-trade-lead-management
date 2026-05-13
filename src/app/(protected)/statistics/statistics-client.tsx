"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import type { StatisticsSummary } from "@/lib/db/queries";

const RANGE_OPTIONS = [
  { value: "all", label: "All Time" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "month", label: "This Month" },
  { value: "custom", label: "Custom" },
];

export function StatisticsClient({ summary }: { summary: StatisticsSummary }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedRange = searchParams.get("range") ?? summary.range.range;
  const from = searchParams.get("from") ?? summary.range.from ?? "";
  const to = searchParams.get("to") ?? "";

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    if (key === "range" && value !== "custom") {
      params.delete("from");
      params.delete("to");
    }
    router.push(`/statistics?${params.toString()}`);
  };

  const maxBusinessTotal = Math.max(...summary.businessTypes.map((row) => row.total), 1);

  return (
    <PageShell
      title="Statistics"
      description="Lead quality, funnel performance, business types, data coverage, and crawl economics."
      stats={[
        { label: "Range", value: summary.range.label },
        { label: "Discovered", value: String(summary.kpis.totalDiscovered) },
        { label: "Qualified", value: String(summary.kpis.qualifiedLeads) },
        { label: "Pipeline", value: formatCurrency(summary.economics.pipelineValue) },
      ]}
    >
      <section className="glass rounded-2xl p-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>Date Range</span>
            <select className="glass-select" aria-label="Statistics date range" value={selectedRange} onChange={(e) => updateParam("range", e.target.value)}>
              {RANGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          {selectedRange === "custom" && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>From</span>
                <input type="date" className="glass-input" value={from} onChange={(e) => updateParam("from", e.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>To</span>
                <input type="date" className="glass-input" value={to} onChange={(e) => updateParam("to", e.target.value)} />
              </label>
            </>
          )}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Active Leads" value={summary.kpis.activeLeads} />
        <MetricCard label="Queue Candidates" value={summary.kpis.queueCandidates} />
        <MetricCard label="Excluded" value={summary.kpis.excludedLeads} />
        <MetricCard label="Demos Created" value={summary.kpis.demosCreated} />
        <MetricCard label="Meetings" value={summary.kpis.meetings} />
        <MetricCard label="Contacted" value={summary.kpis.contactedLeads} />
        <MetricCard label="Replies" value={summary.kpis.replies} />
        <MetricCard label="Closed Won" value={summary.kpis.closedWon} />
        <MetricCard label="Closed Lost" value={summary.kpis.closedLost} />
        <MetricCard label="Avg Deal" value={formatCurrency(summary.economics.averageDealValue)} />
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        <MetricCard label="API Cost" value={formatCurrency(summary.economics.apiCost)} sub={`${summary.economics.apiCalls} billable calls`} />
        <MetricCard label="Cost / Qualified" value={formatNullableCurrency(summary.economics.costPerQualifiedLead)} />
        <MetricCard label="Cost / Contacted" value={formatNullableCurrency(summary.economics.costPerContactedLead)} />
        <MetricCard label="Cost / Meeting" value={formatNullableCurrency(summary.economics.costPerMeeting)} />
      </section>

      <section className="grid gap-4 lg:grid-cols-5">
        <MetricCard label="AI Spend" value={formatNullableCurrency(summary.ai.cost)} sub={`${summary.ai.calls} model calls`} />
        <MetricCard label="AI Verifications" value={summary.ai.verifications} sub={`${summary.ai.cachedResults} cache hits`} />
        <MetricCard label="AI Usable Sites" value={summary.ai.usableSiteFound} sub={`${summary.ai.uncertain} uncertain or mismatch`} />
        <MetricCard label="AI Opportunities" value={summary.ai.websiteOpportunityFound} sub={`${summary.ai.weakSiteFound} weak, broken, or parked`} />
        <MetricCard label="Cost / AI Verified" value={formatNullableCurrency(summary.ai.costPerVerification)} />
      </section>

      <section className="grid gap-4 lg:grid-cols-5">
        <MetricCard label="Ready to Call" value={summary.quality.readyToCall} />
        <MetricCard label="Broken Site Opportunities" value={summary.quality.brokenSiteOpportunities} />
        <MetricCard label="Needs AI Verify" value={summary.quality.needsAiVerify} />
        <MetricCard label="No-Site Rate" value={formatPercent(summary.quality.aiVerifiedNoSiteRate)} />
        <MetricCard label="Usable Site Found Rate" value={formatPercent(summary.quality.usableSiteFoundRate)} />
        <MetricCard label="Broken Site Rate" value={formatPercent(summary.quality.brokenSiteRate)} />
        <MetricCard label="Contacted to Reply" value={formatPercent(summary.quality.contactedToReplyRate)} />
        <MetricCard label="Reply to Meeting" value={formatPercent(summary.quality.replyToMeetingRate)} />
        <MetricCard label="Meeting to Close" value={formatPercent(summary.quality.meetingToCloseRate)} />
        <MetricCard label="Needs Manual Review" value={summary.quality.needsManualReview} />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <QualityValuePanel title="Pipeline by Quality Bucket" rows={summary.quality.pipelineByBucket} valueLabel="Pipeline" />
        <QualityValuePanel title="Top Niches Ready to Call" rows={summary.quality.topReadyByType} valueLabel="Pipeline" />
        <QualityValuePanel title="Top Niches by Fast-Money Value" rows={summary.quality.topValueByType} valueLabel="Pipeline" />
      </section>

      <section className="glass rounded-2xl p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="section-label">Business Type Breakdown</h3>
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Sorted by qualified leads</span>
        </div>
        <div className="overflow-x-auto">
          <table className="glass-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Total</th>
                <th>Active</th>
                <th>Qualified</th>
                <th>Needs Verification</th>
                <th>Excluded</th>
                <th>Website Gap</th>
                <th>Contacted</th>
                <th>Demos</th>
                <th>Meetings</th>
                <th>Pipeline</th>
              </tr>
            </thead>
            <tbody>
              {summary.businessTypes.filter((row) => row.total > 0).map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link className="link-accent font-medium" href={`/leads?businessType=${row.id}`}>
                      {row.label}
                    </Link>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: "rgba(0,0,0,0.06)" }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.max(4, (row.total / maxBusinessTotal) * 100)}%`, background: "var(--accent)" }} />
                    </div>
                  </td>
                  <td>{row.total}</td>
                  <td>{row.active}</td>
                  <td>{row.qualified}</td>
                  <td>{row.needsVerification}</td>
                  <td>{row.excluded}</td>
                  <td>{row.noWebsite + row.socialWebsite + row.basicWebsite}</td>
                  <td>{row.contacted}</td>
                  <td>{row.demos}</td>
                  <td>{row.meetings}</td>
                  <td>{formatCurrency(row.pipelineValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <BreakdownPanel title="Website Status" rows={summary.dataQuality.websiteStatus} />
        <BreakdownPanel title="Qualification Status" rows={summary.dataQuality.qualificationStatus} />
        <BreakdownPanel title="Enrichment Status" rows={summary.dataQuality.enrichmentStatus} />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <BreakdownPanel title="Exclusion Reasons" rows={summary.dataQuality.exclusionReasons} empty="No exclusions in range" />
        <MetricCard
          label="Verification Coverage"
          value={`${summary.dataQuality.verificationAverage}%`}
          sub={`${summary.dataQuality.verificationCheckedLeads} leads have checklist data`}
        />
        <MetricCard
          label="Enrichment Backlog"
          value={summary.operations.enrichmentBacklog}
          sub={`${summary.operations.failedUnits} failed crawl units in range`}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <CostPanel title="API by Endpoint" rows={summary.operations.apiByEndpoint} />
        <CostPanel title="API by SKU" rows={summary.operations.apiBySku} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <BreakdownPanel title="Crawl Runs" rows={summary.operations.crawlRunsByStatus} empty="No crawl runs in range" />
      </section>
    </PageShell>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="glass rounded-2xl px-4 py-3">
      <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{label}</span>
      <p className="mt-1 text-xl font-semibold" style={{ color: "var(--text-primary)" }}>{value}</p>
      {sub && <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{sub}</span>}
    </div>
  );
}

function BreakdownPanel({ title, rows, empty = "No data in range" }: { title: string; rows: Array<{ key: string; label: string; count: number }>; empty?: string }) {
  const max = Math.max(...rows.map((row) => row.count), 1);
  return (
    <section className="glass rounded-2xl p-5">
      <h3 className="section-label">{title}</h3>
      <div className="mt-3 space-y-2">
        {rows.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>{empty}</p>
        ) : rows.map((row) => (
          <div key={row.key}>
            <div className="flex items-center justify-between gap-3 text-xs">
              <span style={{ color: "var(--text-secondary)" }}>{row.label}</span>
              <span className="font-medium" style={{ color: "var(--text-primary)" }}>{row.count}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: "rgba(0,0,0,0.06)" }}>
              <div className="h-full rounded-full" style={{ width: `${Math.max(4, (row.count / max) * 100)}%`, background: "var(--accent)" }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CostPanel({ title, rows }: { title: string; rows: Array<{ key: string; calls: number; cost: number }> }) {
  return (
    <section className="glass rounded-2xl p-5">
      <h3 className="section-label">{title}</h3>
      <div className="mt-3 overflow-x-auto">
        {rows.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No API usage in range</p>
        ) : (
          <table className="glass-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Calls</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td>{row.key.replace(/_/g, " ")}</td>
                  <td>{row.calls}</td>
                  <td>{formatCurrency(row.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function QualityValuePanel({ title, rows, valueLabel }: { title: string; rows: Array<{ key: string; label: string; count: number; value: number }>; valueLabel: string }) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <section className="glass rounded-2xl p-5">
      <h3 className="section-label">{title}</h3>
      <div className="mt-3 space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No quality data in range</p>
        ) : rows.map((row) => (
          <div key={row.key}>
            <div className="flex items-center justify-between gap-3 text-xs">
              <span style={{ color: "var(--text-secondary)" }}>{row.label}</span>
              <span className="font-medium" style={{ color: "var(--text-primary)" }}>{row.count} / {formatCurrency(row.value)}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: "rgba(0,0,0,0.06)" }} aria-label={valueLabel}>
              <div className="h-full rounded-full" style={{ width: `${Math.max(4, (row.value / max) * 100)}%`, background: "var(--accent)" }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatCurrency(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

function formatNullableCurrency(value: number | null): string {
  return value == null ? "N/A" : `$${value.toFixed(2)}`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}
