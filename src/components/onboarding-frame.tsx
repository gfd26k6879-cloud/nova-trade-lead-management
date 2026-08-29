import type { ReactNode } from "react";

export type OnboardingStep = {
  id: string;
  label: string;
};

type OnboardingFrameProps = {
  title: string;
  description: string;
  steps: OnboardingStep[];
  currentStepId: string;
  savedLabel: string;
  backAction?: ReactNode;
  nextAction: ReactNode;
  children: ReactNode;
};

export function OnboardingFrame({
  title,
  description,
  steps,
  currentStepId,
  savedLabel,
  backAction,
  nextAction,
  children,
}: OnboardingFrameProps) {
  const foundIndex = steps.findIndex((step) => step.id === currentStepId);
  const currentIndex = foundIndex >= 0 ? foundIndex : 0;
  const currentStep = steps[currentIndex];

  return (
    <section className="space-y-5" aria-labelledby="onboarding-title">
      <header className="glass-heavy rounded-2xl p-4 sm:p-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,28rem)] lg:items-start">
          <div className="min-w-0">
            <p className="section-label">Onboarding · Step {currentIndex + 1} of {steps.length}</p>
            <h1 id="onboarding-title" className="mt-2 text-2xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
              {title}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {description}
            </p>
          </div>

          <nav aria-label="Onboarding progress" className="rounded-xl border p-3" style={{ background: "var(--surface-card)", borderColor: "var(--surface-card-border)" }}>
            <p className="section-label">Progress</p>
            <p className="mt-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Step {currentIndex + 1} of {steps.length}: {currentStep?.label}
            </p>
            <ol className="mt-3 grid grid-cols-5 gap-1" role="list">
              {steps.map((step, index) => {
                const isCurrent = index === currentIndex;
                const isComplete = index < currentIndex;
                return (
                  <li key={step.id} aria-current={isCurrent ? "step" : undefined} className="min-w-0">
                    <span
                      aria-hidden="true"
                      className="block h-1.5 rounded-full"
                      style={{ background: isCurrent || isComplete ? "var(--accent)" : "var(--surface-muted)" }}
                    />
                    <span className="mt-1.5 block truncate text-[0.65rem] font-medium" style={{ color: isCurrent ? "var(--text-primary)" : "var(--text-tertiary)" }} title={step.label}>
                      {isComplete ? "✓ " : ""}{step.label}
                    </span>
                  </li>
                );
              })}
            </ol>
          </nav>
        </div>
      </header>

      {children}

      <footer
        className="glass-heavy sticky bottom-0 z-20 flex flex-col gap-3 rounded-2xl p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <p role="status" aria-live="polite" className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          {savedLabel}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          {backAction && <div className="contents sm:block">{backAction}</div>}
          <div className="contents sm:block">{nextAction}</div>
        </div>
      </footer>
    </section>
  );
}
