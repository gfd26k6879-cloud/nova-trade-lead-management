import type { CSSProperties } from "react";
import { getAiVerificationDisplay, type AiVerificationDisplayInput, type AiVerificationTone } from "@/lib/ai-verification-display";

interface AiVerificationBadgeProps extends AiVerificationDisplayInput {
  confidence?: number | null;
  compact?: boolean;
  showDetail?: boolean;
}

const TONE_STYLES: Record<AiVerificationTone, { container: CSSProperties; dot: string }> = {
  muted: { container: { background: "rgba(107,114,128,0.12)", color: "#4b5563", borderColor: "rgba(107,114,128,0.2)" }, dot: "#4b5563" },
  pending: { container: { background: "rgba(99,102,241,0.12)", color: "#4338ca", borderColor: "rgba(99,102,241,0.22)" }, dot: "#4338ca" },
  good: { container: { background: "rgba(34,197,94,0.12)", color: "#166534", borderColor: "rgba(34,197,94,0.22)" }, dot: "#166534" },
  warning: { container: { background: "rgba(245,158,11,0.14)", color: "#92400e", borderColor: "rgba(245,158,11,0.25)" }, dot: "#92400e" },
  bad: { container: { background: "rgba(239,68,68,0.12)", color: "#991b1b", borderColor: "rgba(239,68,68,0.24)" }, dot: "#991b1b" },
  review: { container: { background: "rgba(14,165,233,0.12)", color: "#075985", borderColor: "rgba(14,165,233,0.24)" }, dot: "#075985" },
};

export function AiVerificationBadge({
  status,
  checkedAt,
  queueStatus,
  viability,
  confidence,
  compact = false,
  showDetail = false,
}: AiVerificationBadgeProps) {
  const display = getAiVerificationDisplay({ status, checkedAt, queueStatus, viability });
  const confidenceLabel = display.hasRun && typeof confidence === "number"
    ? `Confidence ${Math.round(confidence * 100)}%`
    : null;
  const checkedLabel = checkedAt ? `Checked ${formatCheckedAt(checkedAt)}` : null;
  const title = [display.detail, confidenceLabel, checkedLabel].filter(Boolean).join(" ");

  return (
    <span className={showDetail ? "inline-flex flex-col items-start gap-1" : "inline-flex"}>
      <span
        className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold"
        style={TONE_STYLES[display.tone].container}
        title={title}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: TONE_STYLES[display.tone].dot }} />
        {compact ? display.label.replace("AI run: ", "") : display.label}
      </span>
      {showDetail && (
        <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          {confidenceLabel ?? display.detail}
        </span>
      )}
    </span>
  );
}

function formatCheckedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString();
}
