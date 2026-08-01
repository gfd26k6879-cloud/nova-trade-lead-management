export function isLeadExcluded(value: unknown): boolean {
  return value !== false && !(typeof value === "number" && value === 0);
}
