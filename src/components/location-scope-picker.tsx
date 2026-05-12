"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getPlannerStatesAction,
  getPlannerCountiesAction,
  getPlannerZipCodesAction,
} from "@/lib/crawl/actions";

type PlannerStateOption = {
  state: string;
  countyCount: number;
  zipCount: number;
  activeZipCount: number;
};

type PlannerCountyOption = {
  state: string;
  county: string;
  zipCount: number;
  activeZipCount: number;
};

type PlannerZipOption = {
  zip: string;
  city: string;
  state: string;
  county: string;
  lat: number | null;
  lng: number | null;
  is_active: number;
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
  const [stateOptions, setStateOptions] = useState<PlannerStateOption[]>([]);
  const [countyOptions, setCountyOptions] = useState<PlannerCountyOption[]>([]);
  const [zipOptions, setZipOptions] = useState<PlannerZipOption[]>([]);
  const [selectedState, setSelectedState] = useState(value.state);
  const [selectedCounties, setSelectedCounties] = useState<string[]>(value.counties);
  const [selectedZipCodes, setSelectedZipCodes] = useState<string[]>(value.zipCodes);
  const [zipFilter, setZipFilter] = useState("");
  const [incompleteOnly, setIncompleteOnly] = useState(false);

  const categoryKey = useMemo(() => toKey(categories), [categories]);
  const countyKey = useMemo(() => toKey(selectedCounties), [selectedCounties]);

  useEffect(() => {
    onChange({
      state: selectedState,
      counties: selectedCounties,
      zipCodes: selectedZipCodes,
    });
  }, [selectedState, selectedCounties, selectedZipCodes, onChange]);

  useEffect(() => {
    let ignore = false;
    getPlannerStatesAction()
      .then((states) => {
        if (ignore) return;
        setStateOptions(states);
        if (states.length > 0) {
          setSelectedState((previous) => previous || states[0].state);
        }
      });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedState) return;

    let ignore = false;
    getPlannerCountiesAction(selectedState)
      .then((counties) => {
        if (ignore) return;
        setCountyOptions(counties);
        const validCounties = new Set(counties.map((county) => county.county));
        setSelectedCounties((previous) => {
          const next = previous.filter((county) => validCounties.has(county));
          if (next.length === 0) {
            setZipOptions([]);
            setSelectedZipCodes([]);
          }
          return next;
        });
      });

    return () => {
      ignore = true;
    };
  }, [selectedState]);

  useEffect(() => {
    if (!selectedState || selectedCounties.length === 0) return;

    let ignore = false;

    Promise.all(
      selectedCounties.map((county) => getPlannerZipCodesAction(selectedState, county, categories))
    )
      .then((groups) => {
        if (ignore) return;
        const merged = groups.flat().sort((a, b) => a.zip.localeCompare(b.zip));
        setZipOptions(merged);
        const allowed = new Set(merged.map((zip) => zip.zip));
        setSelectedZipCodes((previous) => previous.filter((zip) => allowed.has(zip)));
      });

    return () => {
      ignore = true;
    };
  }, [selectedState, countyKey, categoryKey, categories, selectedCounties]);

  const visibleZips = useMemo(() => {
    const filterValue = zipFilter.trim().toLowerCase();
    return zipOptions.filter((zip) => {
      if (incompleteOnly && zip.coverage.completed) return false;
      if (!filterValue) return true;
      return (
        zip.zip.includes(filterValue) ||
        zip.city.toLowerCase().includes(filterValue) ||
        zip.county.toLowerCase().includes(filterValue)
      );
    });
  }, [zipFilter, zipOptions, incompleteOnly]);

  const selectedZipSet = useMemo(() => new Set(selectedZipCodes), [selectedZipCodes]);

  const toggleCounty = (county: string) => {
    setSelectedCounties((previous) => {
      const next = previous.includes(county)
        ? previous.filter((item) => item !== county)
        : [...previous, county];
      if (next.length === 0) {
        setZipOptions([]);
        setSelectedZipCodes([]);
      }
      return next;
    });
  };

  const toggleZip = (zip: string) => {
    setSelectedZipCodes((previous) =>
      previous.includes(zip) ? previous.filter((item) => item !== zip) : [...previous, zip]
    );
  };

  const selectAllCounties = () => {
    setSelectedCounties(countyOptions.map((county) => county.county));
  };

  const selectCountyZips = (county: string) => {
    const countyZips = visibleZips.filter((zip) => zip.county === county).map((zip) => zip.zip);
    if (countyZips.length === 0) return;
    setSelectedZipCodes((previous) => Array.from(new Set([...previous, ...countyZips])));
  };

  const clearCounties = () => {
    setSelectedCounties([]);
    setSelectedZipCodes([]);
    setZipOptions([]);
  };

  const selectAllVisibleZips = () => {
    setSelectedZipCodes(visibleZips.map((zip) => zip.zip));
  };

  const clearZips = () => {
    setSelectedZipCodes([]);
  };

  return (
    <div className="mt-4 rounded-xl p-4" style={{ background: "rgba(255,255,255,0.25)", border: "1px solid rgba(255,255,255,0.35)" }}>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
        <span>{selectedState || "No state"} selected</span>
        <span>•</span>
        <span>{selectedCounties.length} counties</span>
        <span>•</span>
        <span>{selectedZipCodes.length} zip codes</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
            State
          </p>
          <select
            className="glass-input w-full"
            value={selectedState}
            disabled={disabled}
            onChange={(event) => {
              setSelectedState(event.target.value);
              setSelectedCounties([]);
              setSelectedZipCodes([]);
              setZipOptions([]);
            }}
          >
            {stateOptions.map((stateOption) => (
              <option key={stateOption.state} value={stateOption.state}>
                {stateOption.state} ({stateOption.activeZipCount} active zip codes)
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
              Counties
            </p>
            <div className="flex items-center gap-2 text-xs">
              <button type="button" style={{ color: "var(--accent)" }} onClick={selectAllCounties} disabled={disabled}>
                Select all
              </button>
              <button type="button" style={{ color: "var(--accent)" }} onClick={clearCounties} disabled={disabled || selectedCounties.length === 0}>
                Clear
              </button>
            </div>
          </div>
          <div className="max-h-52 space-y-1 overflow-auto pr-1">
            {countyOptions.map((county) => {
              const checked = selectedCounties.includes(county.county);
              return (
                <div key={county.county} className="flex items-center justify-between rounded-lg px-2 py-1" style={{ background: "rgba(255,255,255,0.3)" }}>
                  <label className="flex items-center gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleCounty(county.county)}
                    />
                    <span>{county.county}</span>
                    <span style={{ color: "var(--text-tertiary)" }}>({county.activeZipCount})</span>
                  </label>
                  <button
                    type="button"
                    className="text-[11px]"
                    style={{ color: "var(--accent)" }}
                    disabled={disabled}
                    onClick={() => selectCountyZips(county.county)}
                  >
                    Select county
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
              Zip Codes
            </p>
            <div className="flex items-center gap-2 text-xs">
              <button type="button" style={{ color: "var(--accent)" }} onClick={selectAllVisibleZips} disabled={disabled || visibleZips.length === 0}>
                Select all
              </button>
              <button type="button" style={{ color: "var(--accent)" }} onClick={clearZips} disabled={disabled || selectedZipCodes.length === 0}>
                Clear
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              className="glass-input w-full text-xs"
              placeholder="Filter zip or city"
              value={zipFilter}
              onChange={(event) => setZipFilter(event.target.value)}
            />
            <label className="flex items-center gap-1 text-xs whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
              <input
                type="checkbox"
                checked={incompleteOnly}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setIncompleteOnly(checked);
                  if (checked) {
                    const incomplete = new Set(zipOptions.filter((zip) => !zip.coverage.completed).map((zip) => zip.zip));
                    setSelectedZipCodes((previous) => previous.filter((zip) => incomplete.has(zip)));
                  }
                }}
                disabled={disabled}
              />
              Exclude completed
            </label>
          </div>
          <div className="max-h-52 space-y-1 overflow-auto pr-1">
            {visibleZips.map((zip) => {
              const checked = selectedZipSet.has(zip.zip);
              return (
                <label
                  key={zip.zip}
                  className="flex items-center justify-between rounded-lg px-2 py-1 text-xs"
                  style={{ background: checked ? "rgba(99,102,241,0.18)" : "rgba(255,255,255,0.3)", color: "var(--text-secondary)" }}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleZip(zip.zip)}
                    />
                    <span>{zip.zip}</span>
                    <span style={{ color: "var(--text-tertiary)" }}>{zip.city}</span>
                  </span>
                  <span style={{ color: zip.coverage.completed ? "#16a34a" : "var(--text-tertiary)" }}>
                    {zip.coverage.total > 0 ? `${zip.coverage.done}/${zip.coverage.total}` : "new"}
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
