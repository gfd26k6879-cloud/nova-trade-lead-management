import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "@/components/confirm-dialog";

describe("ConfirmDialog", () => {
  it("renders an explicitly labelled and described modal dialog", () => {
    const html = renderToStaticMarkup(
      <ConfirmDialog
        open
        title="Delete lead?"
        message="This action cannot be undone."
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toMatch(/aria-labelledby="[^"]+"/);
    expect(html).toMatch(/aria-describedby="[^"]+"/);
    expect(html).toContain("Delete lead?");
    expect(html).toContain("This action cannot be undone.");
  });

  it("does not render when closed", () => {
    const html = renderToStaticMarkup(
      <ConfirmDialog
        open={false}
        title="Delete lead?"
        message="This action cannot be undone."
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(html).toBe("");
  });
});
