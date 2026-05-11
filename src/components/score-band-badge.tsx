"use client";

import { formatScore, getScoreBandStyle, resolveScoreBand, type ScoreBandThresholds } from "@/lib/score-bands";

interface ScoreBandBadgeProps {
  score: number;
  thresholds: ScoreBandThresholds;
  compact?: boolean;
}

export function ScoreBandBadge({ score, thresholds, compact = false }: ScoreBandBadgeProps) {
  const band = resolveScoreBand(score, thresholds);
  const style = getScoreBandStyle(band.key);

  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold"
      style={{
        background: style.background,
        borderColor: style.border,
        color: style.color,
      }}
      title={`${band.label}: ${band.description}`}
    >
      <span>{formatScore(score)}</span>
      {!compact && <span>{band.label}</span>}
    </span>
  );
}
