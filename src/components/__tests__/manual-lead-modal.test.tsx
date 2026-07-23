import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/lib/leads/actions", () => ({
  createManualLeadAction: vi.fn(),
}));

import { ManualLeadModal } from "@/components/manual-lead-modal";

describe("ManualLeadModal", () => {
  it("renders optional source fields for a less sparse manual lead", () => {
    const html = renderToStaticMarkup(<ManualLeadModal open onClose={() => undefined} />);

    expect(html).toContain("Maps URL");
    expect(html).toContain("Lead source");
    expect(html).toContain("Contact person");
    expect(html).toContain("Create lead");
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toMatch(/aria-labelledby="[^"]+"/);
    expect(html).toMatch(/aria-describedby="[^"]+"/);
  });
});
