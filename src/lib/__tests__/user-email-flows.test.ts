import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "src/lib/users/actions.ts"), "utf8");

function functionBody(name: string, nextName: string): string {
  const start = source.indexOf(`export async function ${name}`);
  const end = source.indexOf(`export async function ${nextName}`);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("user email flows", () => {
  it("sends a Supabase welcome invite when an admin creates a user", () => {
    const body = functionBody("createUserAction", "updateUserRoleAction");

    expect(body).toContain("inviteUserByEmail");
    expect(body).toContain("buildWelcomeInviteUrl");
    expect(body).toContain("app_user_welcome_email_sent");
    expect(body).not.toContain("resetPasswordForEmail");
    expect(body).not.toContain("createUser({");
    expect(body).not.toContain("temporaryPassword");
  });

  it("keeps reset links on the explicit reset-password action only", () => {
    const body = source.slice(source.indexOf("async function sendPasswordResetEmail"));

    expect(body).toContain("resetPasswordForEmail");
    expect(body).toContain("buildPasswordRecoveryUrl");
    expect(body).not.toContain("inviteUserByEmail");
  });

  it("does not delete platform-global identities from a tenant-scoped removal action", () => {
    const body = functionBody("removeUserAction", "updateUserTeamAction");

    expect(body).toContain('requireTenantPermission(selector, "membership:manage"');
    expect(body).toContain("assertTenantResourceOwnership");
    expect(body).toContain("unavailableUserResult");
    expect(body).not.toContain("deleteUser(userId)");
    expect(body).not.toContain("removeAppUser(userId)");
    expect(body).not.toContain("app_user_removed");
  });
});
