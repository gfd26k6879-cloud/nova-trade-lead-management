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
    <section className="space-y-5">
      <header className="glass-heavy rounded-2xl p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
              {title}
            </h2>
            <p className="mt-1.5 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {description}
            </p>
          </div>

          {stats.length > 0 && (
            <dl
              className="flex min-w-0 flex-wrap gap-x-4 gap-y-2 rounded-xl px-3 py-2 xl:max-w-[58rem] xl:justify-end"
              style={{
                background: "var(--surface-card)",
                border: "1px solid var(--surface-card-border)",
              }}
            >
              {stats.map((stat) => (
                <div key={stat.label} className="inline-flex min-w-0 items-baseline gap-2">
                  <dt className="section-label shrink-0">{stat.label}</dt>
                  <dd className="flex min-w-0 items-baseline gap-1.5">
                    <span className="text-lg font-semibold leading-none" style={{ color: "var(--text-primary)" }}>
                      {stat.value}
                    </span>
                    {stat.hint && (
                      <span className="truncate text-xs" style={{ color: "var(--text-tertiary)" }}>
                        {stat.hint}
                      </span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </header>

      {children}
    </section>
  );
}
