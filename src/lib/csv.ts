export function csvEscape(val: string | null | undefined): string {
  if (!val) return "";
  const safeValue = /^[=+\-@]/.test(val) ? `'${val}` : val;
  if (safeValue.includes(",") || safeValue.includes('"') || safeValue.includes("\n")) {
    return `"${safeValue.replace(/"/g, '""')}"`;
  }
  return safeValue;
}
