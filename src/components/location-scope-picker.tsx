"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getPlannerCellsAction,
  getPlannerMarketsAction,
  getPlannerCountiesAction,
  getPlannerZipCodesAction,
} from "@/lib/crawl/actions";
import {
  COUNTRY_NAMES,
  isValidPostalCell,
  normalizePostalCode,
  type CountryCode,
  type LocationCellType,
} from "@/lib/geography";

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
  countryCode?: CountryCode;
  marketId?: string;
  cellIds?: string[];
  marketLabel?: string;
  cellLabels?: string[];
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

const COUNTRY_OPTIONS: CountryCode[] = ["US", "CA", "GB"];

function formatMarketLabel(market: PlannerMarketOption): string {
  return [market.name, market.admin_area1].filter(Boolean).join(", ");
}

export function LocationScopePicker({ value, categories, onChange, disabled = false }: LocationScopePickerProps) {
  const [initialCountry] = useState<CountryCode>(value.countryCode ?? "US");
  const [initialMarketId] = useState(value.marketId ?? "");
  const [markets, setMarkets] = useState<PlannerMarketOption[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>(initialCountry);
  const [selectedMarketId, setSelectedMarketId] = useState(initialMarketId);
  const [cells, setCells] = useState<PlannerCellOption[]>([]);
  const [countryCells, setCountryCells] = useState<PlannerCellOption[]>([]);
  const [selectedCellIds, setSelectedCellIds] = useState<string[]>(value.cellIds ?? []);
  const [cellFilter, setCellFilter] = useState("");
  const [postalEntry, setPostalEntry] = useState("");
  const [postalFeedback, setPostalFeedback] = useState<string | null>(null);
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [legacyZips, setLegacyZips] = useState<LegacyPlannerZipOption[]>([]);
  const [cellsLoading, setCellsLoading] = useState(true);
  const [countryCellsLoading, setCountryCellsLoading] = useState(true);

  const categoryKey = useMemo(() => toKey(categories), [categories]);
  const selectedCellSet = useMemo(() => new Set(selectedCellIds), [selectedCellIds]);
  const selectedMarket = markets.find((market) => market.id === selectedMarketId) ?? null;
  const marketsForCountry = useMemo(
    () => markets.filter((market) => market.country_code === selectedCountry),
    [markets, selectedCountry],
  );
  const selectedCountryCellMatches = useMemo(() => {
    const normalized = normalizePostalCode(selectedCountry, postalEntry);
    if (!normalized) return [];
    return countryCells.filter((cell) => (
      normalizePostalCode(cell.country_code, cell.postal_code_normalized ?? cell.postal_code ?? "") === normalized
    ));
  }, [countryCells, postalEntry, selectedCountry]);

  useEffect(() => {
    const selectedCells = cells.filter((cell) => selectedCellSet.has(cell.id));
    const cellLabels = selectedCells.length > 0
      ? selectedCells.map((cell) => cell.cell_label)
      : selectedCellIds;
    onChange({
      state: selectedMarket?.admin_area1 ?? value.state ?? "CO",
      counties: [],
      zipCodes: selectedCells.map((cell) => cell.postal_code_normalized ?? cell.postal_code ?? cell.id),
      countryCode: selectedCountry,
      marketId: selectedMarketId || undefined,
      cellIds: selectedCellIds,
      marketLabel: selectedMarket ? formatMarketLabel(selectedMarket) : undefined,
      cellLabels,
    });
  }, [cells, onChange, selectedCellIds, selectedCellSet, selectedCountry, selectedMarket, selectedMarketId, value.state]);

  useEffect(() => {
    let ignore = false;
    getPlannerMarketsAction().then((rows) => {
      if (ignore) return;
      setMarkets(rows);
      const explicitMarket = initialMarketId ? rows.find((market) => market.id === initialMarketId) : null;
      const nextCountry = explicitMarket?.country_code ?? initialCountry ?? rows[0]?.country_code ?? "US";
      const firstCountryMarket = rows.find((market) => market.country_code === nextCountry) ?? rows[0];
      setSelectedCountry(nextCountry);
      setSelectedMarketId((previous) => previous || explicitMarket?.id || firstCountryMarket?.id || "");
    });
    return () => { ignore = true; };
  }, [initialCountry, initialMarketId]);

  useEffect(() => {
    if (!selectedMarketId) return;
    let ignore = false;
    getPlannerCellsAction(selectedMarketId, categories).then((rows) => {
      if (ignore) return;
      setCells(rows);
      const allowed = new Set(rows.map((cell) => cell.id));
      setSelectedCellIds((previous) => previous.filter((id) => allowed.has(id)));
      setCellsLoading(false);
    });
    return () => { ignore = true; };
  }, [selectedMarketId, categoryKey, categories]);

  useEffect(() => {
    if (markets.length === 0) return;
    const countryMarkets = markets.filter((market) => market.country_code === selectedCountry);
    if (countryMarkets.length === 0) {
      let ignore = false;
      Promise.resolve([] as PlannerCellOption[]).then((rows) => {
        if (!ignore) {
          setCountryCells(rows);
          setCountryCellsLoading(false);
        }
      });
      return () => { ignore = true; };
    }
    let ignore = false;
    Promise.all(countryMarkets.map((market) => getPlannerCellsAction(market.id, categories))).then((groups) => {
      if (ignore) return;
      setCountryCells(groups.flat());
      setCountryCellsLoading(false);
    });
    return () => { ignore = true; };
  }, [markets, selectedCountry, categoryKey, categories]);

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

  const applyPostalEntry = () => {
    const normalized = normalizePostalCode(selectedCountry, postalEntry);
    if (!normalized || !isValidPostalCell(selectedCountry, postalEntry)) {
      setPostalFeedback(`Enter a valid ${COUNTRY_NAMES[selectedCountry]} postal code.`);
      return;
    }
    const match = selectedCountryCellMatches[0];
    if (!match) {
      if (countryCellsLoading) {
        setPostalFeedback(`Still loading active ${COUNTRY_NAMES[selectedCountry]} discovery cells. Try again in a moment.`);
        return;
      }
      setPostalFeedback(`No active discovery cell exists for ${normalized} yet.`);
      return;
    }
    setPostalFeedback(`Selected ${match.cell_label}.`);
    setSelectedCountry(match.country_code);
    setSelectedMarketId(match.market_id);
    setSelectedCellIds([match.id]);
    setCellFilter(normalized);
    setCellsLoading(true);
  };

  const selectedZipCount = selectedMarketId === "market-colorado"
    ? legacyZips.filter((zip) => selectedCellIds.includes(`cell-us-co-${zip.zip}`)).length || selectedCellIds.length
    : selectedCellIds.length;

  return (
    <div className="mt-4 rounded-xl p-4" style={{ background: "var(--surface-muted)", border: "1px solid var(--surface-card-border)" }}>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
        <span>{COUNTRY_NAMES[selectedCountry]}</span>
        <span>•</span>
        <span>{selectedMarket ? formatMarketLabel(selectedMarket) : "No area"}</span>
        <span>•</span>
        <span>{selectedCellIds.length} location cells</span>
        {selectedMarketId === "market-colorado" && <span>• {selectedZipCount} ZIP-compatible selections</span>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.8fr_1fr_1.2fr]">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
            Country
          </p>
          <select
            className="glass-input w-full"
            value={selectedCountry}
            disabled={disabled}
            onChange={(event) => {
              const nextCountry = event.target.value as CountryCode;
              const nextMarket = markets.find((market) => market.country_code === nextCountry);
              setSelectedCountry(nextCountry);
              setSelectedMarketId(nextMarket?.id ?? "");
              setSelectedCellIds([]);
              setCells([]);
              setCellFilter("");
              setPostalFeedback(null);
              setCellsLoading(true);
              setCountryCellsLoading(true);
            }}
          >
            {COUNTRY_OPTIONS.map((country) => (
              <option key={country} value={country}>{COUNTRY_NAMES[country]}</option>
            ))}
          </select>
          <p className="text-xs leading-5" style={{ color: "var(--text-secondary)" }}>
            Country is the top-level market. Areas below only organize the postal cells used by Google Places.
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
            Postal / postcode search
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              className="glass-input w-full"
              placeholder={selectedCountry === "CA" ? "N6H5R8 or N6H" : selectedCountry === "GB" ? "SW1A 1AA" : "80202"}
              value={postalEntry}
              disabled={disabled}
              onChange={(event) => {
                setPostalEntry(event.target.value);
                setPostalFeedback(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyPostalEntry();
                }
              }}
            />
            <button type="button" className="btn-glass shrink-0 text-xs" onClick={applyPostalEntry} disabled={disabled || !postalEntry.trim()}>
              Use
            </button>
          </div>
          {postalFeedback && (
            <p className="text-xs leading-5" style={{ color: postalFeedback.startsWith("Selected") ? "var(--success-text)" : "var(--warning-text)" }}>
              {postalFeedback}
            </p>
          )}
          {selectedCountryCellMatches.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedCountryCellMatches.slice(0, 3).map((cell) => (
                <button
                  key={cell.id}
                  type="button"
                  className="rounded-full px-2.5 py-1 text-xs"
                  style={{ background: "var(--accent-light)", color: "var(--accent)" }}
                  disabled={disabled}
                  onClick={() => {
                    setSelectedMarketId(cell.market_id);
                    setSelectedCellIds([cell.id]);
                    setCellFilter(cell.postal_code_normalized ?? cell.postal_code ?? "");
                    setPostalFeedback(`Selected ${cell.cell_label}.`);
                    setCellsLoading(true);
                  }}
                >
                  {cell.cell_label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
            Area
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
              setCellsLoading(true);
            }}
          >
            {marketsForCountry.map((market) => (
              <option key={market.id} value={market.id}>
                {formatMarketLabel(market)} ({market.activeCellCount} active cells)
              </option>
            ))}
          </select>
          <p className="text-xs leading-5" style={{ color: "var(--text-secondary)" }}>
            If the postal search finds a different area, it switches here automatically.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(16rem,0.75fr)_1fr]">
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
              <p className="rounded-lg px-3 py-2 text-xs" style={{ background: "var(--surface-muted)", color: "var(--text-tertiary)" }}>
                {cellsLoading ? "Loading active cells for this area..." : "No active cells for this market yet."}
              </p>
            ) : visibleCells.map((cell) => {
              const checked = selectedCellSet.has(cell.id);
              return (
                <label
                  key={cell.id}
                  className="flex items-center justify-between gap-3 rounded-lg px-2 py-1 text-xs"
                  style={{ background: checked ? "var(--selection-bg)" : "var(--surface-muted)", color: "var(--text-secondary)" }}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleCell(cell.id)} />
                    <span className="truncate">{cell.cell_label}</span>
                    <span style={{ color: "var(--text-tertiary)" }}>{cell.cell_type.replace(/_/g, " ")}</span>
                  </span>
                  <span className="shrink-0" style={{ color: cell.coverage.completed ? "var(--success-text)" : "var(--text-tertiary)" }}>
                    {cell.coverage.total > 0 ? `${cell.coverage.done}/${cell.coverage.total}` : "new"}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
        <div className="rounded-xl p-3 text-xs" style={{ background: "var(--surface-muted)", border: "1px solid var(--surface-card-border)", color: "var(--text-secondary)" }}>
          <p className="font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
            Selected cells
          </p>
          <p className="mt-2 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            {selectedCellIds.length}
          </p>
          <p className="mt-1 leading-5">
            {selectedCellIds.length === 0
              ? "Pick one or more postal cells before starting discovery."
              : cells.filter((cell) => selectedCellSet.has(cell.id)).map((cell) => cell.cell_label).join(", ") || "Selected cells are loading."}
          </p>
          {postalFeedback && (
            <p className="mt-3 rounded-lg px-3 py-2" style={{ background: "var(--surface-card)", color: postalFeedback.startsWith("Selected") ? "var(--success-text)" : "var(--warning-text)" }}>
              {postalFeedback}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
