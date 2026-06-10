"use client";

import {
  SCORE_BAND_DEFINITIONS,
  formatScoreBandRange,
  getScoreBandStyle,
  type ScoreBandThresholds,
} from "@/lib/score-bands";

export function ScoreBandLegend({ thresholds }: { thresholds: ScoreBandThresholds }) {
  return (
    <section
      className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2"
      style={{ background: "var(--surface-card)", border: "1px solid var(--surface-card-border)" }}
    >
      <span className="section-label mr-1">Score Bands</span>
      <div className="flex min-w-0 flex-1 flex-wrap gap-2">
        {SCORE_BAND_DEFINITIONS.map((band) => {
          const style = getScoreBandStyle(band.key);
          return (
            <span
              key={band.key}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold"
              style={{
                background: style.background,
                borderColor: style.border,
                color: style.color,
              }}
              title={band.description}
            >
              <span>{band.label}</span>
              <span style={{ color: "var(--text-secondary)" }}>{formatScoreBandRange(band.key, thresholds)}</span>
            </span>
          );
        })}
      </div>
      <span className="text-[0.68rem]" style={{ color: "var(--text-tertiary)" }}>
        {thresholds.usesFallback ? "Fallback thresholds" : `${thresholds.sampleSize} lead sample`}
      </span>
    </section>
  );
}
