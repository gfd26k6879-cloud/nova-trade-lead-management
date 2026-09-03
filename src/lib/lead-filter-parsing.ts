export const POSTGRES_INT4_MAX = 2_147_483_647;

const NONNEGATIVE_DECIMAL_INTEGER = /^\+?[0-9]+$/;

export function parseMinReviewsFilter(value: unknown): number | undefined {
  let parsed: number;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || !NONNEGATIVE_DECIMAL_INTEGER.test(trimmed)) return undefined;
    parsed = Number(trimmed);
  } else if (typeof value === "number") {
    parsed = value;
  } else {
    return undefined;
  }

  if (!Number.isFinite(parsed) || !Number.isSafeInteger(parsed) || parsed < 0) {
    return undefined;
  }

  return Object.is(parsed, -0) ? 0 : parsed;
}
