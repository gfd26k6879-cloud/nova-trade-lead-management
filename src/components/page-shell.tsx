type StatCard = {
  label: string;
  value: string;
  hint?: string;
};

type PageShellProps = {
  title: string;
  description: string;
  stats?: StatCard[];
  children?: React.ReactNode;
};

export function PageShell({ title, description, stats = [], children }: PageShellProps) {
  return (
    <section className="space-y-6">
      <header className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-semibold text-zinc-900">{title}</h2>
        <p className="mt-2 max-w-3xl text-sm text-zinc-600">{description}</p>

        {stats.length > 0 ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <article key={stat.label} className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{stat.label}</p>
                <p className="mt-2 text-2xl font-semibold text-zinc-900">{stat.value}</p>
                {stat.hint ? <p className="mt-1 text-xs text-zinc-500">{stat.hint}</p> : null}
              </article>
            ))}
          </div>
        ) : null}
      </header>

      {children}
    </section>
  );
}
