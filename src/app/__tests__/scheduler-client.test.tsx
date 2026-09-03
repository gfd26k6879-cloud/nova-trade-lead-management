import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/crawl/actions", () => ({
  getSchedulerOperationsAction: vi.fn(),
}));

import { SchedulerClient } from "@/app/(protected)/scheduler/scheduler-client";
import { buildSchedulerOperationsFallback } from "@/lib/db/queries";

describe("SchedulerClient global worker controls", () => {
  it("keeps scheduler health visible without exposing platform-global mutations", () => {
    const html = renderToStaticMarkup(
      <SchedulerClient initialOperations={buildSchedulerOperationsFallback("test fallback")} />,
    );

    expect(html).toContain("Scheduler");
    expect(html).toContain("Worker controls are managed at platform level");
    expect(html).not.toContain("Pause All");
    expect(html).not.toContain("Resume Recommended");
    expect(html).not.toContain(">Pause</button>");
    expect(html).not.toContain(">Resume</button>");
  });
});
