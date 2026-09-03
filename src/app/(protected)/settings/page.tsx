import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { isDbStatementTimeoutError, isTransientDbError, withDbStatementTimeout } from "@/lib/db/index";
import { ensureDbReady, getSettings, type Settings } from "@/lib/db/queries";
import { startRouteTiming } from "@/lib/route-timing";
import { PageShell } from "@/components/page-shell";
import { SettingsClient } from "./settings-client";

export const metadata: Metadata = { title: "Platform Settings | Nova Trade Lead Management" };

export default async function SettingsPage() {
  const logRouteTiming = startRouteTiming("/settings");
  await requirePermission("settings:manage");
  let settings: Settings | null = null;
  let reason: string | null = null;
  let status = 200;

  try {
    settings = await withDbStatementTimeout(8_000, async () => {
      await ensureDbReady();
      return getSettings();
    });
  } catch (error) {
    status = 503;
    reason = classifySettingsLoadFailure(error);
  }

  logRouteTiming(status, reason ? { reason } : undefined);

  if (!settings) {
    return (
      <PageShell
        title="Platform settings unavailable"
        description="The shared platform settings store could not be loaded."
      >
        <section
          className="glass rounded-2xl p-5"
          role="alert"
          style={{ border: "1px solid var(--danger-border)" }}
        >
          <h3 className="section-label">Controls remain locked</h3>
          <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            No fallback values or credential controls are shown. Reload before changing platform settings.
          </p>
          <p className="mt-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
            Diagnostic: {reason ?? "settings_load_error"}
          </p>
        </section>
      </PageShell>
    );
  }

  return (
    <div className="space-y-5">
      <section className="glass rounded-2xl p-4" aria-labelledby="platform-settings-boundary">
        <h2 id="platform-settings-boundary" className="section-label">Platform-wide controls</h2>
        <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
          These shared provider credentials, scoring rules, and worker controls apply across the installation.
          Only platform settings administrators may view or change them.
        </p>
        <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
          Tenant-owned execution policy is resolved separately and is not represented by these controls.
        </p>
      </section>
      <SettingsClient initialSettings={settings} />
    </div>
  );
}

function classifySettingsLoadFailure(error: unknown): "db_statement_timeout" | "transient_db_error" | "settings_load_error" {
  if (isDbStatementTimeoutError(error)) return "db_statement_timeout";
  if (isTransientDbError(error)) return "transient_db_error";
  return "settings_load_error";
}
