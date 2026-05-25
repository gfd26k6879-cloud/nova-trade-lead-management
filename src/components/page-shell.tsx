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
      <header className="glass-heavy rounded-2xl p-4 sm:p-6">
        <h2 className="text-xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
          {title}
        </h2>
        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {description}
        </p>

        {stats.length > 0 && (
          <div className="mt-5 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            {stats.map((stat) => (
              <article
                key={stat.label}
                className="min-w-0 rounded-xl p-3 sm:p-4"
                style={{
                  background: "rgba(255, 255, 255, 0.4)",
                  border: "1px solid rgba(255, 255, 255, 0.5)",
                }}
              >
                <p className="section-label break-words">{stat.label}</p>
                <p className="mt-1.5 break-words text-xl font-semibold leading-tight sm:text-2xl" style={{ color: "var(--text-primary)" }}>
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
      </header>

      {children}
    </section>
  );
}
