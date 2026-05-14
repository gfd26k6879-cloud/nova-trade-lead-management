"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { ScoreBandBadge } from "@/components/score-band-badge";
import { ScoreBandLegend } from "@/components/score-band-legend";
import { generateOutreachPackageAction, logOutreachEventAction, queueLeadPitchPackAction, runAiVerificationBatchAction, updateLeadStatusAction } from "@/lib/leads/actions";
import type { ScoreBandThresholds } from "@/lib/score-bands";

interface Lead {
  id: string;
  name: string | null;
  phone: string | null;
  address: string | null;
  categories: string[];
  score: number;
  website_status: string;
  rating: number | null;
  review_count: number | null;
  last_contacted_at: string | null;
  reminder_date: string | null;
  status: string;
  win_probability_score: number;
  lead_quality_score: number;
  quality_bucket: string;
  recommended_offer: string;
  next_best_action: string | null;
  phone_verification_status: string;
  ai_verification_status: string;
  ai_confidence: number;
  ai_found_website_url: string | null;
  ai_recommendation: string | null;
  ai_checked_at: string | null;
  ai_website_viability_status: string | null;
  ai_queue_status: string;
  contactability_score: number;
  estimated_deal_value: number;
  raw_opportunity_score: number;
  verification_score: number;
  sales_priority_score: number;
  demo_slug: string | null;
  business_detail_status: string | null;
  competitive_report_status: string | null;
}

interface OutreachPackage {
  fullMessage: string;
}

const websiteBadgeStyle = (ws: string): React.CSSProperties => {
  const colors: Record<string, { bg: string; color: string }> = {
    none: { bg: "rgba(239,68,68,0.1)", color: "#dc2626" },
    social: { bg: "rgba(245,158,11,0.1)", color: "#d97706" },
    basic: { bg: "rgba(99,102,241,0.1)", color: "#6366f1" },
  };
  const c = colors[ws] ?? { bg: "rgba(0,0,0,0.05)", color: "var(--text-secondary)" };
  return { background: c.bg, color: c.color, padding: "2px 8px", borderRadius: "6px", fontSize: "0.7rem", fontWeight: 600 };
};

const aiBadgeStyle = (status: string): React.CSSProperties => {
  const colors: Record<string, { bg: string; color: string }> = {
    no_site_found: { bg: "rgba(34,197,94,0.1)", color: "#16a34a" },
    site_found: { bg: "rgba(239,68,68,0.1)", color: "#dc2626" },
    weak_site_found: { bg: "rgba(245,158,11,0.1)", color: "#d97706" },
    uncertain: { bg: "rgba(99,102,241,0.1)", color: "#6366f1" },
    mismatch: { bg: "rgba(107,114,128,0.1)", color: "#4b5563" },
    error: { bg: "rgba(239,68,68,0.1)", color: "#dc2626" },
  };
  const c = colors[status] ?? { bg: "rgba(0,0,0,0.05)", color: "var(--text-secondary)" };
  return { background: c.bg, color: c.color, padding: "2px 8px", borderRadius: "6px", fontSize: "0.7rem", fontWeight: 600 };
};

function websiteFindingLabel(lead: Lead): string {
  if (lead.ai_verification_status === "no_site_found" || lead.ai_website_viability_status === "directory_only") {
    return "Verified no usable website";
  }
  if (lead.ai_verification_status === "weak_site_found") {
    return `Weak site: ${lead.ai_website_viability_status ?? "unknown"}`;
  }
  return lead.ai_verification_status.replace(/_/g, " ");
}

export function QueueClient({ initialQueue, manualReviewQueue, scoreThresholds }: { initialQueue: Lead[]; manualReviewQueue: Lead[]; scoreThresholds: ScoreBandThresholds }) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [packages, setPackages] = useState<Record<string, string>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [aiBatchLoading, setAiBatchLoading] = useState(false);
  const [aiBatchMsg, setAiBatchMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "brief_missing" | "report_missing" | "demo_missing" | "high_confidence" | "manual_review">("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pitchPackLoading, setPitchPackLoading] = useState(false);

  useEffect(() => {
    const refresh = () => router.refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router]);

  const handleGenerate = async (leadId: string) => {
    if (packages[leadId]) {
      setExpandedId(expandedId === leadId ? null : leadId);
      return;
    }
    setLoadingId(leadId);
    const result = await generateOutreachPackageAction(leadId);
    if ("fullMessage" in result) {
      setPackages((prev) => ({ ...prev, [leadId]: (result as OutreachPackage).fullMessage }));
      setExpandedId(leadId);
    }
    setLoadingId(null);
  };

  const copyPhone = (phone: string, leadId: string) => {
    navigator.clipboard.writeText(phone);
    setCopied(leadId);
    setTimeout(() => setCopied(null), 2000);
  };

  const copyMessage = (leadId: string) => {
    if (packages[leadId]) {
      navigator.clipboard.writeText(packages[leadId]);
      setCopied(`msg-${leadId}`);
      setTimeout(() => setCopied(null), 2000);
    }
  };

  const copyDemoPitch = (lead: Lead) => {
    if (!lead.demo_slug) return;
    const demoUrl = `${window.location.origin}/demo/${lead.demo_slug}`;
    const pitch = [
      `${lead.name ?? "This business"} looks like a verified website opportunity.`,
      `Finding: ${websiteFindingLabel(lead)}.`,
      `Demo: ${demoUrl}`,
      lead.next_best_action ? `Next action: ${lead.next_best_action}` : null,
    ].filter(Boolean).join("\n");
    navigator.clipboard.writeText(pitch);
    setCopied(`demo-${lead.id}`);
    setTimeout(() => setCopied(null), 2000);
  };

  const markContacted = async (lead: Lead) => {
    await updateLeadStatusAction(lead.id, "contacted");
    await logOutreachEventAction(lead.id, lead.phone ? "call" : "other", "Marked contacted from Now Queue");
    router.refresh();
  };

  const verifyTopLeads = async () => {
    setAiBatchLoading(true);
    setAiBatchMsg(null);
    const result = await runAiVerificationBatchAction({ limit: 10 });
    if ("error" in result) {
      setAiBatchMsg(result.error ?? "AI verification failed");
    } else {
      setAiBatchMsg(`AI checked ${result.processed} leads (${result.verified} new, ${result.cached} cached)`);
      router.refresh();
    }
    setAiBatchLoading(false);
  };

  const baseQueue = filter === "manual_review" ? manualReviewQueue : initialQueue;
  const filteredQueue = baseQueue.filter((lead) => {
    if (filter === "brief_missing") return lead.business_detail_status !== "complete";
    if (filter === "report_missing") return lead.competitive_report_status !== "complete";
    if (filter === "demo_missing") return !lead.demo_slug;
    if (filter === "high_confidence") return lead.ai_confidence >= 0.8;
    return true;
  });

  const selectedReadyLeads = baseQueue.filter((lead) =>
    selectedIds.includes(lead.id) && ["ready_to_call", "broken_site_opportunity"].includes(lead.quality_bucket)
  );

  const toggleSelected = (leadId: string) => {
    setSelectedIds((previous) =>
      previous.includes(leadId) ? previous.filter((id) => id !== leadId) : [...previous, leadId]
    );
  };

  const generateSelectedPitchPacks = async () => {
    setPitchPackLoading(true);
    let queued = 0;
    for (const lead of selectedReadyLeads) {
      const result = await queueLeadPitchPackAction(lead.id);
      if (!("error" in result)) queued++;
    }
    setAiBatchMsg(`Queued pitch packs for ${queued} selected leads`);
    setSelectedIds([]);
    router.refresh();
    setPitchPackLoading(false);
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <PageShell
      title="Now Queue"
      description="Top actionable leads prioritized by score, contactability, and freshness. Work through these first."
      stats={[
        { label: "Queue Size", value: String(initialQueue.length) },
        { label: "Shown", value: String(filteredQueue.length) },
        { label: "Selected", value: String(selectedIds.length) },
      ]}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {[
            ["all", "All"],
            ["brief_missing", "Brief missing"],
            ["report_missing", "Report missing"],
            ["demo_missing", "Demo missing"],
            ["high_confidence", "High confidence"],
            ["manual_review", "Needs review"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={filter === value ? "btn-primary text-xs" : "btn-glass text-xs"}
              onClick={() => setFilter(value as typeof filter)}
            >
              {label}
            </button>
          ))}
        </div>
        {aiBatchMsg && (
          <span className="text-xs" style={{ color: aiBatchMsg.includes("failed") || aiBatchMsg.includes("disabled") ? "#dc2626" : "#16a34a" }}>
            {aiBatchMsg}
          </span>
        )}
        <button
          type="button"
          className="btn-glass text-xs"
          disabled={pitchPackLoading || selectedReadyLeads.length === 0}
          onClick={generateSelectedPitchPacks}
        >
          {pitchPackLoading ? "Queueing..." : `Generate Pitch Pack (${selectedReadyLeads.length})`}
        </button>
        <button
          type="button"
          className="btn-glass text-xs"
          disabled={aiBatchLoading}
          onClick={verifyTopLeads}
        >
          {aiBatchLoading ? "Checking..." : "AI Verify Top 10"}
        </button>
        <button
          type="button"
          className="btn-glass text-xs"
          disabled={refreshing}
          onClick={() => {
            setRefreshing(true);
            router.refresh();
            setTimeout(() => setRefreshing(false), 400);
          }}
        >
          {refreshing ? "Refreshing..." : "Refresh Queue"}
        </button>
      </div>

      <div className="mb-3">
        <ScoreBandLegend thresholds={scoreThresholds} />
      </div>

      {filteredQueue.length === 0 ? (
        <section className="glass rounded-2xl p-6">
          <div className="rounded-xl p-5 text-center text-sm"
            style={{ background: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.4)", color: "var(--text-tertiary)" }}>
            No actionable leads in queue. Run a crawl from the Dashboard to discover leads.
          </div>
        </section>
      ) : (
        <section className="space-y-3">
          {filteredQueue.map((lead, i) => {
            const isUrgent = lead.reminder_date && lead.reminder_date <= today;
            return (
              <article key={lead.id} className="glass rounded-2xl p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(lead.id)}
                        onChange={() => toggleSelected(lead.id)}
                        aria-label={`Select ${lead.name ?? "lead"}`}
                      />
                      <span className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>#{i + 1}</span>
                      <Link href={`/leads/${lead.id}`} className="link-accent font-medium text-sm">
                        {lead.name ?? "Unknown"}
                      </Link>
                      <span style={websiteBadgeStyle(lead.website_status)}>{lead.website_status}</span>
                      <span style={aiBadgeStyle(lead.ai_verification_status)}>
                        AI {lead.ai_verification_status.replace(/_/g, " ")}
                      </span>
                      <ArtifactBadge type="brief" status={lead.business_detail_status} />
                      <ArtifactBadge type="report" status={lead.competitive_report_status} />
                      <DemoBadge ready={Boolean(lead.demo_slug)} />
                      {isUrgent && (
                        <span style={{ background: "rgba(239,68,68,0.1)", color: "#dc2626", padding: "2px 8px", borderRadius: "6px", fontSize: "0.7rem", fontWeight: 600 }}>
                          follow up
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                      {lead.phone && (
                        <button type="button" onClick={() => copyPhone(lead.phone!, lead.id)}
                          className="hover:underline" style={{ color: "var(--text-primary)" }}>
                          {lead.phone} {copied === lead.id ? "✓" : ""}
                        </button>
                      )}
                      <span>{lead.categories[0]?.replace(/_/g, " ") ?? "—"}</span>
                      {lead.rating && <span>{lead.rating.toFixed(1)} ({lead.review_count})</span>}
                      <span>Win {Math.round(lead.win_probability_score)}%</span>
                      <span>Priority {Math.round(lead.sales_priority_score)}%</span>
                      {lead.ai_found_website_url && lead.ai_website_viability_status === "usable" && <span>AI usable site</span>}
                      {lead.ai_found_website_url && ["broken", "parked", "placeholder"].includes(lead.ai_website_viability_status ?? "") && <span>AI weak site opportunity</span>}
                      {lead.last_contacted_at && (
                        <span>Last: {new Date(lead.last_contacted_at).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <ScoreBandBadge score={lead.score} thresholds={scoreThresholds} />
                    {lead.phone && (
                      <a className="btn-glass text-xs" href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`}>
                        Call
                      </a>
                    )}
                    <button
                      type="button"
                      className="btn-primary text-xs"
                      onClick={() => handleGenerate(lead.id)}
                      disabled={loadingId === lead.id}
                    >
                      {loadingId === lead.id ? "..." : packages[lead.id] ? (expandedId === lead.id ? "Hide" : "Show") : "Outreach"}
                    </button>
                    <button type="button" className="btn-glass text-xs" onClick={() => markContacted(lead)}>
                      Contacted
                    </button>
                  </div>
                </div>

                <div className="mt-4 rounded-xl p-4 text-xs" style={{ background: "rgba(255,255,255,0.3)", border: "1px solid rgba(255,255,255,0.4)", color: "var(--text-secondary)" }}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="section-label">Call Sheet</span>
                    {lead.demo_slug && (
                      <button type="button" className="btn-glass text-xs" onClick={() => copyDemoPitch(lead)}>
                        {copied === `demo-${lead.id}` ? "Copied!" : "Copy Demo Pitch"}
                      </button>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <CallSheetItem label="Website finding" value={websiteFindingLabel(lead)} />
                    <CallSheetItem label="Evidence" value={`${Math.round((lead.ai_confidence ?? 0) * 100)}% confidence${lead.ai_checked_at ? `, ${new Date(lead.ai_checked_at).toLocaleDateString()}` : ""}`} />
                    <CallSheetItem label="Phone" value={`${lead.phone ?? "No phone"} (${lead.phone_verification_status.replace(/_/g, " ")})`} />
                    <CallSheetItem label="Offer" value={lead.recommended_offer.replace(/_/g, " ")} />
                    <CallSheetItem label="Next action" value={lead.next_best_action ?? "Call and qualify owner interest."} />
                    <CallSheetItem label="Last contact" value={lead.last_contacted_at ? new Date(lead.last_contacted_at).toLocaleDateString() : "Not contacted"} />
                    <CallSheetItem label="Follow-up" value={lead.reminder_date ? new Date(lead.reminder_date).toLocaleDateString() : "No reminder"} />
                    <CallSheetItem label="Demo" value={lead.demo_slug ? `/demo/${lead.demo_slug}` : "No demo yet"} href={lead.demo_slug ? `/demo/${lead.demo_slug}` : undefined} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <ScoreChip label="Raw" value={lead.raw_opportunity_score} />
                    <ScoreChip label="Verify" value={lead.verification_score} />
                    <ScoreChip label="Quality" value={lead.lead_quality_score} />
                    <ScoreChip label="Sales" value={lead.sales_priority_score} />
                    <ScoreChip label="Deal" value={lead.estimated_deal_value} money />
                  </div>
                </div>

                {expandedId === lead.id && packages[lead.id] && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="section-label">Outreach Message</span>
                      <button type="button" className="btn-glass text-xs" onClick={() => copyMessage(lead.id)}>
                        {copied === `msg-${lead.id}` ? "Copied!" : "Copy All"}
                      </button>
                    </div>
                    <div className="whitespace-pre-wrap rounded-xl p-4 text-sm leading-relaxed"
                      style={{ background: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.4)", color: "var(--text-primary)" }}>
                      {packages[lead.id]}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}
    </PageShell>
  );
}

function CallSheetItem({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div>
      <p className="font-medium" style={{ color: "var(--text-tertiary)" }}>{label}</p>
      {href ? (
        <Link href={href} target="_blank" className="link-accent break-all">{value}</Link>
      ) : (
        <p className="mt-0.5" style={{ color: "var(--text-primary)" }}>{value}</p>
      )}
    </div>
  );
}

function ScoreChip({ label, value, money = false }: { label: string; value: number; money?: boolean }) {
  return (
    <span className="rounded-md px-2 py-1" style={{ background: "rgba(255,255,255,0.45)", color: "var(--text-secondary)" }}>
      {label}: {money ? `$${Math.round(value).toLocaleString()}` : `${Math.round(value)}%`}
    </span>
  );
}

function ArtifactBadge({ type, status }: { type: "brief" | "report"; status: string | null }) {
  const label = artifactBadgeLabel(type, status);
  const color = status === "complete"
    ? { bg: "rgba(34,197,94,0.1)", color: "#16a34a" }
    : status === "queued" || status === "running"
      ? { bg: "rgba(99,102,241,0.1)", color: "#6366f1" }
      : status === "error"
        ? { bg: "rgba(239,68,68,0.1)", color: "#dc2626" }
        : { bg: "rgba(107,114,128,0.1)", color: "#4b5563" };
  return (
    <span style={{ background: color.bg, color: color.color, padding: "2px 8px", borderRadius: "6px", fontSize: "0.7rem", fontWeight: 600 }}>
      {label}
    </span>
  );
}

function DemoBadge({ ready }: { ready: boolean }) {
  return (
    <span style={{
      background: ready ? "rgba(34,197,94,0.1)" : "rgba(107,114,128,0.1)",
      color: ready ? "#16a34a" : "#4b5563",
      padding: "2px 8px",
      borderRadius: "6px",
      fontSize: "0.7rem",
      fontWeight: 600,
    }}>
      {ready ? "Demo ready" : "Demo missing"}
    </span>
  );
}

function artifactBadgeLabel(type: "brief" | "report", status: string | null): string {
  if (status === "complete") return type === "brief" ? "Brief ready" : "Report ready";
  if (status === "queued" || status === "running") return "Generating";
  return "Missing";
}
