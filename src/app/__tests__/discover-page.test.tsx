import { describe, expect, it, vi } from "vitest";

const navigationMocks = vi.hoisted(() => ({
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => navigationMocks);

import DiscoverUppercaseAliasPage from "@/app/discover/page";

describe("Discover alias page", () => {
  it("redirects directly to the dashboard discovery workflow", () => {
    DiscoverUppercaseAliasPage();

    expect(navigationMocks.redirect).toHaveBeenCalledWith("/dashboard#discovery");
  });
});
