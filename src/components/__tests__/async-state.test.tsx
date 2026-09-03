import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AsyncState } from "@/components/async-state";

describe("AsyncState", () => {
  it("announces retriable errors without exposing implementation detail", () => {
    const html = renderToStaticMarkup(
      <AsyncState
        variant="error"
        title="Materials could not be loaded"
        description="Your saved intake is unchanged. Try again."
        action={<button type="button">Try again</button>}
      />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain("Materials could not be loaded");
    expect(html).toContain("Your saved intake is unchanged. Try again.");
    expect(html).toContain("Try again");
  });

  it("marks loading regions busy and announces them politely", () => {
    const html = renderToStaticMarkup(
      <AsyncState variant="loading" title="Loading intake queue" description="Checking saved sources." />,
    );

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Loading intake queue");
  });

  it("gives access-denied users a safe destination without protected content", () => {
    const html = renderToStaticMarkup(
      <AsyncState
        variant="access-denied"
        title="This setup step is not available"
        description="Ask a tenant owner for setup access."
        action={<a href="/dashboard">Back to dashboard</a>}
      />,
    );

    expect(html).toContain("This setup step is not available");
    expect(html).toContain('href="/dashboard"');
    expect(html).not.toContain("tenant-000");
  });
});
