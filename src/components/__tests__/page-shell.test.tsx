import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("PageShell", () => {
  it("renders stats as a compact inline strip instead of large metric cards", () => {
    const source = readFileSync(join(process.cwd(), "src/components/page-shell.tsx"), "utf8");

    expect(source).toContain("<dl");
    expect(source).toContain("inline-flex min-w-0 items-baseline");
    expect(source).not.toContain("xl:min-w-32");
    expect(source).not.toContain("<article");
  });
});
