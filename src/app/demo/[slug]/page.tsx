import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ensureDbReady, getPublishedDemoBySlug } from "@/lib/db/queries";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  await ensureDbReady();
  const published = await getPublishedDemoBySlug(slug);
  return {
    title: published ? `${published.lead.name ?? "Local Business"} | Website Preview` : "Website Preview",
  };
}

export default async function DemoPage({ params }: Props) {
  const { slug } = await params;
  await ensureDbReady();
  const published = await getPublishedDemoBySlug(slug);
  if (!published) notFound();

  const { lead, demo } = published;
  const config = demo.config_json as {
    headline?: string;
    subheadline?: string;
    services?: string[];
    primaryCta?: string;
    secondaryCta?: string;
  };
  const services = Array.isArray(config.services) ? config.services : ["Services", "Appointments", "Free estimate"];
  const telHref = lead.phone ? `tel:${lead.phone.replace(/[^\d+]/g, "")}` : undefined;

  return (
    <main className="min-h-screen bg-[#f8fafc] text-[#111827]">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-between px-6 py-8">
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <p className="text-sm font-medium text-slate-500">{lead.selling_niche?.replace(/_/g, " ") ?? "Local service"}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal">{lead.name ?? "Local Business"}</h1>
          </div>
          {lead.rating && (
            <div className="rounded-lg bg-white px-4 py-2 text-right shadow-sm ring-1 ring-slate-200">
              <p className="text-lg font-semibold">{lead.rating.toFixed(1)}</p>
              <p className="text-xs text-slate-500">{lead.review_count ?? 0} reviews</p>
            </div>
          )}
        </header>

        <section className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <h2 className="max-w-3xl text-4xl font-semibold tracking-normal text-slate-950 sm:text-5xl">
              {config.headline ?? `A better website for ${lead.name ?? "your business"}`}
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              {config.subheadline ?? "A modern local-service page built to help customers call, book, and trust the business faster."}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              {telHref && (
                <a href={telHref} className="rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white">
                  {config.primaryCta ?? "Call Now"}
                </a>
              )}
              <a href={`mailto:hello@example.com?subject=${encodeURIComponent(`Website inquiry for ${lead.name ?? "your business"}`)}`} className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-slate-900 ring-1 ring-slate-200">
                {config.secondaryCta ?? "Request an Appointment"}
              </a>
            </div>
          </div>

          <aside className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Services</h3>
            <div className="mt-4 grid gap-3">
              {services.map((service) => (
                <div key={service} className="rounded-lg border border-slate-200 px-4 py-3 text-sm font-medium">
                  {service}
                </div>
              ))}
            </div>
            <div className="mt-6 space-y-2 text-sm text-slate-600">
              {lead.address && <p>{lead.address}</p>}
              {lead.phone && <p>{lead.phone}</p>}
              {lead.maps_uri && (
                <a className="font-medium text-slate-950 underline underline-offset-4" href={lead.maps_uri} target="_blank" rel="noopener noreferrer">
                  Open in Google Maps
                </a>
              )}
            </div>
          </aside>
        </section>

        <footer className="border-t border-slate-200 pt-5 text-xs text-slate-500">
          Preview concept generated for outreach. Business details are based on public listing data.
        </footer>
      </section>
    </main>
  );
}
