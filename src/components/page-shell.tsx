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
      <header className="glass-heavy rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
              {title}
            </h2>
            <p className="mt-1.5 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {description}
            </p>
          </div>

          {stats.length > 0 && (
            <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 xl:flex xl:flex-wrap xl:justify-end">
            {stats.map((stat) => (
              <article
                key={stat.label}
                className="min-w-0 rounded-lg px-3 py-2 xl:min-w-32"
                style={{
                  background: "var(--surface-card)",
                  border: "1px solid var(--surface-card-border)",
                }}
              >
                <p className="section-label break-words">{stat.label}</p>
                <p className="mt-1 break-words text-lg font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
                  {stat.value}
                </p>
                {stat.hint && (
                  <p className="mt-1 break-words text-xs" style={{ color: "var(--text-tertiary)" }}>
                    {stat.hint}
                  </p>
                )}
              </article>
            ))}
          </div>
          )}
        </div>
      </header>

      {children}
    </section>
  );
}
