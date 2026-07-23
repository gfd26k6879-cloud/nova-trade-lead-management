import type { CSSProperties } from "react";
import { getAiVerificationDisplay, type AiVerificationDisplayInput, type AiVerificationTone } from "@/lib/ai-verification-display";
import { getStatusToneColor, getStatusToneStyle, type StatusTone } from "@/lib/status-tone";

interface AiVerificationBadgeProps extends AiVerificationDisplayInput {
  confidence?: number | null;
  compact?: boolean;
  showDetail?: boolean;
}

const AI_TONE_TO_STATUS_TONE: Record<AiVerificationTone, StatusTone> = {
  muted: "muted",
  pending: "info",
  good: "success",
  warning: "warning",
  bad: "danger",
  review: "info",
};

function verificationToneStyle(tone: AiVerificationTone): { container: CSSProperties; dot: string } {
  const statusTone = AI_TONE_TO_STATUS_TONE[tone];
  return { container: getStatusToneStyle(statusTone), dot: getStatusToneColor(statusTone) };
}

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
  const toneStyle = verificationToneStyle(display.tone);

  return (
    <span className={showDetail ? "inline-flex flex-col items-start gap-1" : "inline-flex"}>
      <span
        className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold"
        style={toneStyle.container}
        title={title}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: toneStyle.dot }} />
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
