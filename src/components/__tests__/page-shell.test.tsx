import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PageShell } from "@/components/page-shell";

describe("PageShell", () => {
  it("renders stats as compact icon pills instead of a text-only strip", () => {
    const source = readFileSync(join(process.cwd(), "src/components/page-shell.tsx"), "utf8");
    const html = renderToStaticMarkup(
      <PageShell
        title="Lead Explorer"
        description="Browse unclaimed inventory."
        stats={[
          { label: "Results", value: "137" },
          { label: "Unclaimed", value: "58", hint: "This page" },
          { label: "No Website", value: "60", hint: "This page" },
          { label: "Needs Review", value: "60", hint: "This page" },
          { label: "Mapped", value: "60", hint: "This page" },
        ]}
      />,
    );

    expect(source).toContain("<dl");
    expect(html).toContain('data-role="page-stat-strip"');
    expect(html).toContain('data-role="page-stat-pill"');
    expect(html).toContain('data-role="page-stat-icon"');
    expect(html).toContain('data-tone="blue"');
    expect(html).toContain('data-tone="green"');
    expect(html).toContain('data-tone="accent"');
    expect(html).toContain('data-tone="red"');
    expect(html).toContain('data-tone="purple"');
    expect(html).toContain("This page");
    expect(source).not.toContain("inline-flex min-w-0 items-baseline");
    expect(source).not.toContain("xl:min-w-32");
    expect(source).not.toContain("<article");
  });
});
