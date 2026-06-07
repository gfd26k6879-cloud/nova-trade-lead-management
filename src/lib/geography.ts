export type CountryCode = "US" | "CA" | "GB";

export type LocationCellType =
  | "zip"
  | "postal_fsa"
  | "postcode_area"
  | "postcode_outward"
  | "city"
  | "county"
  | "province"
  | "region"
  | "custom_market";

export interface GeographyInput {
  countryCode: CountryCode;
  adminArea1?: string | null;
  adminArea2?: string | null;
  locality?: string | null;
  postalCode?: string | null;
  cellType?: LocationCellType | string | null;
}

export const COUNTRY_NAMES: Record<CountryCode, string> = {
  US: "United States",
  CA: "Canada",
  GB: "United Kingdom",
};

export const COUNTRY_LABELS: Record<CountryCode, string> = {
  US: "U.S.",
  CA: "Canada",
  GB: "U.K.",
};

export function normalizeCountryCode(value: unknown): CountryCode {
  const normalized = String(value ?? "US").trim().toUpperCase();
  if (normalized === "CA") return "CA";
  if (normalized === "GB" || normalized === "UK") return "GB";
  return "US";
}

export function normalizePostalCode(countryCode: CountryCode, value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const compact = raw.toUpperCase().replace(/\s+/g, "");
  if (countryCode === "US") return compact.slice(0, 5);
  if (countryCode === "CA") return compact.slice(0, 3);
  if (countryCode === "GB") {
    const outward = compact.match(/^[A-Z]{1,2}\d[A-Z\d]?/)?.[0];
    return outward ?? compact;
  }
  return compact;
}

export function isValidPostalCell(countryCode: CountryCode, value: string, cellType?: string | null): boolean {
  const normalized = normalizePostalCode(countryCode, value);
  if (!normalized) return false;
  if (countryCode === "US") return /^\d{5}$/.test(normalized);
  if (countryCode === "CA") return /^[A-Z]\d[A-Z]$/.test(normalized);
  if (countryCode === "GB") {
    if (cellType === "postcode_area") return /^[A-Z]{1,2}$/.test(normalized);
    return /^[A-Z]{1,2}\d[A-Z\d]?$/.test(normalized);
  }
  return false;
}

export function defaultCellTypeForCountry(countryCode: CountryCode): LocationCellType {
  if (countryCode === "CA") return "postal_fsa";
  if (countryCode === "GB") return "postcode_outward";
  return "zip";
}

export function formatCountryLabel(countryCode: string | null | undefined): string {
  return COUNTRY_LABELS[normalizeCountryCode(countryCode)] ?? "Unknown";
}

export function buildQueryLocationLabel(input: GeographyInput): string {
  const countryCode = normalizeCountryCode(input.countryCode);
  const postal = normalizePostalCode(countryCode, input.postalCode);
  const parts: string[] = [];

  if (input.locality) parts.push(input.locality.trim());
  if (input.adminArea2 && input.cellType === "county") parts.push(input.adminArea2.trim());
  if (input.adminArea1) parts.push(input.adminArea1.trim());
  if (postal) parts.push(postal);

  const deduped = parts.filter((part, index) => part && parts.indexOf(part) === index);
  deduped.push(COUNTRY_NAMES[countryCode]);
  return deduped.join(", ");
}

export function buildCellLabel(input: GeographyInput): string {
  const countryCode = normalizeCountryCode(input.countryCode);
  const postal = normalizePostalCode(countryCode, input.postalCode);
  if (countryCode === "US" && postal) return [input.locality, input.adminArea1, postal].filter(Boolean).join(" ");
  if (countryCode === "CA" && postal) return [input.locality, input.adminArea1, postal].filter(Boolean).join(" ");
  if (countryCode === "GB" && postal) return [input.locality, postal].filter(Boolean).join(" ");
  return [input.locality, input.adminArea2, input.adminArea1, COUNTRY_LABELS[countryCode]].filter(Boolean).join(", ");
}
