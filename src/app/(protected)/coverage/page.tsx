import { PageShell } from "@/components/page-shell";

const sampleRows = [
  { zip: "80014", city: "Aurora", total: 0, done: 0, failed: 0, remaining: 0 },
  { zip: "80012", city: "Aurora", total: 0, done: 0, failed: 0, remaining: 0 },
];

export default function CoveragePage() {
  return (
    <PageShell
      title="Coverage"
      description="Track zip-by-zip crawl progress and retries. This table is a Phase 1 shell that will be data-backed in Phase 2."
    >
      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Zip Progress</h3>
          <button
            type="button"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled
          >
            Retry Failed
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-500">
                <th className="pb-2 pr-4 font-medium">ZIP</th>
                <th className="pb-2 pr-4 font-medium">City</th>
                <th className="pb-2 pr-4 font-medium">Total Units</th>
                <th className="pb-2 pr-4 font-medium">Done</th>
                <th className="pb-2 pr-4 font-medium">Failed</th>
                <th className="pb-2 font-medium">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {sampleRows.map((row) => (
                <tr key={row.zip} className="border-b border-zinc-100 text-zinc-700">
                  <td className="py-3 pr-4">{row.zip}</td>
                  <td className="py-3 pr-4">{row.city}</td>
                  <td className="py-3 pr-4">{row.total}</td>
                  <td className="py-3 pr-4">{row.done}</td>
                  <td className="py-3 pr-4">{row.failed}</td>
                  <td className="py-3">{row.remaining}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </PageShell>
  );
}
