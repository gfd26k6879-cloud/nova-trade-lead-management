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
      className="rounded-xl px-4 py-3"
      style={{ background: "rgba(255,255,255,0.28)", border: "1px solid rgba(255,255,255,0.4)" }}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="section-label">Score Bands</span>
        <span className="text-[0.68rem]" style={{ color: "var(--text-tertiary)" }}>
          {thresholds.usesFallback ? "Fallback thresholds" : `Dynamic from ${thresholds.sampleSize} leads`}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
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
    </section>
  );
}
