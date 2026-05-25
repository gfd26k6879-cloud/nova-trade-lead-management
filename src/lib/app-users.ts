import "server-only";

import { getDb, generateId, nowISO } from "@/lib/db";
import { isAppRole, type AppRole } from "@/lib/permissions";

export type AppUserStatus = "active" | "disabled";

export interface AppUser {
  id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  role: AppRole;
  status: AppUserStatus;
  created_by: string | null;
  is_team_lead: boolean;
  team_lead_user_id: string | null;
  team_lead_email: string | null;
  team_lead_display_name: string | null;
  team_label: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppUserSessionProfile {
  userId: string;
  email: string;
  displayName: string | null;
  role: AppRole | null;
  status: AppUserStatus | "pending";
}

export async function ensureAppUserForAuthUser(userId: string, email: string): Promise<AppUserSessionProfile> {
  const normalizedEmail = normalizeEmail(email);
  const existing = await getAppUserByUserId(userId);
  if (existing) {
    await updateLastSeen(userId);
    return toSessionProfile(existing);
  }

  const bootstrapEmail = normalizeEmail(process.env.NOSITE_BOOTSTRAP_ADMIN_EMAIL);
  const adminCount = await countAdminUsers();
  if (bootstrapEmail && normalizedEmail === bootstrapEmail && adminCount === 0) {
    const user = await createAppUserForAuthUser({
      userId,
      email: normalizedEmail,
      displayName: "Admin",
      role: "admin",
      status: "active",
      createdBy: null,
    });
    return toSessionProfile(user);
  }

  return {
    userId,
    email: normalizedEmail,
    displayName: null,
    role: null,
    status: "pending",
  };
}

export async function getAppUserByUserId(userId: string): Promise<AppUser | null> {
  const db = await getDb();
  const row = await db.prepare("SELECT * FROM app_users WHERE user_id = ?").get(userId) as Record<string, unknown> | undefined;
  return row ? parseAppUser(row) : null;
}

export async function getAppUserByEmail(email: string): Promise<AppUser | null> {
  const db = await getDb();
  const row = await db.prepare("SELECT * FROM app_users WHERE lower(email) = lower(?)").get(normalizeEmail(email)) as Record<string, unknown> | undefined;
  return row ? parseAppUser(row) : null;
}

export async function listAppUsers(): Promise<AppUser[]> {
  const db = await getDb();
  const rows = await db.prepare(
    `SELECT au.*, tl.email as team_lead_email, tl.display_name as team_lead_display_name
     FROM app_users au
     LEFT JOIN app_users tl ON tl.user_id = au.team_lead_user_id
     ORDER BY au.role ASC, lower(au.email) ASC`
  ).all<Record<string, unknown>>();
  return rows.map(parseAppUser);
}

export async function createAppUserForAuthUser(input: {
  userId: string;
  email: string;
  displayName?: string | null;
  role: AppRole;
  status?: AppUserStatus;
  createdBy?: string | null;
}): Promise<AppUser> {
  const db = await getDb();
  const now = nowISO();
  const role = isAppRole(input.role) ? input.role : "researcher";
  const status = input.status ?? "active";

  await db.prepare(
    `INSERT INTO app_users (
      id, user_id, email, display_name, role, status, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      email = excluded.email,
      display_name = excluded.display_name,
      role = excluded.role,
      status = excluded.status,
      updated_at = excluded.updated_at`
  ).run(
    generateId(),
    input.userId,
    normalizeEmail(input.email),
    input.displayName ?? null,
    role,
    status,
    input.createdBy ?? null,
    now,
    now,
  );

  const user = await getAppUserByUserId(input.userId);
  if (!user) throw new Error("Unable to create app user");
  return user;
}

export async function updateAppUserRole(userId: string, role: AppRole): Promise<void> {
  const db = await getDb();
  await db.prepare("UPDATE app_users SET role = ?, updated_at = ? WHERE user_id = ?")
    .run(role, nowISO(), userId);
}

export async function updateAppUserStatus(userId: string, status: AppUserStatus): Promise<void> {
  const db = await getDb();
  await db.prepare("UPDATE app_users SET status = ?, updated_at = ? WHERE user_id = ?")
    .run(status, nowISO(), userId);
}

export async function updateAppUserTeam(input: {
  userId: string;
  isTeamLead: boolean;
  teamLeadUserId?: string | null;
  teamLabel?: string | null;
}): Promise<AppUser | null> {
  const db = await getDb();
  const teamLeadUserId = !input.isTeamLead && input.teamLeadUserId && input.teamLeadUserId !== input.userId ? input.teamLeadUserId : null;
  await db.prepare(
    `UPDATE app_users
     SET is_team_lead = ?, team_lead_user_id = ?, team_label = ?, updated_at = ?
     WHERE user_id = ?`
  ).run(input.isTeamLead ? 1 : 0, teamLeadUserId, normalizeOptionalText(input.teamLabel), nowISO(), input.userId);
  const row = await db.prepare(
    `SELECT au.*, tl.email as team_lead_email, tl.display_name as team_lead_display_name
     FROM app_users au
     LEFT JOIN app_users tl ON tl.user_id = au.team_lead_user_id
     WHERE au.user_id = ?`
  ).get<Record<string, unknown>>(input.userId);
  return row ? parseAppUser(row) : null;
}

async function countAdminUsers(): Promise<number> {
  const db = await getDb();
  const row = await db.prepare(
    "SELECT COUNT(*) as c FROM app_users WHERE role = 'admin'"
  ).get<{ c: number }>();
  return Number(row?.c ?? 0);
}

async function updateLastSeen(userId: string): Promise<void> {
  const db = await getDb();
  await db.prepare("UPDATE app_users SET last_seen_at = ?, updated_at = ? WHERE user_id = ?")
    .run(nowISO(), nowISO(), userId);
}

function parseAppUser(row: Record<string, unknown>): AppUser {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    email: String(row.email),
    display_name: row.display_name ? String(row.display_name) : null,
    role: isAppRole(row.role) ? row.role : "researcher",
    status: row.status === "disabled" ? "disabled" : "active",
    created_by: row.created_by ? String(row.created_by) : null,
    is_team_lead: row.is_team_lead === true || row.is_team_lead === 1,
    team_lead_user_id: row.team_lead_user_id ? String(row.team_lead_user_id) : null,
    team_lead_email: row.team_lead_email ? String(row.team_lead_email) : null,
    team_lead_display_name: row.team_lead_display_name ? String(row.team_lead_display_name) : null,
    team_label: row.team_label ? String(row.team_label) : null,
    last_seen_at: row.last_seen_at ? String(row.last_seen_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function toSessionProfile(user: AppUser): AppUserSessionProfile {
  return {
    userId: user.user_id,
    email: user.email,
    displayName: user.display_name,
    role: user.role,
    status: user.status,
  };
}

function normalizeEmail(email: string | undefined | null): string {
  return (email ?? "").trim().toLowerCase();
}

function normalizeOptionalText(value: string | undefined | null): string | null {
  const normalized = (value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}
