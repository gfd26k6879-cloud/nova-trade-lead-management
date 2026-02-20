import { PageShell } from "@/components/page-shell";

export default function SettingsPage() {
  return (
    <PageShell
      title="Settings"
      description="Configure lead scoring, classification hosts, and budget guardrails. Controls are placeholders in Phase 1."
    >
      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Classification Hosts</h3>
          <p className="mt-2 text-sm text-zinc-600">Social and basic-domain host lists are configured in Phase 2.</p>
        </article>

        <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Cost Guardrails</h3>
          <p className="mt-2 text-sm text-zinc-600">
            Max calls per run/day and budget stop controls are finalized with crawl execution in Phase 2.
          </p>
        </article>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Compliance</h3>
        <p className="mt-2 text-sm text-zinc-600">
          This app uses official Google Places API endpoints only. No scraping of Google pages or review text.
        </p>
      </section>
    </PageShell>
  );
}
