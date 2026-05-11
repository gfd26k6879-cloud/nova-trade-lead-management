export const BUSINESS_TYPE_OPTIONS = [
  { id: "dental", label: "Dental" },
  { id: "plumbing", label: "Plumbing" },
  { id: "hvac", label: "HVAC" },
  { id: "electrical", label: "Electrical" },
  { id: "roofing", label: "Roofing" },
  { id: "legal", label: "Legal" },
  { id: "auto_repair", label: "Auto Repair" },
  { id: "veterinary", label: "Veterinary" },
  { id: "chiropractic", label: "Chiropractic" },
  { id: "medical_spa", label: "Medical Spa" },
  { id: "beauty", label: "Beauty" },
  { id: "fitness", label: "Fitness" },
  { id: "restaurant", label: "Restaurant" },
  { id: "real_estate", label: "Real Estate" },
  { id: "insurance", label: "Insurance" },
  { id: "accounting", label: "Accounting" },
  { id: "landscaping", label: "Landscaping" },
  { id: "pest_control", label: "Pest Control" },
  { id: "cleaning", label: "Cleaning" },
  { id: "general_contractor", label: "General Contractor" },
  { id: "local_services", label: "Local Services" },
] as const;

export type BusinessType = (typeof BUSINESS_TYPE_OPTIONS)[number]["id"];

const BUSINESS_TYPE_IDS = new Set<string>(BUSINESS_TYPE_OPTIONS.map((option) => option.id));

const TYPE_RULES: Array<{ id: BusinessType; patterns: RegExp[] }> = [
  { id: "dental", patterns: [/dent/i, /orthodont/i, /periodont/i, /endodont/i] },
  { id: "plumbing", patterns: [/plumb/i] },
  { id: "hvac", patterns: [/hvac/i, /heating/i, /air_condition/i, /air_conditioning/i] },
  { id: "electrical", patterns: [/electric/i] },
  { id: "roofing", patterns: [/roof/i] },
  { id: "legal", patterns: [/law/i, /lawyer/i, /attorney/i, /legal/i] },
  { id: "auto_repair", patterns: [/auto/i, /car_repair/i, /mechanic/i, /tire/i, /body_shop/i] },
  { id: "veterinary", patterns: [/veter/i, /animal_hospital/i, /pet/i] },
  { id: "chiropractic", patterns: [/chiropr/i] },
  { id: "medical_spa", patterns: [/med.?spa/i, /aesthetic/i, /skin/i, /laser/i, /spa/i] },
  { id: "beauty", patterns: [/salon/i, /barber/i, /beauty/i, /hair/i, /nail/i] },
  { id: "fitness", patterns: [/gym/i, /fitness/i, /trainer/i, /yoga/i, /pilates/i] },
  { id: "restaurant", patterns: [/restaurant/i, /cafe/i, /bar/i, /food/i, /bakery/i] },
  { id: "real_estate", patterns: [/real_estate/i, /realtor/i, /property/i] },
  { id: "insurance", patterns: [/insurance/i] },
  { id: "accounting", patterns: [/account/i, /tax/i, /bookkeep/i, /cpa/i] },
  { id: "landscaping", patterns: [/landscap/i, /lawn/i, /tree_service/i] },
  { id: "pest_control", patterns: [/pest/i, /extermin/i] },
  { id: "cleaning", patterns: [/clean/i, /janitorial/i, /maid/i] },
  { id: "general_contractor", patterns: [/general_contractor/i, /contractor/i, /construction/i] },
];

export function isBusinessType(value: string | null | undefined): value is BusinessType {
  return !!value && BUSINESS_TYPE_IDS.has(value);
}

export function getBusinessTypeLabel(value: string | null | undefined): string {
  const option = BUSINESS_TYPE_OPTIONS.find((entry) => entry.id === value);
  return option?.label ?? "Local Services";
}

export function classifyBusinessType(input: {
  primaryType?: string | null;
  categories?: readonly string[] | null;
}): BusinessType {
  const tokens = [
    input.primaryType,
    ...(input.categories ?? []),
  ]
    .filter((value): value is string => !!value)
    .map((value) => value.toLowerCase().replace(/[\s-]+/g, "_"));

  for (const rule of TYPE_RULES) {
    if (tokens.some((token) => rule.patterns.some((pattern) => pattern.test(token)))) {
      return rule.id;
    }
  }

  return "local_services";
}
