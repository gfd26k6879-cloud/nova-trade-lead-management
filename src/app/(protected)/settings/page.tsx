import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { ensureDbReady, getSettings } from "@/lib/db/queries";
import { SettingsClient } from "./settings-client";

export const metadata: Metadata = { title: "Settings | NoSite Leads" };

export default async function SettingsPage() {
  await requirePermission("settings:manage");
  await ensureDbReady();
  const settings = await getSettings();
  return <SettingsClient initialSettings={settings} />;
}
