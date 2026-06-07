import { describe, expect, it } from "vitest";
import {
  buildExploreFilterChips,
  buildExploreQueryState,
  buildExploreSearchSuggestions,
  buildExploreSearchTokens,
  isExplorePresentationChip,
  parseExploreCommand,
} from "@/lib/explore-filters";

describe("explore command filters", () => {
  it("parses location, website, and owner commands", () => {
    const result = parseExploreCommand("city:toronto country:canada website:none owner:unclaimed");

    expect(result.errors).toEqual([]);
    expect(result.filters).toMatchObject({
      city: "toronto",
      countryCode: "CA",
      websiteStatus: "none",
      assigned: "unassigned",
    });
    expect(result.chips.map((chip) => chip.label)).toEqual(["City", "Country", "Website", "Owner"]);
  });

  it("parses numeric threshold commands", () => {
    const result = parseExploreCommand("reviews>50 rating>4.2 score>70");

    expect(result.errors).toEqual([]);
    expect(result.filters).toMatchObject({
      minReviews: "50",
      minRating: "4.2",
      minScore: "70",
    });
  });

  it("parses greater-than-or-equal threshold aliases", () => {
    const result = parseExploreCommand("reviews>=50 rating>=4.2 score>=70");

    expect(result.errors).toEqual([]);
    expect(result.filters).toMatchObject({
      minReviews: "50",
      minRating: "4.2",
      minScore: "70",
    });
  });

  it("preserves free text as search", () => {
    const result = parseExploreCommand("premier plumbing website:none");

    expect(result.filters.search).toBe("premier plumbing");
    expect(result.filters.websiteStatus).toBe("none");
    expect(result.unparsedText).toBe("premier plumbing");
  });

  it("returns helpful feedback for unknown commands", () => {
    const result = parseExploreCommand("webstie:none");

    expect(result.errors[0]).toContain('Unknown filter "webstie"');
    expect(result.errors[0]).toContain("website:none");
  });

  it("builds mode-aware query state", () => {
    const workReady = buildExploreQueryState({}, "user-1");
    const directory = buildExploreQueryState({ mode: "directory" }, "user-1");
    const mine = buildExploreQueryState({ mode: "my_leads" }, "user-1");

    expect(workReady.mode).toBe("work_ready");
    expect(workReady.filters.archived).toBe("active");
    expect(workReady.filters.includeExcluded).toBe(false);
    expect(directory.filters.archived).toBe("all");
    expect(directory.filters.includeExcluded).toBe(true);
    expect(mine.filters.assignedToUserId).toBe("user-1");
  });

  it("builds removable chips from URL state", () => {
    const chips = buildExploreFilterChips({
      mode: "directory",
      city: "toronto",
      zip: "M5V",
      websiteStatus: "none",
      map: "open",
    });

    expect(chips.map((chip) => `${chip.label}:${chip.value}`)).toContain("Mode:directory");
    expect(chips.map((chip) => `${chip.label}:${chip.value}`)).toContain("City:toronto");
    expect(chips.map((chip) => `${chip.label}:${chip.value}`)).toContain("Postal:M5V");
    expect(chips.find((chip) => chip.key === "map")?.removeParams).toEqual({ map: null });
  });

  it("builds grouped suggestions for quick filters and area presets", () => {
    const groups = buildExploreSearchSuggestions({
      mode: "work_ready",
      query: "",
      showColoradoAreas: true,
      businessTypes: [{ id: "dental", label: "Dental", active: 12, total: 15 }],
    });
    const quick = groups.flatMap((group) => group.suggestions).find((item) => item.label === "Best no-site");
    const area = groups.flatMap((group) => group.suggestions).find((item) => item.label === "Area: Denver");
    const country = groups.flatMap((group) => group.suggestions).find((item) => item.label === "Country: Canada");
    const type = groups.flatMap((group) => group.suggestions).find((item) => item.label === "Type: Dental");

    expect(quick?.updates).toMatchObject({ mode: "work_ready", websiteStatus: "none", assigned: "any", sortBy: "website_need" });
    expect(area?.updates).toMatchObject({ geo: "denver", minLat: null, maxLat: null, minLng: null, maxLng: null });
    expect(country?.updates).toMatchObject({ countryCode: "CA" });
    expect(type?.updates).toMatchObject({ businessType: "dental" });
  });

  it("filters suggestions by label, alias, command, and typo-tolerant field", () => {
    const website = buildExploreSearchSuggestions({ mode: "work_ready", query: "webstie" }).flatMap((group) => group.suggestions);
    const followUps = buildExploreSearchSuggestions({ mode: "work_ready", query: "follow ups" }).flatMap((group) => group.suggestions);

    expect(website.some((item) => item.command === "website:none")).toBe(true);
    expect(followUps.some((item) => item.label === "My follow-ups")).toBe(true);
  });

  it("keeps presentation controls out of lead search tokens", () => {
    const chips = buildExploreFilterChips({
      mode: "directory",
      city: "toronto",
      sortBy: "website_need",
      view: "table",
      map: "open",
    });
    const tokens = buildExploreSearchTokens("directory", chips);

    expect(tokens.map((chip) => chip.key)).toContain("scope");
    expect(tokens.map((chip) => chip.key)).toContain("city");
    expect(tokens.some((chip) => chip.key === "sortBy")).toBe(false);
    expect(chips.filter(isExplorePresentationChip).map((chip) => chip.key)).toEqual(["sortBy", "view", "map"]);
  });

  it("hides admin suggestions for researchers", () => {
    const researcherSuggestions = buildExploreSearchSuggestions({ mode: "work_ready", includeAdmin: false }).flatMap((group) => group.suggestions);
    const adminSuggestions = buildExploreSearchSuggestions({ mode: "work_ready", includeAdmin: true }).flatMap((group) => group.suggestions);

    expect(researcherSuggestions.some((item) => item.label.includes("excluded"))).toBe(false);
    expect(adminSuggestions.some((item) => item.label === "Include excluded")).toBe(true);
  });
});
