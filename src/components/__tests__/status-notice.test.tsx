import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatusNotice } from "@/components/status-notice";

describe("StatusNotice", () => {
  it("announces errors assertively with semantic danger tokens", () => {
    const html = renderToStaticMarkup(
      <StatusNotice notice={{ text: "Unable to update request", tone: "danger" }} />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="assertive"');
    expect(html).toContain("var(--danger-bg)");
    expect(html).toContain("Unable to update request");
  });

  it("announces successful updates politely", () => {
    const html = renderToStaticMarkup(
      <StatusNotice notice={{ text: "Contact logged", tone: "success" }} compact />,
    );

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("var(--success-bg)");
  });
});
