import { describe, expect, it } from "vitest";
import { buildExploreFilterChips, buildExploreQueryState, parseExploreCommand } from "@/lib/explore-filters";

describe("explore command filters", () => {
  it("parses location, website, and owner commands", () => {
    const result = parseExploreCommand("city:toronto website:none owner:unclaimed");

    expect(result.errors).toEqual([]);
    expect(result.filters).toMatchObject({
      city: "toronto",
      websiteStatus: "none",
      assigned: "unassigned",
    });
    expect(result.chips.map((chip) => chip.label)).toEqual(["City", "Website", "Owner"]);
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
});
