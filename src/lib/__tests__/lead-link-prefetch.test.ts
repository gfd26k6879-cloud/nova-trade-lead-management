import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const LEAD_DETAIL_LINK_SURFACES = [
  "src/app/(protected)/dashboard/dashboard-client.tsx",
  "src/app/(protected)/explore/explore-client.tsx",
  "src/app/(protected)/fulfillment/fulfillment-client.tsx",
  "src/app/(protected)/leads/leads-client.tsx",
  "src/app/(protected)/leads/kanban-client.tsx",
  "src/app/(protected)/quality/quality-client.tsx",
  "src/app/(protected)/queue/queue-client.tsx",
  "src/app/(protected)/team/page.tsx",
];

function leadDetailLinksWithoutDisabledPrefetch(filePath: string): string[] {
  const source = readFileSync(path.join(process.cwd(), filePath), "utf8");
  const links = source.match(/<Link\b[\s\S]*?>/g) ?? [];

  return links
    .filter((link) => link.includes("href={`/leads/${"))
    .filter((link) => !link.includes("prefetch={false}"))
    .map((link) => `${filePath}: ${link.replace(/\s+/g, " ").trim()}`);
}

describe("lead detail navigation", () => {
  it("does not prefetch expensive lead detail pages from protected lead surfaces", () => {
    const offenders = LEAD_DETAIL_LINK_SURFACES.flatMap(leadDetailLinksWithoutDisabledPrefetch);

    expect(offenders).toEqual([]);
  });
});
