import Link from "next/link";

import { AsyncState } from "@/components/async-state";
import { OnboardingFrame, type OnboardingStep } from "@/components/onboarding-frame";

const ONBOARDING_STEPS: OnboardingStep[] = [
  { id: "scope", label: "Scope" },
  { id: "policy", label: "Policy" },
  { id: "materials", label: "Materials" },
  { id: "progress", label: "Progress" },
  { id: "complete", label: "Complete" },
];

type MaterialFixture = {
  name: string;
  metadata: string;
  state: string;
  stateId: string;
  detail: string;
  tone: "success" | "neutral" | "warning";
};

const MATERIAL_FIXTURES: MaterialFixture[] = [
  {
    name: "Product catalog 2026.pdf",
    metadata: "PDF · 8.2 MB · client-provided",
    state: "Ready",
    stateId: "STATE-READY",
    detail: "42 pages · 188 facts",
    tone: "success",
  },
  {
    name: "Customer export.xlsx",
    metadata: "Spreadsheet · 2 sheets",
    state: "Extracting",
    stateId: "STATE-RUNNING",
    detail: "61% · safe to leave",
    tone: "neutral",
  },
  {
    name: "Capabilities overview.pdf",
    metadata: "PDF · content hash matched",
    state: "Duplicate",
    stateId: "STATE-DUPLICATE",
    detail: "Review the existing source before continuing",
    tone: "warning",
  },
  {
    name: "aster-materials.com",
    metadata: "Authorized website · 18 pages found",
    state: "Validating",
    stateId: "STATE-PENDING",
    detail: "Source policy check",
    tone: "neutral",
  },
  {
    name: "Plant tour video.mov",
    metadata: "Video · 146 MB",
    state: "Unsupported",
    stateId: "STATE-UNSUPPORTED",
    detail: "Use a launch-approved document format",
    tone: "warning",
  },
];

export default function OnboardingPage() {
  return (
    <OnboardingFrame
      title="Add business materials"
      description="Authorized sources become immutable, evidence-ready records. This fixture-backed frame demonstrates the intake contract while service wiring remains separate."
      steps={ONBOARDING_STEPS}
      currentStepId="materials"
      savedLabel="Preview only · no materials have been submitted"
      backAction={<Link className="btn-glass min-h-11 w-full sm:w-auto" href="/dashboard">Back to dashboard</Link>}
      nextAction={<button className="btn-primary min-h-11 w-full sm:w-auto" type="button" disabled title="Available after intake services are connected">Continue</button>}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(18rem,30rem)_minmax(0,1fr)]">
        <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="authorized-input-title">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="authorized-input-title" className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                Choose an authorized input
              </h2>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                Fixture controls are disabled until document services are connected.
              </p>
            </div>
            <span className="rounded-full border px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-wide" style={{ borderColor: "var(--chip-border)", color: "var(--text-tertiary)" }}>
              Preview
            </span>
          </div>

          <div className="mt-5 rounded-xl border border-dashed p-6 text-center sm:p-8" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Drop permitted files here</p>
            <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>PDF, spreadsheet, or document · limits shown before upload</p>
            <button className="btn-primary mt-4 min-h-11" type="button" disabled>Choose files</button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button className="btn-glass min-h-11" type="button" disabled>Add a link</button>
            <button className="btn-glass min-h-11" type="button" disabled>Add a note</button>
          </div>

          <aside className="mt-5 rounded-xl border p-4" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
            <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Tenant-wide responsibility checkpoint</h3>
            <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Materials and evidence are tenant-wide. Only add sources this tenant is authorized to use.
            </p>
            <p className="mt-3 text-xs font-medium" style={{ color: "var(--text-primary)" }}>Policy v3.4 acknowledged in fixture data</p>
          </aside>
        </section>

        <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="intake-queue-title">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="intake-queue-title" className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Intake queue</h2>
              <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>5 fixtures · 1 ready · 2 processing · 2 need attention</p>
            </div>
            <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Tenant-wide</span>
          </div>

          {MATERIAL_FIXTURES.length === 0 ? (
            <div className="mt-5">
              <AsyncState variant="empty" compact title="No materials yet" description="Add an authorized file, link, or note to begin." />
            </div>
          ) : (
            <ul className="mt-5 space-y-2" aria-label="Fixture material intake items">
              {MATERIAL_FIXTURES.map((item) => (
                <li key={item.name} data-state={item.stateId} className="grid gap-3 rounded-xl border p-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(7rem,.55fr)_minmax(0,1fr)] sm:items-center" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium" title={item.name} style={{ color: "var(--text-primary)" }}>{item.name}</p>
                    <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>{item.metadata}</p>
                  </div>
                  <p className="text-sm font-medium" style={{ color: item.tone === "success" ? "var(--success-text)" : item.tone === "warning" ? "var(--warning-text)" : "var(--text-secondary)" }}>
                    <span aria-hidden="true">{item.tone === "success" ? "✓" : item.tone === "warning" ? "!" : "○"}</span> {item.state}
                  </p>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{item.detail}</p>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 rounded-xl border px-4 py-3" data-state="STATE-PARTIAL" style={{ background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning-text)" }}>
            <p className="text-sm font-semibold">Partial intake</p>
            <p className="mt-1 text-xs leading-relaxed">Completed and ready items are preserved; resolve unsupported items or continue later with known gaps.</p>
          </div>
        </section>
      </div>
    </OnboardingFrame>
  );
}
