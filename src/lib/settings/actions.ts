"use server";

import { randomUUID } from "node:crypto";
import {
  ensureDbReady,
  getSettings as querySettings,
  updateSettings as dbUpdateSettings,
  setStoredOpenAiApiKey,
  clearStoredOpenAiApiKey,
  setStoredGooglePlacesApiKey,
  clearStoredGooglePlacesApiKey,
  setStoredGoogleMapsBrowserApiKey,
  clearStoredGoogleMapsBrowserApiKey,
  backfillPlacesMasterFromLeads,
  createAuditLog,
  type Settings,
} from "@/lib/db/queries";
import { requirePermission } from "@/lib/auth";
import type { TenantSessionSelector } from "@/lib/app-users";
import { withTenantDbContext } from "@/lib/db";
import { requireTenantPermission, TenantAuthorizationError } from "@/lib/tenancy/authorize";
import { runWithTenantContext } from "@/lib/tenancy/context";
import { createTenantQueryRepository } from "@/lib/tenancy/queries";
import { tenantPolicySchema } from "@/lib/tenancy/schemas";
import { TenantPolicySettingsUnavailableError } from "@/lib/settings/errors";
import { z } from "zod";

const openAiApiKeySchema = z.string().trim().min(20).max(500).refine((value) => !/\s/.test(value), {
  message: "API key cannot contain spaces.",
});

const googlePlacesApiKeySchema = z.string().trim().min(20).max(500).refine((value) => !/\s/.test(value), {
  message: "API key cannot contain spaces.",
});

const googleMapsBrowserApiKeySchema = z.string().trim().min(20).max(500).refine((value) => !/\s/.test(value), {
  message: "API key cannot contain spaces.",
});

/**
 * Reads tenant-owned policy settings through the canonical tenant boundary.
 * Provider credentials intentionally remain outside this action and continue
 * to require the separate platform settings permission below.
 */
export async function getTenantPolicySettingsAction(selector: TenantSessionSelector) {
  const tenantSession = await requireTenantPermission(selector, "tenant:read", {
    action: "settings.tenant_policy.read",
  });

  return runWithTenantContext(tenantSession, `tenant-settings-read:${randomUUID()}`, () =>
    withTenantDbContext(async (db) => {
      await ensureDbReady();
      const policy = await createTenantQueryRepository(db).getCurrentTenantPolicy(tenantSession.tenantId);
      const parsed = tenantPolicySchema.safeParse(policy);
      if (!parsed.success || parsed.data.tenantId !== tenantSession.tenantId) {
        throw new TenantPolicySettingsUnavailableError();
      }
      return parsed.data;
    }));
}

export async function getSettingsAction(): Promise<Settings> {
  await requirePermission("settings:manage");
  await ensureDbReady();
  return querySettings();
}

export async function updateSettingsAction(settings: Partial<Settings>) {
  await requirePermission("settings:manage");
  await ensureDbReady();
  await dbUpdateSettings(settings);
  await createAuditLog("settings_updated", "settings", "1");
  return { success: true };
}

export async function updateOpenAiApiKeyAction(apiKey: string) {
  await requirePermission("settings:manage");
  await ensureDbReady();
  const parsed = openAiApiKeySchema.safeParse(apiKey);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid OpenAI API key." };
  }
  await setStoredOpenAiApiKey(parsed.data);
  await createAuditLog("openai_api_key_updated", "settings", "1");
  return { success: true, settings: await querySettings() };
}

export async function clearOpenAiApiKeyAction() {
  await requirePermission("settings:manage");
  await ensureDbReady();
  await clearStoredOpenAiApiKey();
  await createAuditLog("openai_api_key_cleared", "settings", "1");
  return { success: true, settings: await querySettings() };
}

export async function updateGooglePlacesApiKeyAction(apiKey: string) {
  await requirePermission("settings:manage");
  await ensureDbReady();
  const parsed = googlePlacesApiKeySchema.safeParse(apiKey);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid Google Places API key." };
  }
  await setStoredGooglePlacesApiKey(parsed.data);
  await createAuditLog("google_places_api_key_updated", "settings", "1");
  return { success: true, settings: await querySettings() };
}

export async function clearGooglePlacesApiKeyAction() {
  await requirePermission("settings:manage");
  await ensureDbReady();
  await clearStoredGooglePlacesApiKey();
  await createAuditLog("google_places_api_key_cleared", "settings", "1");
  return { success: true, settings: await querySettings() };
}

export async function updateGoogleMapsBrowserApiKeyAction(apiKey: string) {
  await requirePermission("settings:manage");
  await ensureDbReady();
  const parsed = googleMapsBrowserApiKeySchema.safeParse(apiKey);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid Google Maps browser API key." };
  }
  await setStoredGoogleMapsBrowserApiKey(parsed.data);
  await createAuditLog("google_maps_browser_api_key_updated", "settings", "1");
  return { success: true, settings: await querySettings() };
}

export async function clearGoogleMapsBrowserApiKeyAction() {
  await requirePermission("settings:manage");
  await ensureDbReady();
  await clearStoredGoogleMapsBrowserApiKey();
  await createAuditLog("google_maps_browser_api_key_cleared", "settings", "1");
  return { success: true, settings: await querySettings() };
}

export async function backfillCanonicalPlacesAction(
  limit = 10000,
  selector: TenantSessionSelector = {},
) {
  const tenantSession = await requireTenantPermission(selector, "tenant:manage", {
    action: "settings.canonical_places.backfill",
  });
  const legacySession = await requirePermission("settings:manage");
  if (legacySession.userId !== tenantSession.userId) {
    throw new TenantAuthorizationError(403, "TENANT_SCOPE_MISMATCH");
  }
  if (tenantSession.workspaceId !== null) {
    throw new TenantAuthorizationError(403, "WORKSPACE_SCOPE_INVALID");
  }

  return runWithTenantContext(tenantSession, `canonical-places-backfill:${randomUUID()}`, () =>
    withTenantDbContext(async () => {
      await ensureDbReady();
      const safeLimit = Math.max(1, Math.min(limit, 50000));
      const count = await backfillPlacesMasterFromLeads(safeLimit);
      await createAuditLog("canonical_backfill_completed", "places_master", undefined, { count, limit: safeLimit });
      return { success: true, count };
    }));
}
