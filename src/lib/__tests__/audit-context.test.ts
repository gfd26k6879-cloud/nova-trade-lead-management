import { describe, expect, it } from "vitest";
import { getAuditActor, runWithAuditActor, setAuditActor } from "@/lib/audit-context";

describe("audit actor context", () => {
  it("scopes an actor to sync and async callback completion", async () => {
    const actor = { userId: "user-a", email: "a@example.com", role: "admin" as const };

    runWithAuditActor(actor, () => {
      expect(getAuditActor()).toBe(actor);
    });
    expect(getAuditActor()).toBeNull();

    await runWithAuditActor(actor, async () => {
      await Promise.resolve();
      expect(getAuditActor()).toBe(actor);
    });
    expect(getAuditActor()).toBeNull();
  });

  it("preserves setAuditActor compatibility", () => {
    const actor = { userId: "legacy-user", email: "legacy@example.com", role: "researcher" as const };
    setAuditActor(actor);
    expect(getAuditActor()).toBe(actor);
  });
});
