"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getPlannerCellsAction,
  getPlannerMarketsAction,
  getPlannerCountiesAction,
  getPlannerZipCodesAction,
} from "@/lib/crawl/actions";
import type { CountryCode, LocationCellType } from "@/lib/geography";

type PlannerMarketOption = {
  id: string;
  name: string;
  country_code: CountryCode;
  admin_area1: string | null;
  locality: string | null;
  cellCount: number;
  activeCellCount: number;
};

type PlannerCellOption = {
  id: string;
  market_id: string;
  country_code: CountryCode;
  admin_area1: string | null;
  admin_area2: string | null;
  locality: string | null;
  postal_code: string | null;
  postal_code_normalized: string | null;
  cell_type: LocationCellType;
  cell_label: string;
  is_active: number;
  coverage: {
    total: number;
    done: number;
    failed: number;
    remaining: number;
    completed: boolean;
  };
};

type LegacyPlannerZipOption = {
  zip: string;
  city: string;
  state: string;
  county: string;
  coverage: {
    total: number;
    done: number;
    failed: number;
    remaining: number;
    completed: boolean;
  };
};

export type LocationScopeValue = {
  state: string;
  counties: string[];
  zipCodes: string[];
  marketId?: string;
  cellIds?: string[];
};

type LocationScopePickerProps = {
  value: LocationScopeValue;
  categories: string[];
  onChange: (value: LocationScopeValue) => void;
  disabled?: boolean;
};

function toKey(values: readonly string[]): string {
  return [...values].sort().join("|");
}

export function LocationScopePicker({ value, categories, onChange, disabled = false }: LocationScopePickerProps) {
  const [markets, setMarkets] = useState<PlannerMarketOption[]>([]);
  const [selectedMarketId, setSelectedMarketId] = useState(value.marketId ?? "");
  const [cells, setCells] = useState<PlannerCellOption[]>([]);
  const [selectedCellIds, setSelectedCellIds] = useState<string[]>(value.cellIds ?? []);
  const [cellFilter, setCellFilter] = useState("");
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [legacyZips, setLegacyZips] = useState<LegacyPlannerZipOption[]>([]);

  const categoryKey = useMemo(() => toKey(categories), [categories]);
  const selectedCellSet = useMemo(() => new Set(selectedCellIds), [selectedCellIds]);
  const selectedMarket = markets.find((market) => market.id === selectedMarketId) ?? null;

  useEffect(() => {
    onChange({
      state: selectedMarket?.admin_area1 ?? value.state ?? "CO",
      counties: [],
      zipCodes: cells.filter((cell) => selectedCellSet.has(cell.id)).map((cell) => cell.postal_code_normalized ?? cell.postal_code ?? cell.id),
      marketId: selectedMarketId || undefined,
      cellIds: selectedCellIds,
    });
  }, [cells, onChange, selectedCellIds, selectedCellSet, selectedMarket, selectedMarketId, value.state]);

  useEffect(() => {
    let ignore = false;
    getPlannerMarketsAction().then((rows) => {
      if (ignore) return;
      setMarkets(rows);
      setSelectedMarketId((previous) => previous || rows[0]?.id || "");
    });
    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    if (!selectedMarketId) return;
    let ignore = false;
    getPlannerCellsAction(selectedMarketId, categories).then((rows) => {
      if (ignore) return;
      setCells(rows);
      const allowed = new Set(rows.map((cell) => cell.id));
      setSelectedCellIds((previous) => previous.filter((id) => allowed.has(id)));
    });
    return () => { ignore = true; };
  }, [selectedMarketId, categoryKey, categories]);

  useEffect(() => {
    if (selectedMarketId !== "market-colorado") return;
    let ignore = false;
    getPlannerCountiesAction("CO")
      .then((counties) => Promise.all(counties.map((county) => getPlannerZipCodesAction("CO", county.county, categories))))
      .then((groups) => {
        if (ignore) return;
        setLegacyZips(groups.flat());
      });
    return () => { ignore = true; };
  }, [selectedMarketId, categoryKey, categories]);

  const visibleCells = useMemo(() => {
    const filterValue = cellFilter.trim().toLowerCase();
    return cells.filter((cell) => {
      if (incompleteOnly && cell.coverage.completed) return false;
      if (!filterValue) return true;
      return [cell.cell_label, cell.postal_code, cell.postal_code_normalized, cell.locality, cell.admin_area1, cell.admin_area2]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(filterValue));
    });
  }, [cellFilter, cells, incompleteOnly]);

  const toggleCell = (cellId: string) => {
    setSelectedCellIds((previous) => previous.includes(cellId) ? previous.filter((id) => id !== cellId) : [...previous, cellId]);
  };

  const selectAllVisible = () => setSelectedCellIds(visibleCells.map((cell) => cell.id));
  const clearCells = () => setSelectedCellIds([]);

  const selectedZipCount = selectedMarketId === "market-colorado"
    ? legacyZips.filter((zip) => selectedCellIds.includes(`cell-us-co-${zip.zip}`)).length || selectedCellIds.length
    : selectedCellIds.length;

  return (
    <div className="mt-4 rounded-xl p-4" style={{ background: "rgba(255,255,255,0.25)", border: "1px solid rgba(255,255,255,0.35)" }}>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
        <span>{selectedMarket?.name ?? "No market"}</span>
        <span>•</span>
        <span>{selectedMarket?.country_code ?? "--"}</span>
        <span>•</span>
        <span>{selectedCellIds.length} location cells</span>
        {selectedMarketId === "market-colorado" && <span>• {selectedZipCount} ZIP-compatible selections</span>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(16rem,0.75fr)_1fr]">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
            Market
          </p>
          <select
            className="glass-input w-full"
            value={selectedMarketId}
            disabled={disabled}
            onChange={(event) => {
              setSelectedMarketId(event.target.value);
              setSelectedCellIds([]);
              setCells([]);
              setCellFilter("");
            }}
          >
            {markets.map((market) => (
              <option key={market.id} value={market.id}>
                {market.name} - {market.country_code} ({market.activeCellCount} active cells)
              </option>
            ))}
          </select>
          <p className="text-xs leading-5" style={{ color: "var(--text-secondary)" }}>
            Coverage uses country-specific cells: U.S. ZIPs, Canadian FSAs, and U.K. outward postcodes. Add more markets in the database before selecting them here.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
              Postal / postcode cells
            </p>
            <div className="flex items-center gap-2 text-xs">
              <button type="button" style={{ color: "var(--accent)" }} onClick={selectAllVisible} disabled={disabled || visibleCells.length === 0}>Select all visible</button>
              <button type="button" style={{ color: "var(--accent)" }} onClick={clearCells} disabled={disabled || selectedCellIds.length === 0}>Clear</button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              className="glass-input w-full text-xs"
              placeholder="Filter postal code, city, province, region"
              value={cellFilter}
              onChange={(event) => setCellFilter(event.target.value)}
            />
            <label className="flex items-center gap-1 whitespace-nowrap text-xs" style={{ color: "var(--text-secondary)" }}>
              <input type="checkbox" checked={incompleteOnly} disabled={disabled} onChange={(event) => setIncompleteOnly(event.target.checked)} />
              Exclude completed
            </label>
          </div>
          <div className="max-h-64 space-y-1 overflow-auto pr-1">
            {visibleCells.length === 0 ? (
              <p className="rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(255,255,255,0.3)", color: "var(--text-tertiary)" }}>
                No active cells for this market yet.
              </p>
            ) : visibleCells.map((cell) => {
              const checked = selectedCellSet.has(cell.id);
              return (
                <label
                  key={cell.id}
                  className="flex items-center justify-between gap-3 rounded-lg px-2 py-1 text-xs"
                  style={{ background: checked ? "rgba(99,102,241,0.18)" : "rgba(255,255,255,0.3)", color: "var(--text-secondary)" }}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleCell(cell.id)} />
                    <span className="truncate">{cell.cell_label}</span>
                    <span style={{ color: "var(--text-tertiary)" }}>{cell.cell_type.replace(/_/g, " ")}</span>
                  </span>
                  <span className="shrink-0" style={{ color: cell.coverage.completed ? "#16a34a" : "var(--text-tertiary)" }}>
                    {cell.coverage.total > 0 ? `${cell.coverage.done}/${cell.coverage.total}` : "new"}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
