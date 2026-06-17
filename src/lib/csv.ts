export function csvEscape(val: string | null | undefined): string {
  if (!val) return "";
  const safeValue = startsWithSpreadsheetFormula(val) ? `'${val}` : val;
  if (safeValue.includes(",") || safeValue.includes('"') || safeValue.includes("\n") || safeValue.includes("\r")) {
    return `"${safeValue.replace(/"/g, '""')}"`;
  }
  return safeValue;
}

function startsWithSpreadsheetFormula(value: string): boolean {
  const firstMeaningfulChar = firstNonIgnoredCsvFormulaChar(value);
  return firstMeaningfulChar === "=" || firstMeaningfulChar === "+" || firstMeaningfulChar === "-" || firstMeaningfulChar === "@";
}

function firstNonIgnoredCsvFormulaChar(value: string): string | undefined {
  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0;
    const isControl = codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
    if (char === "\ufeff" || isControl || /\s/u.test(char)) continue;
    return char;
  }
  return undefined;
}
