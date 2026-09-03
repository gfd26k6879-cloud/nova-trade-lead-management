import type { ReactNode } from "react";

export type AsyncStateVariant = "loading" | "empty" | "error" | "access-denied";

type AsyncStateProps = {
  variant: AsyncStateVariant;
  title: string;
  description: string;
  action?: ReactNode;
  compact?: boolean;
};

const STATE_META: Record<AsyncStateVariant, { stateId: string; symbol: string; label: string }> = {
  loading: { stateId: "STATE-LOADING", symbol: "…", label: "Loading" },
  empty: { stateId: "STATE-EMPTY", symbol: "○", label: "Empty" },
  error: { stateId: "STATE-ERROR-RETRY", symbol: "!", label: "Error" },
  "access-denied": { stateId: "STATE-FORBIDDEN", symbol: "×", label: "Access denied" },
};

export function AsyncState({ variant, title, description, action, compact = false }: AsyncStateProps) {
  const meta = STATE_META[variant];
  const isError = variant === "error";
  const isLoading = variant === "loading";

  return (
    <section
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      aria-busy={isLoading || undefined}
      data-state={meta.stateId}
      className={`rounded-2xl border ${compact ? "p-4" : "px-5 py-7 sm:px-7 sm:py-8"}`}
      style={{ background: "var(--surface-card)", borderColor: "var(--surface-card-border)" }}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-base font-semibold"
          style={{
            background: isError ? "var(--danger-bg)" : "var(--surface-muted)",
            borderColor: isError ? "var(--danger-border)" : "var(--surface-card-border)",
            color: isError ? "var(--danger-text)" : "var(--text-secondary)",
          }}
        >
          {meta.symbol}
        </span>
        <div className="min-w-0 flex-1">
          <p className="section-label">{meta.label}</p>
          <h2 className="mt-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            {title}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {description}
          </p>
          {action && <div className="mt-4 flex flex-wrap gap-2">{action}</div>}
        </div>
      </div>
    </section>
  );
}
