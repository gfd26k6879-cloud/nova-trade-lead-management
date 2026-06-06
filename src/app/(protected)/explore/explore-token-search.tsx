"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getAiVerificationDisplay } from "@/lib/ai-verification-display";
import {
  buildExploreSearchSuggestions,
  buildExploreSearchTokens,
  parseExploreCommand,
  type ExploreFilterChip,
  type ExploreMode,
  type ExploreSearchSuggestion,
} from "@/lib/explore-filters";
import type { AppRole } from "@/lib/permissions";

interface ExploreSearchFilters {
  search?: string;
  status?: string;
  websiteStatus?: string;
  minReviews?: number;
  minRating?: number;
  minScore?: number;
  city?: string;
  zip?: string;
  category?: string;
  businessType?: string;
  assigned?: string;
  qualityBucket?: string;
  aiVerificationStatus?: string;
  archived?: string;
  includeExcluded?: boolean | string;
}

interface Props {
  mode: ExploreMode;
  filters: ExploreSearchFilters;
  activeChips: ExploreFilterChip[];
  businessTypeCounts: Array<{ id: string; label: string; total: number; active: number }>;
  currentRole: AppRole;
  showColoradoAreaPresets: boolean;
  onApply: (updates: Record<string, string | number | null | undefined>) => void;
  onRemoveChip: (chip: ExploreFilterChip) => void;
}

const BUILDER_FILTERS = {
  website: ["", "none", "social", "basic", "custom"],
  quality: ["", "ready_to_call", "broken_site_opportunity", "needs_ai_verify", "needs_manual_review", "not_a_fit"],
  ai: ["", "not_checked", "no_site_found", "weak_site_found", "site_found", "uncertain", "mismatch"],
  status: ["", "new", "verified", "contacted", "preview_sent", "meeting_set", "closed_won", "closed_lost"],
  category: [
    "dentist", "chiropractor", "plumber", "electrician", "hvac_contractor",
    "roofing_contractor", "auto_repair", "hair_salon", "real_estate_agent",
    "restaurant", "gym", "landscaper", "veterinarian", "accountant", "lawyer",
  ],
};

export function ExploreTokenSearch({
  mode,
  filters,
  activeChips,
  businessTypeCounts,
  currentRole,
  showColoradoAreaPresets,
  onApply,
  onRemoveChip,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const tokens = useMemo(() => buildExploreSearchTokens(mode, activeChips), [activeChips, mode]);
  const groups = useMemo(() => buildExploreSearchSuggestions({
    mode,
    query: draft,
    includeAdmin: currentRole === "admin",
    showColoradoAreas: showColoradoAreaPresets,
    businessTypes: businessTypeCounts,
  }), [businessTypeCounts, currentRole, draft, mode, showColoradoAreaPresets]);
  const flatSuggestions = groups.flatMap((group) => group.suggestions);
  const safeHighlightedIndex = Math.min(highlightedIndex, Math.max(0, flatSuggestions.length - 1));
  const visibleTokens = tokens.slice(0, 5);
  const hiddenTokenCount = Math.max(0, tokens.length - visibleTokens.length);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const insideInput = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT" || target?.isContentEditable;
      if (insideInput) return;
      if (event.key === "/" || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k")) {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const acceptSuggestion = (suggestion: ExploreSearchSuggestion) => {
    setErrors([]);
    setDraft("");
    setOpen(false);
    setBuilderOpen(false);
    onApply({ ...suggestion.updates, page: null });
  };

  const submitDraft = () => {
    const parsed = parseDraftCommand(draft);
    setErrors(parsed.errors);
    if (parsed.errors.length > 0) return;
    if (Object.keys(parsed.filters).length === 0) return;
    onApply({ ...parsed.filters, page: null });
    setDraft("");
    setOpen(false);
  };

  return (
    <div className="relative">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="section-label">Lead Finder</h2>
          <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
            Type a lead name or command, then use suggestions to turn filters into chips.
          </p>
        </div>
        <button type="button" className={`btn-glass text-xs ${builderOpen ? "nav-link-active" : ""}`} onClick={() => setBuilderOpen((value) => !value)}>
          Builder
        </button>
      </div>

      <div
        className="mt-3 min-h-14 rounded-2xl px-3 py-2"
        style={{ background: "rgba(255,255,255,0.5)", border: "1px solid rgba(99,102,241,0.35)", boxShadow: open ? "0 0 0 3px rgba(99,102,241,0.14)" : undefined }}
        onClick={() => {
          inputRef.current?.focus();
          setOpen(true);
        }}
      >
        <div className="flex max-h-24 flex-wrap items-center gap-2 overflow-hidden">
          {visibleTokens.map((token) => (
            <span
              key={`${token.key}:${token.value}`}
              className="inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
              style={{
                background: token.locked ? "rgba(15,23,42,0.08)" : "rgba(79,70,229,0.1)",
                color: token.locked ? "var(--text-secondary)" : "var(--accent)",
              }}
            >
              <button
                type="button"
                className={`min-w-0 truncate text-left ${token.locked ? "cursor-default" : "hover:opacity-80"}`}
                title={token.locked ? "Current saved view scope" : `Edit ${token.label}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setDraft(token.locked ? "" : token.label.toLowerCase());
                  setOpen(true);
                  inputRef.current?.focus();
                }}
              >
                {token.label}: {token.locked ? token.value : formatLabel(token.value)}
              </button>
              {!token.locked && (
                <button
                  type="button"
                  aria-label={`Remove ${token.label}`}
                  className="rounded-full px-1"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemoveChip(token);
                  }}
                >
                  x
                </button>
              )}
            </span>
          ))}
          {hiddenTokenCount > 0 && (
            <span className="rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: "rgba(255,255,255,0.72)", color: "var(--text-secondary)" }}>
              +{hiddenTokenCount} filters
            </span>
          )}
          <input
            ref={inputRef}
            className="min-w-[12rem] flex-1 bg-transparent px-1 py-1 text-sm outline-none"
            style={{ color: "var(--text-primary)" }}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setHighlightedIndex(0);
              setOpen(true);
              setErrors([]);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setOpen(false);
                setBuilderOpen(false);
                return;
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setHighlightedIndex((index) => Math.min(index + 1, Math.max(0, flatSuggestions.length - 1)));
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setHighlightedIndex((index) => Math.max(0, index - 1));
                return;
              }
              if ((event.key === "Enter" || event.key === "Tab") && open && flatSuggestions[safeHighlightedIndex]) {
                event.preventDefault();
                acceptSuggestion(flatSuggestions[safeHighlightedIndex]);
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                submitDraft();
                return;
              }
              if (event.key === "Backspace" && !draft) {
                const removable = [...tokens].reverse().find((token) => !token.locked);
                if (removable) onRemoveChip(removable);
              }
            }}
            placeholder={tokens.length > 1 ? "Add another filter..." : "Try website:none owner:unclaimed or premier plumbing"}
            aria-label="Lead Finder search"
          />
        </div>
      </div>

      {errors.length > 0 && (
        <div className="mt-2 rounded-xl px-3 py-2 text-sm" style={{ background: "rgba(239,68,68,0.1)", color: "#dc2626" }}>
          {errors.map((error) => <p key={error}>{error}</p>)}
        </div>
      )}

      {(open || builderOpen) && (
        <div className="absolute left-0 right-0 z-30 mt-2 rounded-2xl p-3 shadow-xl md:max-h-[32rem] md:overflow-auto" style={{ background: "rgba(255,255,255,0.95)", border: "1px solid rgba(226,232,240,0.9)" }}>
          {builderOpen ? (
            <ExploreBuilder filters={filters} businessTypeCounts={businessTypeCounts} currentRole={currentRole} onApply={onApply} />
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {groups.map((group) => (
                <div key={group.title}>
                  <p className="section-label">{group.title}</p>
                  <div className="mt-2 space-y-1">
                    {group.suggestions.map((suggestion) => {
                      const index = flatSuggestions.findIndex((item) => item.id === suggestion.id);
                      const active = index === safeHighlightedIndex;
                      return (
                        <button
                          key={suggestion.id}
                          type="button"
                          className="w-full rounded-xl px-3 py-2 text-left text-sm transition"
                          style={{ background: active ? "rgba(79,70,229,0.1)" : "rgba(255,255,255,0.48)", color: "var(--text-primary)" }}
                          onMouseEnter={() => setHighlightedIndex(index)}
                          onClick={() => acceptSuggestion(suggestion)}
                        >
                          <span className="block font-medium">{suggestion.label}</span>
                          <span className="mt-0.5 block text-xs" style={{ color: "var(--text-tertiary)" }}>{suggestion.command} - {suggestion.description}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {groups.length === 0 && (
                <div className="rounded-xl px-3 py-2 text-sm" style={{ background: "rgba(255,255,255,0.55)", color: "var(--text-secondary)" }}>
                  No suggestions match that text. Press Enter to run it as a search.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ExploreBuilder({
  filters,
  businessTypeCounts,
  currentRole,
  onApply,
}: {
  filters: ExploreSearchFilters;
  businessTypeCounts: Array<{ id: string; label: string; total: number; active: number }>;
  currentRole: AppRole;
  onApply: (updates: Record<string, string | number | null | undefined>) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="section-label">Builder</p>
          <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>All builder fields update the same URL-backed chips.</p>
        </div>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <BuilderInput label="Search" value={filters.search ?? ""} placeholder="Name, phone, address" onChange={(value) => onApply({ search: value, page: null })} />
        <BuilderInput label="City" value={filters.city ?? ""} placeholder="Denver, Toronto, London" onChange={(value) => onApply({ city: value, page: null })} />
        <BuilderInput label="Postal / postcode" value={filters.zip ?? ""} placeholder="80202, M5V, SW1A" onChange={(value) => onApply({ zip: value, page: null })} />
        <BuilderSelect label="Business type" value={filters.businessType ?? ""} onChange={(value) => onApply({ businessType: value, page: null })} options={[["", "All business types"], ...businessTypeCounts.map((type) => [type.id, `${type.label}${type.total > 0 ? ` (${type.active})` : ""}`] as [string, string])]} />
        <BuilderSelect label="Website" value={filters.websiteStatus ?? ""} onChange={(value) => onApply({ websiteStatus: value, page: null })} options={BUILDER_FILTERS.website.map((value) => [value, value ? formatLabel(value) : "All websites"])} />
        <BuilderSelect label="Quality" value={filters.qualityBucket ?? ""} onChange={(value) => onApply({ qualityBucket: value, page: null })} options={BUILDER_FILTERS.quality.map((value) => [value, value ? formatLabel(value) : "All quality"])} />
        <BuilderSelect label="AI verification" value={filters.aiVerificationStatus ?? ""} onChange={(value) => onApply({ aiVerificationStatus: value, page: null })} options={BUILDER_FILTERS.ai.map((value) => [value, value ? getAiVerificationDisplay({ status: value }).label : "All AI states"])} />
        <BuilderSelect label="Lead status" value={filters.status ?? ""} onChange={(value) => onApply({ status: value, page: null })} options={BUILDER_FILTERS.status.map((value) => [value, value ? formatLabel(value) : "All statuses"])} />
        <BuilderSelect label="Category" value={filters.category ?? ""} onChange={(value) => onApply({ category: value, page: null })} options={BUILDER_FILTERS.category.map((value) => [value, value ? formatLabel(value) : "All categories"])} />
        <BuilderSelect label="Assignment" value={filters.assigned ?? "any"} onChange={(value) => onApply({ assigned: value, page: null })} options={[["any", "Any owner"], ["unassigned", "Unclaimed"], ["me", "Mine"]]} />
        {currentRole === "admin" && <BuilderSelect label="Inventory" value={filters.archived ?? "active"} onChange={(value) => onApply({ archived: value, page: null })} options={[["active", "Active only"], ["archived", "Archived only"], ["all", "Active + archived"]]} />}
        {currentRole === "admin" && (
          <label className="flex items-center gap-2 self-end rounded-xl px-3 py-3 text-sm" style={{ background: "rgba(255,255,255,0.6)", color: "var(--text-secondary)" }}>
            <input type="checkbox" checked={filters.includeExcluded === true || filters.includeExcluded === "true"} onChange={(event) => onApply({ includeExcluded: event.target.checked ? "true" : null, page: null })} />
            Include excluded/disqualified
          </label>
        )}
        <BuilderInput label="Min reviews" type="number" value={filters.minReviews?.toString() ?? ""} onChange={(value) => onApply({ minReviews: value, page: null })} />
        <BuilderInput label="Min rating" type="number" value={filters.minRating?.toString() ?? ""} onChange={(value) => onApply({ minRating: value, page: null })} />
        <BuilderInput label="Min score" type="number" value={filters.minScore?.toString() ?? ""} onChange={(value) => onApply({ minScore: value, page: null })} />
      </div>
    </div>
  );
}

function BuilderInput({ label, value, placeholder, type = "text", onChange }: { label: string; value: string; placeholder?: string; type?: string; onChange: (value: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="section-label">{label}</span>
      <input type={type} className="glass-input" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function BuilderSelect({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="section-label">{label}</span>
      <select className="glass-select" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, labelText]) => <option key={optionValue || labelText} value={optionValue}>{labelText}</option>)}
      </select>
    </label>
  );
}

function parseDraftCommand(value: string): { filters: Record<string, string | null>; errors: string[] } {
  const parsed = parseExploreCommand(value);
  return { filters: parsed.filters, errors: parsed.errors };
}

function formatLabel(value: string | null | undefined): string {
  return (value ?? "").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()) || "Any";
}
