import { notFound } from "next/navigation";

import { PageShell } from "@/components/page-shell";

type LeadDetailProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function LeadDetailPage({ params }: LeadDetailProps) {
  const { id } = await params;

  if (!id) {
    notFound();
  }

  return (
    <PageShell
      title={`Lead Detail: ${id}`}
      description="Phase 1 lead detail shell with workflow placeholders for notes, status, and outreach timeline."
    >
      <section className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Business Profile</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-zinc-200 p-3 text-sm text-zinc-600">Name: -</div>
            <div className="rounded-md border border-zinc-200 p-3 text-sm text-zinc-600">Phone: -</div>
            <div className="rounded-md border border-zinc-200 p-3 text-sm text-zinc-600">Address: -</div>
            <div className="rounded-md border border-zinc-200 p-3 text-sm text-zinc-600">Score: -</div>
          </div>
        </article>

        <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Status</h3>
          <select className="mt-4 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700" disabled>
            <option>new</option>
          </select>
          <p className="mt-3 text-xs text-zinc-500">Editable status and reminder support arrive with Phase 3.</p>
        </article>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Outreach Timeline</h3>
        <p className="mt-4 text-sm text-zinc-600">No outreach events yet.</p>
      </section>
    </PageShell>
  );
}
