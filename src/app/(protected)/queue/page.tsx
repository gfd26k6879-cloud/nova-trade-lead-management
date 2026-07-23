import type { Metadata } from "next";
import Link from "next/link";
import { logoutAction } from "@/app/login/actions";
import { requirePermission } from "@/lib/auth";
import { isDbStatementTimeoutError, isTransientDbError, withDbStatementTimeout } from "@/lib/db/index";
import { ensureDbReady, getResearcherWorkbench, getScoreBandThresholds } from "@/lib/db/queries";
import { startRouteTiming } from "@/lib/route-timing";
import { QueueClient } from "./queue-client";

export const metadata: Metadata = { title: "Workbench | Nova Trade Lead Management" };

export default async function QueuePage() {
  const logRouteTiming = startRouteTiming("/queue");
  const session = await requirePermission("view:workspace");
  let loaded: {
    workbench: Awaited<ReturnType<typeof getResearcherWorkbench>>;
    scoreThresholds: Awaited<ReturnType<typeof getScoreBandThresholds>>;
  } | null = null;
  let failureReason: ReturnType<typeof classifyQueueLoadFailure> | null = null;

  try {
    const { workbench, scoreThresholds } = await withDbStatementTimeout(10_000, async () => {
      await ensureDbReady();
      const workbench = await getResearcherWorkbench(session.userId, { viewerRole: session.role });
      const scoreThresholds = await getScoreBandThresholds();
      return { workbench, scoreThresholds };
    });
    loaded = { workbench, scoreThresholds };
  } catch (error) {
    failureReason = classifyQueueLoadFailure(error);
    logRouteTiming(503, { reason: failureReason, error: getErrorMessage(error) });
  }

  if (!loaded) {
    return <QueueUnavailable reason={failureReason ?? "queue_load_error"} />;
  }

  logRouteTiming(200);
  return (
    <QueueClient
      workbench={loaded.workbench}
      scoreThresholds={loaded.scoreThresholds}
      currentUser={{ userId: session.userId, email: session.email, role: session.role }}
    />
  );
}

export function classifyQueueLoadFailure(error: unknown): "db_statement_timeout" | "transient_db_error" | "queue_load_error" {
  if (isDbStatementTimeoutError(error)) return "db_statement_timeout";
  if (isTransientDbError(error)) return "transient_db_error";
  return "queue_load_error";
}

function QueueUnavailable({ reason }: { reason: string }) {
  return (
    <section className="glass rounded-3xl p-8">
      <div className="max-w-2xl">
        <p className="section-label">Workbench temporarily unavailable</p>
        <h1 className="mt-3 text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Workbench is taking too long to load.
        </h1>
        <p className="mt-3 text-sm leading-6" style={{ color: "var(--text-secondary)" }}>
          Try again in a moment. Your login worked, but the lead queue database read did not finish fast enough.
        </p>
        <p className="mt-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
          Diagnostic reason: {reason}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/queue" className="btn-primary text-sm">Retry</Link>
          <Link href="/explore" className="btn-glass text-sm">Go to Explore</Link>
          <form action={logoutAction}>
            <button type="submit" className="btn-glass text-sm">Sign out</button>
          </form>
        </div>
      </div>
    </section>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
