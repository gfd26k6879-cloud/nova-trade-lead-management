"use client";

type DraftStatus = "draft" | "in_review" | "approved" | "rejected";
type ClaimSupport = "current" | "stale" | "conflicted" | "uncertain";
type EvidenceStatus = "current" | "stale" | "conflicted";
type ApprovalStatus = "pending" | "approved" | "rejected";
type EligibleAction = "copy" | "export";

type EvidenceFixture = Readonly<{
  evidenceId: string;
  sourceLabel: string;
  quote: string;
  locator: string;
  status: EvidenceStatus;
}>;

type MaterialClaimFixture = Readonly<{
  claimId: string;
  statement: string;
  material: true;
  support: ClaimSupport;
  evidence: readonly EvidenceFixture[];
}>;

export type OutreachReviewPanelProps = Readonly<{
  draft: Readonly<{
    versionLabel: string;
    status: DraftStatus;
    statusLabel: string;
    subject: string;
    body: string;
  }>;
  claims: readonly MaterialClaimFixture[];
  uncertainties: readonly Readonly<{
    uncertaintyId: string;
    statement: string;
    impact: string;
  }>[];
  approval: Readonly<{
    status: ApprovalStatus;
    label: string;
    decidedAtLabel: string | null;
  }>;
  policy: Readonly<{
    result: "allow" | "deny";
    reasons: readonly Readonly<{ code: string; label: string; detail: string }>[];
  }>;
  eligibleActions: readonly EligibleAction[];
  onAction?: (action: EligibleAction) => void;
}>;

const STATUS_META = {
  draft: { symbol: "○", label: "Draft", tone: "neutral" },
  in_review: { symbol: "…", label: "In review", tone: "warning" },
  approved: { symbol: "✓", label: "Approved", tone: "success" },
  rejected: { symbol: "×", label: "Rejected", tone: "danger" },
} as const;

const CLAIM_META = {
  current: { symbol: "✓", label: "Current evidence", state: "STATE-READY", color: "var(--success-text)" },
  stale: { symbol: "!", label: "Stale evidence", state: "STATE-STALE", color: "var(--warning-text)" },
  conflicted: { symbol: "×", label: "Conflicted evidence", state: "STATE-CONFLICT", color: "var(--danger-text)" },
  uncertain: { symbol: "?", label: "Evidence unresolved", state: "STATE-UNKNOWN", color: "var(--warning-text)" },
} as const;

const TONE_STYLE = {
  neutral: { background: "var(--surface-muted)", borderColor: "var(--surface-card-border)", color: "var(--text-secondary)" },
  warning: { background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning-text)" },
  success: { background: "var(--success-bg)", borderColor: "var(--success-border)", color: "var(--success-text)" },
  danger: { background: "var(--danger-bg)", borderColor: "var(--danger-border)", color: "var(--danger-text)" },
} as const;

function actionLabel(action: EligibleAction): string {
  return action === "copy" ? "Copy approved draft" : "Export approved draft";
}

export function OutreachReviewPanel({
  draft,
  claims,
  uncertainties,
  approval,
  policy,
  eligibleActions,
  onAction,
}: OutreachReviewPanelProps) {
  const draftMeta = STATUS_META[draft.status];
  const approvalMeta = STATUS_META[approval.status === "pending" ? "in_review" : approval.status];
  const actions = draft.status === "approved" && approval.status === "approved" && policy.result === "allow"
    && policy.reasons.length === 0
    ? [...new Set(eligibleActions)].filter((action): action is EligibleAction => action === "copy" || action === "export")
    : [];

  return (
    <section
      className="space-y-5"
      data-surface="outreach-review-panel"
      aria-labelledby="outreach-review-title"
    >
      <header className="glass-heavy rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="section-label">Outreach · Human review</p>
            <h2 id="outreach-review-title" className="mt-2 text-2xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
              Review an evidence-backed draft
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Check each material statement against its cited source and resolve uncertainty before using an approved draft.
            </p>
          </div>
          <div
            className="max-w-full rounded-xl border px-3 py-2 text-sm"
            data-draft-status={draft.status}
            aria-label={`Draft status: ${draft.statusLabel}`}
            style={TONE_STYLE[draftMeta.tone]}
          >
            <p className="font-semibold"><span aria-hidden="true">{draftMeta.symbol}</span> {draft.statusLabel}</p>
            <p className="mt-1 text-xs">{draft.versionLabel} · {draftMeta.label}</p>
          </div>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,.65fr)]">
        <div className="space-y-5">
          <article className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="outreach-draft-preview-title">
            <p className="section-label">Current draft</p>
            <h3 id="outreach-draft-preview-title" className="mt-2 break-words text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              {draft.subject}
            </h3>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {draft.body}
            </p>
          </article>

          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="material-claims-title">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
              <div>
                <p className="section-label">Traceability</p>
                <h3 id="material-claims-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                  Material claims and evidence
                </h3>
              </div>
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{claims.length} material claims</p>
            </div>

            <div className="mt-4 space-y-3">
              {claims.map((claim, index) => {
                const meta = CLAIM_META[claim.support];
                const titleId = `outreach-claim-${index}-title`;
                return (
                  <article
                    key={claim.claimId}
                    className="rounded-xl border p-3 sm:p-4"
                    data-state={meta.state}
                    aria-labelledby={titleId}
                    style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <h4 id={titleId} className="min-w-0 break-words text-sm font-semibold leading-relaxed" style={{ color: "var(--text-primary)" }}>
                        {claim.statement}
                      </h4>
                      <span className="shrink-0 text-xs font-semibold" aria-label={`Claim support: ${meta.label}`} style={{ color: meta.color }}>
                        <span aria-hidden="true">{meta.symbol}</span> {meta.label}
                      </span>
                    </div>

                    {claim.evidence.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {claim.evidence.map((evidence) => (
                          <details key={evidence.evidenceId} className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--surface-card-border)" }}>
                            <summary className="min-h-11 cursor-pointer py-2 text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                              {evidence.sourceLabel} · {evidence.status} evidence
                            </summary>
                            <blockquote className="mt-2 border-l-2 pl-3 text-sm leading-relaxed" style={{ borderColor: "var(--accent)", color: "var(--text-secondary)" }}>
                              {evidence.quote}
                            </blockquote>
                            <p className="mt-2 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-tertiary)" }}>
                              Exact locator: {evidence.locator}
                            </p>
                          </details>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--warning-text)" }}>
                        No current citation is attached to this material claim.
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="space-y-5" aria-label="Review decisions">
          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="outreach-approval-title">
            <p className="section-label">Human checkpoint</p>
            <h3 id="outreach-approval-title" className="mt-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>
              Approval state
            </h3>
            <div className="mt-3 rounded-xl border p-3" data-approval-status={approval.status} style={TONE_STYLE[approvalMeta.tone]}>
              <p className="text-sm font-semibold"><span aria-hidden="true">{approvalMeta.symbol}</span> {approval.label}</p>
              {approval.decidedAtLabel ? <p className="mt-1 text-xs">{approval.decidedAtLabel}</p> : null}
            </div>
          </section>

          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="outreach-uncertainty-title">
            <p className="section-label">Open questions</p>
            <h3 id="outreach-uncertainty-title" className="mt-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>
              Uncertainty
            </h3>
            {uncertainties.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {uncertainties.map((item) => (
                  <li key={item.uncertaintyId} className="rounded-xl border p-3" data-state="STATE-UNKNOWN" style={TONE_STYLE.warning}>
                    <p className="text-sm font-semibold"><span aria-hidden="true">?</span> {item.statement}</p>
                    <p className="mt-1 text-xs leading-relaxed">Impact: {item.impact}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm" style={{ color: "var(--success-text)" }}><span aria-hidden="true">✓</span> No unresolved uncertainty.</p>
            )}
          </section>

          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="outreach-policy-title">
            <p className="section-label">Copy/export policy</p>
            <h3 id="outreach-policy-title" className="mt-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>
              Policy decision
            </h3>
            {policy.result === "deny" ? (
              <div className="mt-3 rounded-xl border p-3" role="status" data-policy-result="deny" style={TONE_STYLE.danger}>
                <p className="text-sm font-semibold"><span aria-hidden="true">×</span> Use is blocked</p>
                <ul className="mt-2 space-y-2">
                  {policy.reasons.map((reason) => (
                    <li key={reason.code}>
                      <p className="text-xs font-semibold">{reason.label}</p>
                      <p className="mt-0.5 text-xs leading-relaxed">{reason.detail}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-3 rounded-xl border p-3 text-sm font-semibold" role="status" data-policy-result="allow" style={TONE_STYLE.success}>
                <span aria-hidden="true">✓</span> Copy and export policy checks passed
              </p>
            )}
          </section>
        </aside>
      </div>

      {actions.length > 0 ? (
        <footer className="glass-heavy rounded-2xl p-4 sm:p-5" aria-labelledby="outreach-actions-title">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 id="outreach-actions-title" className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Approved use
              </h3>
              <p id="outreach-actions-help" className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
                Actions apply only to this exact approved version.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              {actions.map((action) => (
                <button
                  key={action}
                  type="button"
                  className={`${action === "copy" ? "btn-primary" : "btn-glass"} min-h-11 w-full whitespace-normal text-center focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto`}
                  aria-describedby="outreach-actions-help"
                  onClick={onAction ? () => onAction(action) : undefined}
                >
                  {actionLabel(action)}
                </button>
              ))}
            </div>
          </div>
        </footer>
      ) : null}
    </section>
  );
}
