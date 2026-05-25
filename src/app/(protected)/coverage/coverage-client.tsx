"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";
import {
  getFailedUnitErrorsAction,
  pauseCrawlRunAction,
  resumeCrawlRunAction,
  stopCrawlRunAction,
  retryFailedUnitsAction,
} from "@/lib/crawl/actions";
import { refreshStaleUnitsAction } from "@/lib/leads/actions";

interface ZipProgress {
  state: string;
  county: string;
  zip: string;
  city: string;
  total: number;
  done: number;
  failed: number;
  canceled: number;
  remaining: number;
  leadsFound: number;
  apiCalls: number;
  lastRunAt: string | null;
}

interface CountyCoverage {
  state: string;
  county: string;
  total: number;
  done: number;
  failed: number;
  canceled: number;
  remaining: number;
  zipCount: number;
}

interface StateCoverage {
  state: string;
  total: number;
  done: number;
  failed: number;
  canceled: number;
  remaining: number;
  countyCount: number;
  zipCount: number;
}

interface FailedUnit {
  zip: string;
  category: string;
  last_error: string | null;
}

interface CrawlRunSummary {
  id: string;
  status: string;
  started_at: string | null;
  created_at: string;
  ended_at: string | null;
  categories: string[];
  discovered_count: number;
  api_calls_used: number;
  last_error: string | null;
}

interface CrawlProgress {
  total: number;
  done: number;
  failed: number;
  pending: number;
  running: number;
  canceled: number;
}

interface GeographyProgress {
  activeZipCount: number;
  zipCodesSelected: number;
  zipCodesCompleted: number;
  zipCodesStarted: number;
  zipCodesNotStarted: number;
  zipCodesCanceled: number;
  zipCodesNotSelected: number;
  countiesSelected: number;
  countiesCompleted: number;
}

interface CrawlUnitPreview {
  id: string;
  status: string;
  zip: string;
  city: string | null;
  county: string | null;
  category: string;
  attempt_count: number;
  discovered_count: number;
  started_at: string | null;
  finished_at: string | null;
  last_error: string | null;
  next_page_token: string | null;
  created_at: string;
}

interface Props {
  coverage: ZipProgress[];
  countyCoverage: CountyCoverage[];
  stateCoverage: StateCoverage[];
  run: CrawlRunSummary | null;
  progress: CrawlProgress | null;
  geography: GeographyProgress | null;
  unitPreview: CrawlUnitPreview[];
}

interface RollupRow {
  state: string;
  county?: string;
  total: number;
  done: number;
  failed: number;
  canceled: number;
  remaining: number;
  zipCount: number;
  countyCount?: number;
}

function aggregateStateRollups(rows: ZipProgress[]): RollupRow[] {
  const byState = new Map<string, RollupRow>();
  const countySets = new Map<string, Set<string>>();
  for (const row of rows) {
    const current = byState.get(row.state) ?? {
      state: row.state,
      total: 0,
      done: 0,
      failed: 0,
      canceled: 0,
      remaining: 0,
      zipCount: 0,
      countyCount: 0,
    };
    current.total += row.total;
    current.done += row.done;
    current.failed += row.failed;
    current.canceled += row.canceled;
    current.remaining += row.remaining;
    current.zipCount += 1;
    byState.set(row.state, current);

    if (!countySets.has(row.state)) countySets.set(row.state, new Set());
    countySets.get(row.state)!.add(row.county);
  }

  return Array.from(byState.values())
    .map((row) => ({ ...row, countyCount: countySets.get(row.state)?.size ?? 0 }))
    .sort((a, b) => a.state.localeCompare(b.state));
}

function aggregateCountyRollups(rows: ZipProgress[]): RollupRow[] {
  const byCounty = new Map<string, RollupRow>();
  for (const row of rows) {
    const key = `${row.state}::${row.county}`;
    const current = byCounty.get(key) ?? {
      state: row.state,
      county: row.county,
      total: 0,
      done: 0,
      failed: 0,
      canceled: 0,
      remaining: 0,
      zipCount: 0,
    };
    current.total += row.total;
    current.done += row.done;
    current.failed += row.failed;
    current.canceled += row.canceled;
    current.remaining += row.remaining;
    current.zipCount += 1;
    byCounty.set(key, current);
  }

  return Array.from(byCounty.values()).sort((a, b) => {
    if (a.state !== b.state) return a.state.localeCompare(b.state);
    return (a.county ?? "").localeCompare(b.county ?? "");
  });
}

export function CoverageClient({ coverage, countyCoverage, stateCoverage, run, progress, geography, unitPreview }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [failedOnly, setFailedOnly] = useState(false);
  const [ledgerView, setLedgerView] = useState<"all" | "not_started" | "needs_retry">("all");
  const [selectedCounty, setSelectedCounty] = useState("all");
  const [expandedStates, setExpandedStates] = useState<string[]>([]);
  const [expandedCounties, setExpandedCounties] = useState<string[]>([]);
  const [errors, setErrors] = useState<FailedUnit[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [refreshDays, setRefreshDays] = useState(7);
  const [busy, setBusy] = useState<"pause" | "resume" | "stop" | "retry" | "refresh" | null>(null);

  const filtered = useMemo(() => {
    const filterValue = filter.trim().toLowerCase();
    return coverage.filter((z) => {
      if (selectedCounty !== "all" && z.county !== selectedCounty) return false;
      if (incompleteOnly && z.remaining === 0) return false;
      if (failedOnly && z.failed === 0) return false;
      if (ledgerView === "not_started" && !(z.total > 0 && z.done === 0 && z.failed === 0 && z.canceled === 0)) return false;
      if (ledgerView === "needs_retry" && z.failed === 0) return false;
      if (!filterValue) return true;
      return (
        z.zip.includes(filterValue) ||
        z.city.toLowerCase().includes(filterValue) ||
        z.county.toLowerCase().includes(filterValue) ||
        z.state.toLowerCase().includes(filterValue)
      );
    });
  }, [coverage, failedOnly, filter, incompleteOnly, ledgerView, selectedCounty]);

  const totalDone = coverage.reduce((s, z) => s + z.done, 0);
  const totalAll = coverage.reduce((s, z) => s + z.total, 0);
  const totalFailed = coverage.reduce((s, z) => s + z.failed, 0);
  const totalCanceled = coverage.reduce((s, z) => s + z.canceled, 0);
  const pct = totalAll > 0 ? Math.round((totalDone / totalAll) * 100) : 0;
  const runPct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : pct;
  const runStatus = run?.status ?? null;
  const isRunning = runStatus === "running";
  const isQueued = runStatus === "queued";
  const isPaused = runStatus === "paused";
  const canStop = isRunning || isQueued || isPaused;

  const hasCustomFilter = filter.trim().length > 0 || incompleteOnly || failedOnly || ledgerView !== "all" || selectedCounty !== "all";

  const stateRows = useMemo(() => {
    if (!hasCustomFilter) {
      return [...stateCoverage]
        .map((row) => ({
          state: row.state,
          total: row.total,
          done: row.done,
          failed: row.failed,
          canceled: row.canceled,
          remaining: row.remaining,
          zipCount: row.zipCount,
          countyCount: row.countyCount,
        }))
        .sort((a, b) => a.state.localeCompare(b.state));
    }
    return aggregateStateRollups(filtered);
  }, [filtered, hasCustomFilter, stateCoverage]);

  const countyRows = useMemo(() => {
    if (!hasCustomFilter) {
      return [...countyCoverage]
        .map((row) => ({
          state: row.state,
          county: row.county,
          total: row.total,
          done: row.done,
          failed: row.failed,
          canceled: row.canceled,
          remaining: row.remaining,
          zipCount: row.zipCount,
        }))
        .sort((a, b) => {
          if (a.state !== b.state) return a.state.localeCompare(b.state);
          return (a.county ?? "").localeCompare(b.county ?? "");
        });
    }
    return aggregateCountyRollups(filtered);
  }, [countyCoverage, filtered, hasCustomFilter]);

  const availableCounties = useMemo(
    () => Array.from(new Set(coverage.map((row) => row.county))).sort((a, b) => a.localeCompare(b)),
    [coverage]
  );

  const toggleState = (state: string) => {
    setExpandedStates((previous) =>
      previous.includes(state) ? previous.filter((item) => item !== state) : [...previous, state]
    );
  };

  const toggleCounty = (state: string, county: string) => {
    const key = `${state}::${county}`;
    setExpandedCounties((previous) =>
      previous.includes(key) ? previous.filter((item) => item !== key) : [...previous, key]
    );
  };

  const handleRetry = async () => {
    setBusy("retry");
    const result = await retryFailedUnitsAction();
    if ("error" in result) {
      toast.error(result.error ?? "Error");
    } else {
      toast.success(`${result.retriedCount} units queued for retry`);
    }
    router.refresh();
    setBusy(null);
  };

  const handlePause = async () => {
    setBusy("pause");
    const result = await pauseCrawlRunAction();
    if ("error" in result) {
      toast.error(result.error ?? "Unable to pause run");
    } else {
      toast.info("Discovery paused");
    }
    router.refresh();
    setBusy(null);
  };

  const handleResume = async () => {
    setBusy("resume");
    const result = await resumeCrawlRunAction();
    if ("error" in result) {
      toast.error(result.error ?? "Unable to resume run");
    } else {
      toast.success("Discovery resumed");
    }
    router.refresh();
    setBusy(null);
  };

  const handleStop = async () => {
    const confirmed = window.confirm("Stop this discovery run? Unprocessed ZIP/category units will be marked canceled. Completed leads stay saved.");
    if (!confirmed) return;
    setBusy("stop");
    const result = await stopCrawlRunAction();
    if ("error" in result) {
      toast.error(result.error ?? "Unable to stop discovery");
    } else {
      toast.success(`Discovery stopped. ${result.canceledUnits} queued units canceled.`);
    }
    router.refresh();
    setBusy(null);
  };

  const handleShowErrors = async () => {
    if (showErrors) {
      setShowErrors(false);
      return;
    }
    const data = await getFailedUnitErrorsAction();
    setErrors(data);
    setShowErrors(true);
  };

  const handleRefreshStale = async () => {
    if (!run?.id) return;
    setBusy("refresh");
    const result = await refreshStaleUnitsAction(run.id, refreshDays);
    if ("error" in result) {
      toast.error(result.error ?? "Error");
    } else {
      toast.success(`${result.count} stale units reset for re-crawl`);
    }
    router.refresh();
    setBusy(null);
  };

  return (
    <PageShell
      title="Discovery Monitor"
      description="See exactly what the selected or latest discovery run is doing: ZIP/category work units, progress, failures, and pause/resume controls."
      stats={[
        { label: "Run Status", value: formatRunStatus(runStatus) },
        { label: "Units Done", value: `${progress?.done ?? totalDone} / ${progress?.total ?? totalAll}` },
        { label: "Remaining", value: String((progress?.pending ?? 0) + (progress?.running ?? 0)) },
        { label: "Failed", value: String(progress?.failed ?? totalFailed) },
      ]}
    >
      <section className="rounded-2xl px-5 py-4" style={{ background: "rgba(59, 130, 246, 0.08)", border: "1px solid rgba(59, 130, 246, 0.16)" }}>
        <p className="text-xs font-semibold" style={{ color: "#2563eb" }}>Run-scoped ledger</p>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          These rows describe the current or most recent discovery run, not lifetime ZIP coverage. Use the Scheduler page for background workers and costs.
        </p>
      </section>

      <section className="glass rounded-2xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="section-label">Discovery Control</h3>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              A work unit is one Google Places search for one ZIP code and one business category. Running and pending units below are the backend discovery queue.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-glass text-xs" onClick={() => router.refresh()}>
              Refresh
            </button>
            <Link href="/dashboard" className="btn-primary text-xs">
              Start New Discovery
            </Link>
          </div>
        </div>

        {run ? (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Metric label="Status" value={formatRunStatus(run.status)} tone={run.status} />
              <Metric label="Completion" value={`${runPct}%`} />
              <Metric label="Discovered" value={String(run.discovered_count)} />
              <Metric label="API Calls" value={String(run.api_calls_used)} />
              <Metric label="Categories" value={String(run.categories.length)} />
            </div>

            <div className="mt-4 h-2.5 overflow-hidden rounded-full" style={{ background: "rgba(0,0,0,0.06)" }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${runPct}%`, background: runPct === 100 ? "#166534" : "var(--accent)" }}
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {isRunning && (
                <button type="button" className="btn-glass text-sm" disabled={busy !== null} onClick={handlePause}>
                  {busy === "pause" ? "Pausing..." : "Pause Discovery"}
                </button>
              )}
              {isQueued && (
                <button type="button" className="btn-glass text-sm" disabled={busy !== null} onClick={handlePause}>
                  {busy === "pause" ? "Pausing..." : "Pause Discovery"}
                </button>
              )}
              {isPaused && (
                <button type="button" className="btn-primary text-sm" disabled={busy !== null} onClick={handleResume}>
                  {busy === "resume" ? "Resuming..." : "Resume Discovery"}
                </button>
              )}
              {canStop && (
                <button type="button" className="btn-glass text-sm" disabled={busy !== null} onClick={handleStop}>
                  {busy === "stop" ? "Stopping..." : "Stop Discovery"}
                </button>
              )}
              {(progress?.failed ?? totalFailed) > 0 && (
                <button type="button" className="btn-glass text-sm" disabled={busy !== null} onClick={handleRetry}>
                  {busy === "retry" ? "Retrying..." : `Retry Failed (${progress?.failed ?? totalFailed})`}
                </button>
              )}
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                Started {formatDateTime(run.started_at ?? run.created_at)}
              </span>
            </div>

            {run.last_error && (
              <div className="mt-4 rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)", color: "#991b1b" }}>
                {run.last_error}
              </div>
            )}
          </>
        ) : (
          <div className="mt-5 rounded-xl p-5 text-sm" style={{ background: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.4)", color: "var(--text-secondary)" }}>
            No discovery run exists yet. Open Revenue, choose counties/ZIP codes and categories, then start a run.
          </div>
        )}
      </section>

      <section className="glass rounded-2xl p-6">
        <div className="mb-4">
          <h3 className="section-label">Run Tally</h3>
          <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
            This separates what already ran from what has not run yet.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="Done Units" value={String(progress?.done ?? totalDone)} />
          <Metric label="Running Units" value={String(progress?.running ?? 0)} />
          <Metric label="Pending Units" value={String(progress?.pending ?? 0)} />
          <Metric label="Failed Units" value={String(progress?.failed ?? totalFailed)} />
          <Metric label="Canceled Units" value={String(progress?.canceled ?? totalCanceled)} tone="canceled" />
        </div>
        {geography && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Metric label="Selected ZIPs" value={String(geography.zipCodesSelected)} />
            <Metric label="Started ZIPs" value={String(geography.zipCodesStarted)} />
            <Metric label="Not Started ZIPs" value={String(geography.zipCodesNotStarted)} />
            <Metric label="Completed ZIPs" value={String(geography.zipCodesCompleted)} />
            <Metric label="Not Selected ZIPs" value={`${geography.zipCodesNotSelected} / ${geography.activeZipCount}`} />
          </div>
        )}
      </section>

      <section className="glass rounded-2xl p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="section-label">Backend Work Queue</h3>
            <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
              Showing active and next queued work first. This is what the worker will process.
            </p>
          </div>
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            {unitPreview.length} units shown
          </span>
        </div>
        {unitPreview.length === 0 ? (
          <EmptyPanel label={run ? "No units found for this run." : "Start a discovery run to create work units."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="glass-table min-w-[860px]">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>ZIP</th>
                  <th>Market</th>
                  <th>Category</th>
                  <th>Attempts</th>
                  <th>Leads</th>
                  <th>Last Activity</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {unitPreview.map((unit) => (
                  <tr key={unit.id}>
                    <td><StatusPill status={unit.status} /></td>
                    <td style={{ color: "var(--text-primary)", fontWeight: 500 }}>{unit.zip}</td>
                    <td>{[unit.city, unit.county].filter(Boolean).join(", ") || "Unknown"}</td>
                    <td>{unit.category.replace(/_/g, " ")}</td>
                    <td>{unit.attempt_count}</td>
                    <td>{unit.discovered_count}</td>
                    <td>{formatDateTime(unit.started_at ?? unit.finished_at ?? unit.created_at)}</td>
                    <td className="max-w-72 truncate" title={unit.last_error ?? undefined}>
                      {unit.last_error ?? (unit.next_page_token ? "More pages queued" : "")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="glass rounded-2xl p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <input
            type="text"
            placeholder="Filter by state, county, zip, or city..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="glass-input min-w-48"
          />
          <select
            aria-label="County filter"
            className="glass-input text-xs"
            value={selectedCounty}
            onChange={(event) => setSelectedCounty(event.target.value)}
          >
            <option value="all">All counties</option>
            {availableCounties.map((county) => (
              <option key={county} value={county}>
                {county}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
            <input
              type="checkbox"
              checked={incompleteOnly}
              onChange={(event) => setIncompleteOnly(event.target.checked)}
            />
            Incomplete only
          </label>
          <label className="flex items-center gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
            <input
              type="checkbox"
              checked={failedOnly}
              onChange={(event) => setFailedOnly(event.target.checked)}
            />
            Failed only
          </label>
          <select
            aria-label="Coverage ledger filter"
            className="glass-input text-xs"
            value={ledgerView}
            onChange={(event) => setLedgerView(event.target.value as typeof ledgerView)}
          >
            <option value="all">All ledger rows</option>
            <option value="not_started">Not yet searched</option>
            <option value="needs_retry">Needs retry</option>
          </select>
          <div className="flex flex-wrap items-center gap-2">
            {totalFailed > 0 && (
              <>
                <button type="button" className="btn-glass text-xs" onClick={handleShowErrors}>
                  {showErrors ? "Hide Errors" : "Show Errors"}
                </button>
                <button type="button" className="btn-glass text-xs" onClick={handleRetry}>
                  Retry Failed ({totalFailed})
                </button>
              </>
            )}
            {run?.id && totalDone > 0 && (
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  className="glass-input w-16 text-xs"
                  value={refreshDays}
                  min={1}
                  onChange={(e) => setRefreshDays(Number(e.target.value))}
                  aria-label="Days threshold"
                />
                <button type="button" className="btn-glass text-xs" disabled={busy !== null} onClick={handleRefreshStale}>
                  {busy === "refresh" ? "Refreshing..." : "Refresh Stale"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Error details */}
        {showErrors && errors.length > 0 && (
          <div className="mb-5 space-y-2">
            {errors.map((err, i) => (
              <div key={i} className="rounded-xl px-4 py-2.5 text-xs"
                style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.12)" }}>
                <span className="font-medium" style={{ color: "#991b1b" }}>{err.zip} / {err.category}</span>
                <span className="ml-2" style={{ color: "var(--text-secondary)" }}>{err.last_error || "No error message"}</span>
              </div>
            ))}
          </div>
        )}

        {filtered.length === 0 ? (
          <div
            className="rounded-xl p-5 text-center text-sm"
            style={{ background: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.4)", color: "var(--text-tertiary)" }}
          >
            {coverage.length === 0
              ? `No crawl coverage yet.${!run ? " Start a discovery from Revenue." : ""}${runStatus ? ` Current run status: ${formatRunStatus(runStatus)}.` : ""}`
              : "No matching records for the selected filters."}
          </div>
        ) : (
          <div className="space-y-3">
            {stateRows.map((stateRow) => {
              const stateExpanded = expandedStates.includes(stateRow.state);
              const statePct = stateRow.total > 0 ? Math.round((stateRow.done / stateRow.total) * 100) : 0;
              const stateCounties = countyRows.filter((county) => county.state === stateRow.state);
              return (
                <div
                  key={stateRow.state}
                  className="rounded-xl p-3"
                  style={{ background: "rgba(255,255,255,0.3)", border: "1px solid rgba(255,255,255,0.4)" }}
                >
                  <button type="button" className="flex w-full items-center justify-between" onClick={() => toggleState(stateRow.state)}>
                    <div className="text-left">
                      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{stateRow.state}</p>
                      <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                        {stateRow.countyCount ?? stateCounties.length} counties • {stateRow.zipCount} zip codes
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-secondary)" }}>
                      <span>{stateRow.done}/{stateRow.total} done</span>
                      <span>{statePct}%</span>
                      <span>{stateExpanded ? "Collapse" : "Expand"}</span>
                    </div>
                  </button>

                  {stateExpanded && (
                    <div className="mt-3 space-y-2">
                      {stateCounties.map((countyRow) => {
                        const countyName = countyRow.county ?? "Unknown";
                        const countyKey = `${countyRow.state}::${countyName}`;
                        const countyExpanded = expandedCounties.includes(countyKey);
                        const countyPct = countyRow.total > 0 ? Math.round((countyRow.done / countyRow.total) * 100) : 0;
                        const zipRows = filtered
                          .filter((zip) => zip.state === countyRow.state && zip.county === countyName)
                          .sort((a, b) => a.zip.localeCompare(b.zip));

                        return (
                          <div
                            key={countyKey}
                            className="rounded-lg p-3"
                            style={{ background: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.45)" }}
                          >
                            <button
                              type="button"
                              className="flex w-full items-center justify-between"
                              onClick={() => toggleCounty(countyRow.state, countyName)}
                            >
                              <div className="text-left">
                                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{countyName}</p>
                                <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                                  {countyRow.zipCount} zip codes • {countyRow.failed} failed
                                </p>
                              </div>
                              <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-secondary)" }}>
                                <span>{countyRow.done}/{countyRow.total} done</span>
                                <span>{countyPct}%</span>
                                <span>{countyExpanded ? "Hide zips" : "Show zips"}</span>
                              </div>
                            </button>

                            {countyExpanded && (
                              <div className="mt-3 overflow-x-auto">
                                <table className="glass-table">
                                  <thead>
                                    <tr>
                                      <th>ZIP</th>
                                      <th>City</th>
                                      <th>Total</th>
                                      <th>Done</th>
                                      <th>Failed</th>
                                      <th>Canceled</th>
                                      <th>Remaining</th>
                                      <th>Leads</th>
                                      <th>API Calls</th>
                                      <th>Last Run</th>
                                      <th>Completion</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {zipRows.map((row) => {
                                      const rowPct = row.total > 0 ? Math.round((row.done / row.total) * 100) : 0;
                                      return (
                                        <tr key={`${row.state}-${row.county}-${row.zip}`}>
                                          <td style={{ color: "var(--text-primary)", fontWeight: 500 }}>{row.zip}</td>
                                          <td>{row.city}</td>
                                          <td>{row.total}</td>
                                          <td>{row.done}</td>
                                          <td style={{ color: row.failed > 0 ? "#991b1b" : undefined }}>{row.failed}</td>
                                          <td style={{ color: row.canceled > 0 ? "#b45309" : undefined }}>{row.canceled}</td>
                                          <td>{row.remaining}</td>
                                          <td>{row.leadsFound}</td>
                                          <td>{row.apiCalls}</td>
                                          <td>{formatDateTime(row.lastRunAt)}</td>
                                          <td>
                                            <div className="flex items-center gap-2">
                                              <div className="h-1.5 w-16 overflow-hidden rounded-full" style={{ background: "rgba(0,0,0,0.06)" }}>
                                                <div
                                                  className="h-full rounded-full"
                                                  style={{ width: `${rowPct}%`, background: rowPct === 100 ? "#22c55e" : "var(--accent)" }}
                                                />
                                              </div>
                                              <span className="text-xs">{rowPct}%</span>
                                            </div>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </PageShell>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.4)" }}>
      <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{label}</span>
      <p className="mt-0.5 text-lg font-semibold capitalize" style={{ color: tone === "paused" || tone === "canceled" ? "#92400e" : tone === "running" ? "#166534" : "var(--text-primary)" }}>
        {value}
      </p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const color = status === "running" ? "#166534" : status === "pending" ? "var(--accent)" : status === "failed" ? "#991b1b" : status === "done" ? "#475569" : "#92400e";
  return (
    <span className="inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize" style={{ background: "rgba(255,255,255,0.55)", border: "1px solid rgba(255,255,255,0.65)", color }}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function EmptyPanel({ label }: { label: string }) {
  return (
    <div className="rounded-xl p-5 text-center text-sm" style={{ background: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.4)", color: "var(--text-tertiary)" }}>
      {label}
    </div>
  );
}

function formatRunStatus(status: string | null): string {
  if (!status) return "No Run";
  if (status === "running") return "Running";
  if (status === "paused") return "Paused";
  if (status === "done") return "Done";
  if (status === "error") return "Error";
  if (status === "canceled") return "Stopped";
  return status.replace(/_/g, " ");
}

function formatDateTime(value: string | null): string {
  if (!value) return "Not started";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}
