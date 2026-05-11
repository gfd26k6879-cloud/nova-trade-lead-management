export type ScoreBandKey = "low" | "fair" | "good" | "high" | "hot" | "probably_win";

export interface ScoreBandThresholds {
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p97: number;
  sampleSize: number;
  minScore: number;
  maxScore: number;
  usesFallback: boolean;
}

export interface ScoreBandDefinition {
  key: ScoreBandKey;
  label: string;
  description: string;
}

export interface ScoreBandStyle {
  background: string;
  border: string;
  color: string;
}

const MIN_DYNAMIC_SAMPLE_SIZE = 20;

export const SCORE_BAND_DEFINITIONS: readonly ScoreBandDefinition[] = [
  { key: "low", label: "Low", description: "Lower priority right now" },
  { key: "fair", label: "Fair", description: "Qualified baseline" },
  { key: "good", label: "Good", description: "Strong outreach candidate" },
  { key: "high", label: "High", description: "High-priority outreach candidate" },
  { key: "hot", label: "Hot", description: "Top-priority potential win" },
  { key: "probably_win", label: "Probably a Win", description: "Exceptional fit and very likely to convert" },
];

export const SCORE_BAND_STYLE_MAP: Record<ScoreBandKey, ScoreBandStyle> = {
  low: {
    background: "rgba(100,116,139,0.12)",
    border: "rgba(100,116,139,0.25)",
    color: "#475569",
  },
  fair: {
    background: "rgba(245,158,11,0.12)",
    border: "rgba(245,158,11,0.25)",
    color: "#b45309",
  },
  good: {
    background: "rgba(14,165,233,0.12)",
    border: "rgba(14,165,233,0.25)",
    color: "#0369a1",
  },
  high: {
    background: "rgba(34,197,94,0.12)",
    border: "rgba(34,197,94,0.25)",
    color: "#15803d",
  },
  hot: {
    background: "rgba(147,51,234,0.12)",
    border: "rgba(147,51,234,0.25)",
    color: "#7e22ce",
  },
  probably_win: {
    background: "rgba(234,179,8,0.16)",
    border: "rgba(234,179,8,0.35)",
    color: "#a16207",
  },
};

const FALLBACK_THRESHOLDS = {
  p25: 5,
  p50: 10,
  p75: 16,
  p90: 19,
  p97: 22,
};

const fallbackMin = 0;
const fallbackMax = FALLBACK_THRESHOLDS.p97;

export function getDefaultScoreBandThresholds(): ScoreBandThresholds {
  return {
    ...FALLBACK_THRESHOLDS,
    sampleSize: 0,
    minScore: fallbackMin,
    maxScore: fallbackMax,
    usesFallback: true,
  };
}

export function computeScoreBandThresholds(scores: readonly number[]): ScoreBandThresholds {
  const sorted = scores
    .filter((score) => Number.isFinite(score) && score > 0)
    .map((score) => Number(score))
    .sort((a, b) => a - b);

  if (sorted.length < MIN_DYNAMIC_SAMPLE_SIZE) {
    const defaults = getDefaultScoreBandThresholds();
    const observedMin = sorted.length > 0 ? roundScore(sorted[0]) : fallbackMin;
    const observedMax = sorted.length > 0 ? roundScore(sorted[sorted.length - 1]) : fallbackMax;
    return {
      ...defaults,
      sampleSize: sorted.length,
      minScore: observedMin,
      maxScore: observedMax,
    };
  }

  const p25 = roundScore(percentile(sorted, 0.25));
  const p50 = roundScore(Math.max(p25, percentile(sorted, 0.5)));
  const p75 = roundScore(Math.max(p50, percentile(sorted, 0.75)));
  const p90 = roundScore(Math.max(p75, percentile(sorted, 0.9)));
  const p97 = roundScore(Math.max(p90, percentile(sorted, 0.97)));

  return {
    p25,
    p50,
    p75,
    p90,
    p97,
    sampleSize: sorted.length,
    minScore: roundScore(sorted[0]),
    maxScore: roundScore(sorted[sorted.length - 1]),
    usesFallback: false,
  };
}

export function resolveScoreBand(score: number, thresholds: ScoreBandThresholds): ScoreBandDefinition {
  if (!Number.isFinite(score) || score <= 0) {
    return getScoreBandDefinition("low");
  }
  if (score <= thresholds.p25) return getScoreBandDefinition("low");
  if (score <= thresholds.p50) return getScoreBandDefinition("fair");
  if (score <= thresholds.p75) return getScoreBandDefinition("good");
  if (score <= thresholds.p90) return getScoreBandDefinition("high");
  if (score <= thresholds.p97) return getScoreBandDefinition("hot");
  return getScoreBandDefinition("probably_win");
}

export function getScoreBandStyle(key: ScoreBandKey): ScoreBandStyle {
  return SCORE_BAND_STYLE_MAP[key];
}

export function formatScoreBandRange(key: ScoreBandKey, thresholds: ScoreBandThresholds): string {
  const p25 = formatScore(thresholds.p25);
  const p50 = formatScore(thresholds.p50);
  const p75 = formatScore(thresholds.p75);
  const p90 = formatScore(thresholds.p90);
  const p97 = formatScore(thresholds.p97);

  if (key === "low") return `<= ${p25}`;
  if (key === "fair") return `${p25} - ${p50}`;
  if (key === "good") return `${p50} - ${p75}`;
  if (key === "high") return `${p75} - ${p90}`;
  if (key === "hot") return `${p90} - ${p97}`;
  return `> ${p97}`;
}

export function formatScore(score: number): string {
  return roundScore(score).toFixed(1);
}

function getScoreBandDefinition(key: ScoreBandKey): ScoreBandDefinition {
  return SCORE_BAND_DEFINITIONS.find((band) => band.key === key) ?? SCORE_BAND_DEFINITIONS[0];
}

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];

  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) return sorted[lower];

  const weight = index - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * weight;
}
