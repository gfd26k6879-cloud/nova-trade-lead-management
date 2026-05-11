"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";
import { retryFailedUnitsAction, getFailedUnitErrorsAction } from "@/lib/crawl/actions";
import { refreshStaleUnitsAction } from "@/lib/leads/actions";

interface ZipProgress {
  state: string;
  county: string;
  zip: string;
  city: string;
  total: number;
  done: number;
  failed: number;
  remaining: number;
}

interface CountyCoverage {
  state: string;
  county: string;
  total: number;
  done: number;
  failed: number;
  remaining: number;
  zipCount: number;
}

interface StateCoverage {
  state: string;
  total: number;
  done: number;
  failed: number;
  remaining: number;
  countyCount: number;
  zipCount: number;
}

interface FailedUnit {
  zip: string;
  category: string;
  last_error: string | null;
}

interface Props {
  coverage: ZipProgress[];
  countyCoverage: CountyCoverage[];
  stateCoverage: StateCoverage[];
  runId: string | null;
  runStatus: string | null;
}

interface RollupRow {
  state: string;
  county?: string;
  total: number;
  done: number;
  failed: number;
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
      remaining: 0,
      zipCount: 0,
      countyCount: 0,
    };
    current.total += row.total;
    current.done += row.done;
    current.failed += row.failed;
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
      remaining: 0,
      zipCount: 0,
    };
    current.total += row.total;
    current.done += row.done;
    current.failed += row.failed;
    current.remaining += row.remaining;
    current.zipCount += 1;
    byCounty.set(key, current);
  }

  return Array.from(byCounty.values()).sort((a, b) => {
    if (a.state !== b.state) return a.state.localeCompare(b.state);
    return (a.county ?? "").localeCompare(b.county ?? "");
  });
}

export function CoverageClient({ coverage, countyCoverage, stateCoverage, runId, runStatus }: Props) {
  const [filter, setFilter] = useState("");
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [failedOnly, setFailedOnly] = useState(false);
  const [selectedCounty, setSelectedCounty] = useState("all");
  const [expandedStates, setExpandedStates] = useState<string[]>([]);
  const [expandedCounties, setExpandedCounties] = useState<string[]>([]);
  const [errors, setErrors] = useState<FailedUnit[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [refreshDays, setRefreshDays] = useState(7);

  const filtered = useMemo(() => {
    const filterValue = filter.trim().toLowerCase();
    return coverage.filter((z) => {
      if (selectedCounty !== "all" && z.county !== selectedCounty) return false;
      if (incompleteOnly && z.remaining === 0) return false;
      if (failedOnly && z.failed === 0) return false;
      if (!filterValue) return true;
      return (
        z.zip.includes(filterValue) ||
        z.city.toLowerCase().includes(filterValue) ||
        z.county.toLowerCase().includes(filterValue) ||
        z.state.toLowerCase().includes(filterValue)
      );
    });
  }, [coverage, failedOnly, filter, incompleteOnly, selectedCounty]);

  const totalDone = coverage.reduce((s, z) => s + z.done, 0);
  const totalAll = coverage.reduce((s, z) => s + z.total, 0);
  const totalFailed = coverage.reduce((s, z) => s + z.failed, 0);
  const pct = totalAll > 0 ? Math.round((totalDone / totalAll) * 100) : 0;

  const hasCustomFilter = filter.trim().length > 0 || incompleteOnly || failedOnly || selectedCounty !== "all";

  const stateRows = useMemo(() => {
    if (!hasCustomFilter) {
      return [...stateCoverage]
        .map((row) => ({
          state: row.state,
          total: row.total,
          done: row.done,
          failed: row.failed,
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
    const result = await retryFailedUnitsAction();
    if ("error" in result) {
      toast.error(result.error ?? "Error");
    } else {
      toast.success(`${result.retriedCount} units queued for retry`);
    }
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
    if (!runId) return;
    const result = await refreshStaleUnitsAction(runId, refreshDays);
    if ("error" in result) {
      toast.error(result.error ?? "Error");
    } else {
      toast.success(`${result.count} stale units reset for re-crawl`);
    }
  };

  return (
    <PageShell
      title="Coverage"
      description="Track zip-by-zip crawl progress and retries."
      stats={[
        { label: "Zips with Units", value: String(coverage.length) },
        { label: "Units Done", value: `${totalDone} / ${totalAll}` },
        { label: "Completion", value: `${pct}%` },
        { label: "Failed", value: String(totalFailed) },
      ]}
    >
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
            {runId && totalDone > 0 && (
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  className="glass-input w-16 text-xs"
                  value={refreshDays}
                  min={1}
                  onChange={(e) => setRefreshDays(Number(e.target.value))}
                  aria-label="Days threshold"
                />
                <button type="button" className="btn-glass text-xs" onClick={handleRefreshStale}>
                  Refresh Stale
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
                <span className="font-medium" style={{ color: "#dc2626" }}>{err.zip} / {err.category}</span>
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
              ? `No crawl data yet.${!runId ? " Start a run from the Dashboard." : ""}${runStatus ? ` Current run status: ${runStatus}.` : ""}`
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
                                      <th>Remaining</th>
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
                                          <td style={{ color: row.failed > 0 ? "#dc2626" : undefined }}>{row.failed}</td>
                                          <td>{row.remaining}</td>
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
