import type { Metadata } from "next";
import Link from "next/link";

export const SUPPORT_EMAIL = "support@nosite.xyz";

export const PUBLIC_TRUST_ROBOTS: Metadata["robots"] = {
  index: true,
  follow: true,
  googleBot: {
    index: true,
    follow: true,
  },
};

type PublicTrustFact = {
  label: string;
  value: string;
};

type PublicTrustSection = {
  title: string;
  body?: string;
  items?: string[];
};

type PublicTrustPageProps = {
  currentPath: string;
  eyebrow: string;
  title: string;
  description: string;
  facts: PublicTrustFact[];
  sections: PublicTrustSection[];
};

const publicNavItems = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/support", label: "Support" },
  { href: "/data-sources", label: "Data sources" },
];

export function PublicTrustPage({
  currentPath,
  eyebrow,
  title,
  description,
  facts,
  sections,
}: PublicTrustPageProps) {
  return (
    <main className="min-h-screen px-5 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <header
          className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-center sm:justify-between"
          style={{ borderColor: "var(--glass-border-light)" }}
        >
          <Link href="/login" className="group inline-flex w-fit items-center gap-3">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-xl border text-sm font-semibold"
              style={{
                background: "var(--surface-card)",
                borderColor: "var(--surface-card-border)",
                color: "var(--accent)",
              }}
              aria-hidden="true"
            >
              NS
            </span>
            <span>
              <span className="block text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                NoSite Leads
              </span>
              <span className="block text-xs" style={{ color: "var(--text-tertiary)" }}>
                Invite-only workspace
              </span>
            </span>
          </Link>

          <nav className="flex flex-wrap gap-1" aria-label="Public trust pages">
            {publicNavItems.map((item) => {
              const active = item.href === currentPath;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-link ${active ? "nav-link-active" : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>

        <section className="grid gap-8 border-b py-10 lg:grid-cols-[minmax(0,1fr)_18rem]" style={{ borderColor: "var(--glass-border-light)" }}>
          <div className="min-w-0">
            <p className="section-label">{eyebrow}</p>
            <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight sm:text-4xl" style={{ color: "var(--text-primary)" }}>
              {title}
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7" style={{ color: "var(--text-secondary)" }}>
              {description}
            </p>
            <p className="mt-4 text-sm" style={{ color: "var(--text-tertiary)" }}>
              Last updated June 16, 2026.
            </p>
          </div>

          <aside
            className="h-fit rounded-2xl border p-4"
            style={{
              background: "var(--surface-muted)",
              borderColor: "var(--surface-card-border)",
            }}
            aria-label="Current service posture"
          >
            <p className="section-label">Current posture</p>
            <dl className="mt-4 space-y-4">
              {facts.map((fact) => (
                <div key={fact.label}>
                  <dt className="text-xs font-semibold uppercase" style={{ color: "var(--text-tertiary)" }}>
                    {fact.label}
                  </dt>
                  <dd className="mt-1 text-sm leading-6" style={{ color: "var(--text-secondary)" }}>
                    {fact.value}
                  </dd>
                </div>
              ))}
            </dl>
          </aside>
        </section>

        <article className="py-8">
          {sections.map((section) => (
            <section
              key={section.title}
              className="grid gap-3 border-t py-6 first:border-t-0 first:pt-0 md:grid-cols-[14rem_minmax(0,1fr)]"
              style={{ borderColor: "var(--glass-border-light)" }}
            >
              <h2 className="text-base font-semibold leading-6" style={{ color: "var(--text-primary)" }}>
                {section.title}
              </h2>
              <div className="space-y-3 text-sm leading-6" style={{ color: "var(--text-secondary)" }}>
                {section.body && <p>{section.body}</p>}
                {section.items && (
                  <ul className="space-y-2">
                    {section.items.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          ))}
        </article>

        <footer
          className="flex flex-col gap-3 border-t py-6 text-sm sm:flex-row sm:items-center sm:justify-between"
          style={{ borderColor: "var(--glass-border-light)", color: "var(--text-tertiary)" }}
        >
          <span>NoSite Leads is public only for trust, support, and data-source information.</span>
          <a className="font-medium" style={{ color: "var(--accent)" }} href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
        </footer>
      </div>
    </main>
  );
}
