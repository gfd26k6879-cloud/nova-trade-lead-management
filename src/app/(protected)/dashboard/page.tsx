import { PageShell } from "@/components/page-shell";

export default function DashboardPage() {
  return (
    <PageShell
      title="Dashboard"
      description="Monitor run health, lead throughput, and daily focus. This is a Phase 1 shell view."
      stats={[
        { label: "Run Status", value: "Idle", hint: "Worker controls added in Phase 2" },
        { label: "Leads Today", value: "0" },
        { label: "Failed Units", value: "0" },
        { label: "Needs Follow-up", value: "0" },
      ]}
    >
      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Run Controls</h3>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled
          >
            Start Run
          </button>
          <button
            type="button"
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled
          >
            Pause
          </button>
          <button
            type="button"
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled
          >
            Resume
          </button>
        </div>
        <p className="mt-3 text-sm text-zinc-500">
          Controls are visible in Phase 1 and become functional in Phase 2 when sequential crawl logic is
          implemented.
        </p>
      </section>
    </PageShell>
  );
}
