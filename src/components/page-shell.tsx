type StatCard = {
  label: string;
  value: string;
  hint?: string;
};

type StatTone = "accent" | "blue" | "green" | "amber" | "red" | "purple" | "slate";
type StatIconName = "alert" | "bars" | "check" | "clock" | "database" | "dollar" | "globe" | "map" | "phone" | "users";

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
              className="grid w-full min-w-0 gap-2 rounded-xl p-2 xl:w-auto xl:min-w-[32rem] xl:max-w-[54rem]"
              style={{
                background: "var(--surface-card)",
                border: "1px solid var(--surface-card-border)",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(9.5rem, 100%), 1fr))",
              }}
              data-role="page-stat-strip"
            >
              {stats.map((stat, index) => {
                const visual = getStatVisual(stat.label, index);
                const colors = getStatToneStyles(visual.tone);
                return (
                  <div
                    key={stat.label}
                    className="flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2"
                    style={{
                      background: "var(--surface-muted)",
                      borderColor: "var(--surface-card-border)",
                    }}
                    data-role="page-stat-pill"
                    data-tone={visual.tone}
                  >
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border"
                      style={{
                        background: colors.background,
                        borderColor: colors.border,
                        color: colors.text,
                      }}
                      data-role="page-stat-icon"
                      aria-hidden="true"
                    >
                      <StatIcon name={visual.icon} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <dt className="truncate text-[0.64rem] font-semibold uppercase leading-none" style={{ color: colors.text }}>
                        {stat.label}
                      </dt>
                      <dd className="mt-1 flex min-w-0 items-end gap-1.5">
                        <span className="truncate text-lg font-semibold leading-none" style={{ color: "var(--text-primary)" }}>
                          {stat.value}
                        </span>
                        {stat.hint && (
                          <span
                            className="mb-px max-w-20 truncate rounded-full px-1.5 py-0.5 text-[0.62rem] font-medium leading-none"
                            style={{
                              background: colors.background,
                              color: colors.text,
                            }}
                          >
                            {stat.hint}
                          </span>
                        )}
                      </dd>
                    </div>
                  </div>
                );
              })}
            </dl>
          )}
        </div>
      </header>

      {children}
    </section>
  );
}

function getStatVisual(label: string, index: number): { tone: StatTone; icon: StatIconName } {
  const normalized = label.toLowerCase();

  if (/(review|failed|overdue|disabled|error|attention)/.test(normalized)) return { tone: "red", icon: "alert" };
  if (/(unclaimed|ready|qualified|active|workers on|done)/.test(normalized)) return { tone: "green", icon: "check" };
  if (/(no website|website|broken|google|quote|pipeline|steve)/.test(normalized)) return { tone: "accent", icon: normalized.includes("pipeline") || normalized.includes("quote") ? "dollar" : "globe" };
  if (/(mapped|coverage|market|cell|range)/.test(normalized)) return { tone: "purple", icon: "map" };
  if (/(contact|call|phone|sms|email)/.test(normalized)) return { tone: "blue", icon: "phone" };
  if (/(due|queue|waiting|run status|discovery|open units|background)/.test(normalized)) return { tone: "amber", icon: "clock" };
  if (/(user|admin|researcher|owner|claimed)/.test(normalized)) return { tone: "green", icon: "users" };
  if (/(lead|result|total|page|discovered)/.test(normalized)) return { tone: "blue", icon: "bars" };

  const fallback: Array<{ tone: StatTone; icon: StatIconName }> = [
    { tone: "blue", icon: "bars" },
    { tone: "green", icon: "check" },
    { tone: "amber", icon: "clock" },
    { tone: "purple", icon: "database" },
    { tone: "accent", icon: "globe" },
    { tone: "slate", icon: "database" },
  ];
  return fallback[index % fallback.length] ?? fallback[0];
}

function getStatToneStyles(tone: StatTone): { background: string; border: string; text: string } {
  const styles: Record<StatTone, { background: string; border: string; text: string }> = {
    accent: { background: "var(--accent-light)", border: "var(--search-border)", text: "var(--accent)" },
    blue: { background: "var(--score-good-bg)", border: "var(--score-good-border)", text: "var(--score-good-text)" },
    green: { background: "var(--score-high-bg)", border: "var(--score-high-border)", text: "var(--score-high-text)" },
    amber: { background: "var(--score-fair-bg)", border: "var(--score-fair-border)", text: "var(--score-fair-text)" },
    red: { background: "var(--danger-bg)", border: "var(--danger-border)", text: "var(--danger-text)" },
    purple: { background: "var(--score-hot-bg)", border: "var(--score-hot-border)", text: "var(--score-hot-text)" },
    slate: { background: "var(--badge-muted-bg)", border: "var(--chip-border)", text: "var(--badge-muted-text)" },
  };
  return styles[tone];
}

function StatIcon({ name }: { name: StatIconName }) {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {name === "alert" && (
        <>
          <path d="M12 3 2.5 20.5h19L12 3Z" />
          <path d="M12 9v5" />
          <path d="M12 17h.01" />
        </>
      )}
      {name === "bars" && (
        <>
          <path d="M4 19V9" />
          <path d="M10 19V5" />
          <path d="M16 19v-7" />
          <path d="M22 19H2" />
        </>
      )}
      {name === "check" && (
        <>
          <path d="M20 6 9 17l-5-5" />
          <path d="M19 14v4a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h8" />
        </>
      )}
      {name === "clock" && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </>
      )}
      {name === "database" && (
        <>
          <ellipse cx="12" cy="5" rx="8" ry="3" />
          <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
          <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
        </>
      )}
      {name === "dollar" && (
        <>
          <path d="M12 2v20" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6" />
        </>
      )}
      {name === "globe" && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18" />
          <path d="M12 3a14 14 0 0 1 0 18" />
          <path d="M12 3a14 14 0 0 0 0 18" />
        </>
      )}
      {name === "map" && (
        <>
          <path d="M12 21s6-4.7 6-11a6 6 0 0 0-12 0c0 6.3 6 11 6 11Z" />
          <circle cx="12" cy="10" r="2" />
        </>
      )}
      {name === "phone" && (
        <>
          <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.3 19.3 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2Z" />
        </>
      )}
      {name === "users" && (
        <>
          <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
          <circle cx="9.5" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.9" />
          <path d="M16 3.1a4 4 0 0 1 0 7.8" />
        </>
      )}
    </svg>
  );
}
