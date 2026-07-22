import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TextPromptDialog } from "@/components/text-prompt-dialog";

describe("TextPromptDialog", () => {
  it("renders a labelled text field and announced validation error", () => {
    const html = renderToStaticMarkup(
      <TextPromptDialog
        open
        title="Archive selected leads?"
        message="History will be preserved."
        label="Archive reason"
        value="no"
        confirmLabel="Archive selected"
        error="Archive reason must be at least 5 characters."
        onChange={vi.fn()}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('role="alert"');
    expect(html).toMatch(/<label[^>]+for="([^"]+)"[^>]*>Archive reason<\/label>/);
  });
});
