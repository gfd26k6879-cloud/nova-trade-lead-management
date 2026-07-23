import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ReadOnlyActionDeadlineError,
  withReadOnlyActionDeadline,
} from "@/lib/read-only-action-deadline";

afterEach(() => {
  vi.useRealTimers();
});

describe("withReadOnlyActionDeadline", () => {
  it("rejects a hung read when its response deadline expires", async () => {
    vi.useFakeTimers();
    const pending = withReadOnlyActionDeadline(
      "getDashboardStatsAction",
      50,
      new Promise<never>(() => {}),
    );
    const rejection = expect(pending).rejects.toEqual(expect.objectContaining({
      name: "ReadOnlyActionDeadlineError",
      message: "getDashboardStatsAction exceeded its internal response deadline of 50ms.",
    }));

    await vi.advanceTimersByTimeAsync(50);

    await rejection;
    await expect(pending).rejects.toBeInstanceOf(ReadOnlyActionDeadlineError);
  });
});
