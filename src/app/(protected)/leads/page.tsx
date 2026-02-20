import Link from "next/link";

import { PageShell } from "@/components/page-shell";

export default function LeadsPage() {
  return (
    <PageShell
      title="Leads"
      description="Filter and prioritize leads for outreach. This Phase 1 shell validates the table-first workflow."
    >
      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search name, phone, ZIP"
            className="min-w-64 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-800"
            disabled
          />
          <select className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700" disabled>
            <option>Status</option>
          </select>
          <select className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700" disabled>
            <option>Website status</option>
          </select>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
          No leads yet. Discovery and enrichment are delivered in Phase 2.
        </div>

        <div className="mt-4">
          <Link href="/leads/example" className="text-sm text-zinc-600 underline hover:text-zinc-900">
            Open lead detail shell
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
