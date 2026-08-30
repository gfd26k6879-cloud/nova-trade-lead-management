"use client";

import { AsyncState } from "@/components/async-state";
import type { QuestionRepeatReason, UncertaintyKind } from "@/lib/understanding/question-planner";

export type AdaptiveQuestionQueueStatus = "pending" | "answered" | "skipped" | "blocked";

export type AdaptiveQuestionQueueItem = Readonly<{
  tenantId: string;
  workspaceId: string;
  businessUnderstandingId: string;
  understandingVersionId: string;
  questionRef: string;
  prompt: string;
  uncertaintyId: string;
  uncertaintyKind: UncertaintyKind;
  uncertaintySubject: string;
  priority: number;
  expectedValue: number;
  repeatReason: QuestionRepeatReason;
  status: AdaptiveQuestionQueueStatus;
  blockedReason: string | null;
  updatedAt: string;
  availableActions: Readonly<{
    answer: boolean;
    skip: boolean;
    open: boolean;
  }>;
}>;

type ReadyProps = Readonly<{
  state: "ready";
  scope: Readonly<{ tenantId: string; workspaceId: string }>;
  questions: readonly AdaptiveQuestionQueueItem[];
  onAnswer?: (question: AdaptiveQuestionQueueItem) => void;
  onSkip?: (question: AdaptiveQuestionQueueItem) => void;
  onOpen?: (question: AdaptiveQuestionQueueItem) => void;
  error?: never;
}>;

export type AdaptiveQuestionQueuePanelProps =
  | Readonly<{ state: "loading"; scope?: never; questions?: never; error?: never }>
  | Readonly<{ state: "error"; error: string; scope?: never; questions?: never }>
  | Readonly<{ state: "empty"; scope?: never; questions?: never; error?: never }>
  | ReadyProps;

type Tone = "success" | "warning" | "danger" | "neutral";

const STATUS_META: Readonly<Record<AdaptiveQuestionQueueStatus, Readonly<{ label: string; symbol: string; tone: Tone }>>> = {
  pending: { label: "Needs answer", symbol: "?", tone: "warning" },
  answered: { label: "Answered", symbol: "✓", tone: "success" },
  skipped: { label: "Skipped", symbol: "→", tone: "neutral" },
  blocked: { label: "Blocked", symbol: "!", tone: "danger" },
};

const REPEAT_LABEL: Readonly<Record<QuestionRepeatReason, string>> = {
  first_ask: "First ask · no repeated question",
  stale_fact: "Re-asked · prior fact is stale",
  conflicting_fact: "Re-asked · prior facts conflict",
  different_decision: "Re-asked · different decision context",
};

const TONE_STYLE: Readonly<Record<Tone, React.CSSProperties>> = {
  success: { background: "var(--success-bg)", borderColor: "var(--success-border)", color: "var(--success-text)" },
  warning: { background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning-text)" },
  danger: { background: "var(--danger-bg)", borderColor: "var(--danger-border)", color: "var(--danger-text)" },
  neutral: { background: "var(--surface-muted)", borderColor: "var(--surface-card-border)", color: "var(--text-secondary)" },
};

function words(value: string): string {
  return value.replaceAll("_", " ");
}

function formatTimestamp(value: string): string {
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) return "Unrecognized time";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(epoch);
}

function Badge({ label, symbol, tone }: Readonly<{ label: string; symbol: string; tone: Tone }>) {
  return (
    <span className="inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold" style={TONE_STYLE[tone]}>
      <span aria-hidden="true">{symbol}</span>
      {label}
    </span>
  );
}

function QueueState({ state, error }: Readonly<{ state: "loading" | "error" | "empty"; error?: string }>) {
  if (state === "loading") {
    return <AsyncState variant="loading" title="Loading adaptive question queue" description="Retrieving canonical question and understanding summaries." />;
  }
  if (state === "error") {
    return <AsyncState variant="error" title="Adaptive question queue unavailable" description={error ?? "The question queue could not be loaded."} />;
  }
  return <AsyncState variant="empty" title="No adaptive questions" description="No canonical question summary currently needs to be shown for this workspace." />;
}

function QueueCard({ question, onAnswer, onSkip, onOpen }: Readonly<{
  question: AdaptiveQuestionQueueItem;
  onAnswer?: (question: AdaptiveQuestionQueueItem) => void;
  onSkip?: (question: AdaptiveQuestionQueueItem) => void;
  onOpen?: (question: AdaptiveQuestionQueueItem) => void;
}>) {
  const status = STATUS_META[question.status];
  const canAnswer = question.status === "pending" && question.availableActions.answer && Boolean(onAnswer);
  const canSkip = question.status === "pending" && question.availableActions.skip && Boolean(onSkip);
  const canOpen = question.availableActions.open && Boolean(onOpen);
  const headingId = `adaptive-question-queue-${question.questionRef}`;

  return (
    <li className="glass min-w-0 rounded-2xl p-4 sm:p-5" data-question-status={question.status} data-repeat-reason={question.repeatReason}>
      <article aria-labelledby={headingId}>
        <header className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="section-label">Priority {question.priority} · value {question.expectedValue.toLocaleString("en-US")}</p>
            <h3 id={headingId} className="mt-1 text-base font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>{question.prompt}</h3>
          </div>
          <Badge label={status.label} symbol={status.symbol} tone={status.tone} />
        </header>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <section className="min-w-0 rounded-xl border p-3" aria-label="Targeted uncertainty" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
            <p className="section-label">Targets uncertainty</p>
            <p className="mt-2 text-sm font-semibold capitalize" style={{ color: "var(--text-primary)" }}>{words(question.uncertaintyKind)} · {question.uncertaintySubject}</p>
            <p className="mt-2 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-tertiary)" }}>{question.uncertaintyId}</p>
          </section>
          <section className="min-w-0 rounded-xl border p-3" aria-label="Non-repetition status" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
            <p className="section-label">Non-repetition marker</p>
            <p className="mt-2 text-sm font-semibold" style={{ color: question.repeatReason === "first_ask" ? "var(--success-text)" : "var(--warning-text)" }}>{REPEAT_LABEL[question.repeatReason]}</p>
            <p className="mt-2 text-xs" style={{ color: "var(--text-secondary)" }}>This marker is supplied by the canonical question plan.</p>
          </section>
        </div>

        {question.status === "blocked" && question.blockedReason ? (
          <p className="mt-3 rounded-xl border p-3 text-sm leading-relaxed" role="note" style={{ background: "var(--danger-bg)", borderColor: "var(--danger-border)", color: "var(--danger-text)" }}>
            {question.blockedReason}
          </p>
        ) : null}

        <dl className="mt-3 grid min-w-0 gap-2 text-xs sm:grid-cols-2">
          <div className="min-w-0 rounded-lg border p-2.5" style={{ borderColor: "var(--table-row-border)" }}>
            <dt style={{ color: "var(--text-tertiary)" }}>Understanding binding</dt>
            <dd className="mt-1 break-all font-mono" style={{ color: "var(--text-primary)" }}>{question.businessUnderstandingId}</dd>
            <dd className="mt-1 break-all font-mono" style={{ color: "var(--text-secondary)" }}>{question.understandingVersionId}</dd>
          </div>
          <div className="min-w-0 rounded-lg border p-2.5" style={{ borderColor: "var(--table-row-border)" }}>
            <dt style={{ color: "var(--text-tertiary)" }}>Question state updated</dt>
            <dd className="mt-1" style={{ color: "var(--text-primary)" }}><time dateTime={question.updatedAt}>{formatTimestamp(question.updatedAt)} UTC</time></dd>
            <dd className="mt-1 break-all font-mono" style={{ color: "var(--text-secondary)" }}>{question.questionRef}</dd>
          </div>
        </dl>

        {canAnswer || canSkip || canOpen ? (
          <footer className="mt-4 flex flex-col gap-2 border-t pt-4 sm:flex-row sm:flex-wrap" style={{ borderColor: "var(--surface-card-border)" }}>
            {canOpen ? <button type="button" className="btn-glass min-h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" onClick={() => onOpen?.(question)}>Open question</button> : null}
            {canSkip ? <button type="button" className="btn-glass min-h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" onClick={() => onSkip?.(question)}>Skip for now</button> : null}
            {canAnswer ? <button type="button" className="btn-primary min-h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" onClick={() => onAnswer?.(question)}>Answer question</button> : null}
          </footer>
        ) : null}
      </article>
    </li>
  );
}

export function AdaptiveQuestionQueuePanel(props: AdaptiveQuestionQueuePanelProps) {
  if (props.state === "loading") return <QueueState state="loading" />;
  if (props.state === "error") return <QueueState state="error" error={props.error} />;
  if (props.state === "empty" || props.questions.length === 0) return <QueueState state="empty" />;
  if (props.questions.some((question) => question.tenantId !== props.scope.tenantId || question.workspaceId !== props.scope.workspaceId)) {
    return <QueueState state="error" error="The adaptive question queue scope could not be verified." />;
  }

  const [firstQuestion] = props.questions;
  const questionRefs = new Set(props.questions.map((question) => question.questionRef));
  if (
    questionRefs.size !== props.questions.length
    || props.questions.some(
      (question) => question.businessUnderstandingId !== firstQuestion.businessUnderstandingId
        || question.understandingVersionId !== firstQuestion.understandingVersionId,
    )
  ) {
    return <QueueState state="error" error="The adaptive question queue binding could not be verified." />;
  }

  const pendingCount = props.questions.filter((question) => question.status === "pending").length;
  const blockedCount = props.questions.filter((question) => question.status === "blocked").length;

  return (
    <section className="space-y-4" data-surface="adaptive-question-queue-panel" aria-labelledby="adaptive-question-queue-title">
      <header className="glass-heavy rounded-2xl p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="section-label">Business understanding · Question portfolio</p>
            <h2 id="adaptive-question-queue-title" className="mt-2 text-2xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>Adaptive question queue</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>Canonical question status, decision value, uncertainty target, and understanding-version binding in one queue.</p>
          </div>
          <p className="text-sm font-semibold" style={{ color: blockedCount > 0 ? "var(--danger-text)" : "var(--text-secondary)" }}>
            {pendingCount} pending · {blockedCount} blocked
          </p>
        </div>
        <details className="mt-4 rounded-xl border" style={{ borderColor: "var(--surface-card-border)" }}>
          <summary className="min-h-11 cursor-pointer px-3 py-3 text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Exact queue scope</summary>
          <dl className="grid gap-2 border-t p-3 text-xs sm:grid-cols-2" style={{ borderColor: "var(--surface-card-border)" }}>
            <div className="min-w-0"><dt style={{ color: "var(--text-tertiary)" }}>Tenant</dt><dd className="mt-1 break-all font-mono" style={{ color: "var(--text-primary)" }}>{props.scope.tenantId}</dd></div>
            <div className="min-w-0"><dt style={{ color: "var(--text-tertiary)" }}>Workspace</dt><dd className="mt-1 break-all font-mono" style={{ color: "var(--text-primary)" }}>{props.scope.workspaceId}</dd></div>
          </dl>
        </details>
      </header>

      <ul className="grid grid-cols-1 gap-4 xl:grid-cols-2" aria-label="Canonical adaptive question queue">
        {props.questions.map((question) => (
          <QueueCard key={question.questionRef} question={question} onAnswer={props.onAnswer} onSkip={props.onSkip} onOpen={props.onOpen} />
        ))}
      </ul>
    </section>
  );
}
