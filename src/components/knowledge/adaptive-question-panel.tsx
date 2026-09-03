"use client";

import { AsyncState } from "@/components/async-state";
import {
  ADAPTIVE_QUESTION_POLICY_VERSION,
  type AdaptiveQuestionSession,
  type PlannedAdaptiveQuestion,
  type QuestionAnswerRecord,
  type QuestionRepeatReason,
} from "@/lib/understanding/question-planner";

type ReadyProps = Readonly<{
  state: "ready";
  session: AdaptiveQuestionSession | null;
  answerHistory?: readonly QuestionAnswerRecord[];
  activeQuestionRef?: string | null;
  onAnswer?: (question: PlannedAdaptiveQuestion) => void;
  onSkip?: (question: PlannedAdaptiveQuestion) => void;
  error?: never;
}>;

export type AdaptiveQuestionPanelProps =
  | Readonly<{
    state: "loading";
    session?: never;
    answerHistory?: never;
    activeQuestionRef?: never;
    onAnswer?: never;
    onSkip?: never;
    error?: never;
  }>
  | Readonly<{
    state: "error";
    error: string;
    session?: never;
    answerHistory?: never;
    activeQuestionRef?: never;
    onAnswer?: never;
    onSkip?: never;
  }>
  | ReadyProps;

const REPEAT_REASON_META: Readonly<Record<QuestionRepeatReason, Readonly<{
  label: string;
  explanation: string;
  state: string;
}>>> = Object.freeze({
  first_ask: {
    label: "First ask",
    explanation: "No prior answer covers this uncertainty for the same decision.",
    state: "STATE-READY",
  },
  stale_fact: {
    label: "Stale fact",
    explanation: "A previous answer exists, but its freshness no longer supports this decision.",
    state: "STATE-UNKNOWN",
  },
  conflicting_fact: {
    label: "Conflicting fact",
    explanation: "Available facts disagree, so a human answer is needed before the decision advances.",
    state: "STATE-UNKNOWN",
  },
  different_decision: {
    label: "Different decision",
    explanation: "A prior answer exists, but it was recorded for a different decision context.",
    state: "STATE-UNKNOWN",
  },
});

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

function exactBindingIsValid(
  session: AdaptiveQuestionSession,
  answerHistory: readonly QuestionAnswerRecord[],
): boolean {
  if (session.policyVersion !== ADAPTIVE_QUESTION_POLICY_VERSION) return false;
  const questionRefs = new Set<string>();
  const questionsAreBound = session.questions.every((question, index) => {
    const expectedRef = `${session.sessionRef}/${question.uncertaintyId}/${question.decisionKey}`;
    if (question.rank !== index + 1 || question.questionRef !== expectedRef || questionRefs.has(question.questionRef)) return false;
    questionRefs.add(question.questionRef);
    return true;
  });
  return questionsAreBound && answerHistory.every((answer) => answer.tenantRef === session.tenantRef
    && answer.sessionRef === session.sessionRef
    && answer.understandingVersionId === session.understandingVersionId);
}

function relevantAnswers(
  question: PlannedAdaptiveQuestion,
  answerHistory: readonly QuestionAnswerRecord[],
): readonly QuestionAnswerRecord[] {
  return answerHistory.filter((answer) => answer.uncertaintyId === question.uncertaintyId
    || answer.questionIdentity === question.questionIdentity);
}

function PriorAnswerContext({
  question,
  answerHistory,
}: Readonly<{
  question: PlannedAdaptiveQuestion;
  answerHistory: readonly QuestionAnswerRecord[];
}>) {
  const priorAnswers = relevantAnswers(question, answerHistory);
  return (
    <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--surface-card-border)" }}>
      <p className="section-label">Prior-answer and non-repetition context</p>
      {priorAnswers.length === 0 ? (
        <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          No prior answer shares this uncertainty or semantic question identity.
        </p>
      ) : (
        <ol className="mt-2 space-y-2" aria-label={`Prior answers related to question ${question.rank}`}>
          {priorAnswers.map((answer) => (
            <li
              key={answer.answerId}
              className="min-w-0 rounded-lg border p-3"
              style={{ background: "var(--surface-card)", borderColor: "var(--table-row-border)" }}
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <p className="text-xs font-semibold capitalize" style={{ color: "var(--text-primary)" }}>
                  {words(answer.disposition)} · {answer.decisionKey}
                </p>
                <time className="text-xs" dateTime={answer.recordedAt} style={{ color: "var(--text-tertiary)" }}>
                  {formatTimestamp(answer.recordedAt)} UTC
                </time>
              </div>
              {answer.answerText ? (
                <p className="mt-2 break-words text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {answer.answerText}
                </p>
              ) : (
                <p className="mt-2 text-xs" style={{ color: "var(--text-tertiary)" }}>No answer text was recorded.</p>
              )}
              <p className="mt-2 break-all font-mono text-[0.65rem]" style={{ color: "var(--text-tertiary)" }}>
                {answer.answerId}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function QuestionCard({
  question,
  answerHistory,
  isActive,
  onAnswer,
  onSkip,
}: Readonly<{
  question: PlannedAdaptiveQuestion;
  answerHistory: readonly QuestionAnswerRecord[];
  isActive: boolean;
  onAnswer?: (question: PlannedAdaptiveQuestion) => void;
  onSkip?: (question: PlannedAdaptiveQuestion) => void;
}>) {
  const titleId = `adaptive-question-${question.rank}-title`;
  const reason = REPEAT_REASON_META[question.repeatReason];
  const hasActions = isActive && Boolean(onAnswer || onSkip);

  return (
    <article
      className="glass min-w-0 rounded-2xl p-4 sm:p-5"
      data-question-ref={question.questionRef}
      data-repeat-reason={question.repeatReason}
      data-active={isActive ? "true" : "false"}
      aria-labelledby={titleId}
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="section-label">Priority {question.rank} · {words(question.domain)}</p>
          <h3 id={titleId} className="mt-1 text-lg font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>
            {question.prompt}
          </h3>
        </div>
        <div
          className="shrink-0 rounded-xl border px-3 py-2"
          data-state={reason.state}
          style={{
            background: question.repeatReason === "first_ask" ? "var(--success-bg)" : "var(--warning-bg)",
            borderColor: question.repeatReason === "first_ask" ? "var(--success-border)" : "var(--warning-border)",
            color: question.repeatReason === "first_ask" ? "var(--success-text)" : "var(--warning-text)",
          }}
        >
          <p className="text-xs font-semibold">{reason.label}</p>
          <p className="mt-0.5 text-xs tabular-nums">Value {question.score.expectedValue.toLocaleString("en-US")}</p>
        </div>
      </header>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,.62fr)]">
        <section className="rounded-xl border p-3 sm:p-4" aria-label={`Reason for question ${question.rank}`} style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
          <p className="section-label">Why this question now</p>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>{question.whyItMatters}</p>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{reason.explanation}</p>
          <p className="mt-3 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-tertiary)" }}>
            Decision: {question.decisionKey}
          </p>
        </section>

        <section className="rounded-xl border p-3 sm:p-4" aria-label={`Uncertainty targeted by question ${question.rank}`} style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
          <p className="section-label">Targets uncertainty</p>
          <p className="mt-2 text-sm font-semibold capitalize" style={{ color: "var(--text-primary)" }}>{words(question.kind)} · {question.subject}</p>
          <p className="mt-2 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-tertiary)" }}>{question.uncertaintyId}</p>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border p-2" style={{ borderColor: "var(--table-row-border)" }}>
              <dt style={{ color: "var(--text-tertiary)" }}>Impact points</dt>
              <dd className="mt-1 font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{question.score.impactPoints}</dd>
            </div>
            <div className="rounded-lg border p-2" style={{ borderColor: "var(--table-row-border)" }}>
              <dt style={{ color: "var(--text-tertiary)" }}>Prior deferrals</dt>
              <dd className="mt-1 font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{question.score.priorDeferralPenalty}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="mt-4 rounded-xl border p-3" aria-label={`What question ${question.rank} unlocks`} style={{ borderColor: "var(--surface-info-border)", background: "var(--accent-light)" }}>
        <p className="section-label">What the answer unlocks</p>
        <ul className="mt-2 space-y-1.5">
          {question.unlocks.map((item) => (
            <li key={item} className="flex gap-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              <span aria-hidden="true" style={{ color: "var(--accent)" }}>→</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <PriorAnswerContext question={question} answerHistory={answerHistory} />

      {hasActions ? (
        <footer className="mt-4 border-t pt-4" style={{ borderColor: "var(--surface-card-border)" }}>
          <p id={`adaptive-question-${question.rank}-actions-help`} className="text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
            These controls record a human response to this exact planned question. They do not update understanding automatically.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
            {onSkip ? (
              <button
                type="button"
                className="btn-glass min-h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto"
                aria-describedby={`adaptive-question-${question.rank}-actions-help`}
                onClick={() => onSkip(question)}
              >
                Skip for now
              </button>
            ) : null}
            {onAnswer ? (
              <button
                type="button"
                className="btn-primary min-h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto"
                aria-describedby={`adaptive-question-${question.rank}-actions-help`}
                onClick={() => onAnswer(question)}
              >
                Answer question
              </button>
            ) : null}
          </div>
        </footer>
      ) : null}
    </article>
  );
}

function ReadyAdaptiveQuestionPanel({
  session,
  answerHistory = [],
  activeQuestionRef = null,
  onAnswer,
  onSkip,
}: ReadyProps) {
  if (!session || session.questions.length === 0) {
    return (
      <AsyncState
        variant="empty"
        title="No adaptive question needs attention"
        description="The current understanding has no eligible high-value uncertainty to ask about. Confirmed facts and prior answers remain suppressed for the same decision."
      />
    );
  }

  const bindingValid = exactBindingIsValid(session, answerHistory);
  const activeQuestion = activeQuestionRef === null
    ? null
    : session.questions.find((question) => question.questionRef === activeQuestionRef) ?? null;
  const actionStateValid = bindingValid && activeQuestion !== null;
  const visibleAnswerHistory = bindingValid ? answerHistory : [];

  return (
    <section
      className="space-y-5"
      data-surface="adaptive-question-panel"
      data-binding-valid={bindingValid ? "true" : "false"}
      data-active-question-valid={actionStateValid ? "true" : "false"}
      aria-labelledby="adaptive-question-panel-title"
    >
      <header className="glass-heavy rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="section-label">Business understanding · Adaptive review</p>
            <h2 id="adaptive-question-panel-title" className="mt-2 text-2xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
              Resolve the uncertainty that changes the next decision
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Questions are ranked by expected decision value and retain visible context when a stale, conflicting, or differently scoped answer must be revisited.
            </p>
          </div>
          <div className="shrink-0 rounded-xl border px-4 py-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>Question set</p>
            <p className="mt-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              {session.questions.length} planned · max 5
            </p>
          </div>
        </div>
      </header>

      {!bindingValid ? (
        <div className="rounded-2xl border p-4" role="alert" data-state="STATE-BLOCKED" style={{ background: "var(--danger-bg)", borderColor: "var(--danger-border)", color: "var(--danger-text)" }}>
          <p className="font-semibold">Exact question binding could not be verified</p>
          <p className="mt-1 text-sm leading-relaxed">The question set or prior answers do not match this tenant, session, and understanding version. Human response controls are unavailable.</p>
        </div>
      ) : activeQuestionRef !== null && activeQuestion === null ? (
        <div className="rounded-2xl border p-4" role="alert" data-state="STATE-BLOCKED" style={{ background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning-text)" }}>
          <p className="font-semibold">The active question is not in this exact plan</p>
          <p className="mt-1 text-sm leading-relaxed">Refresh the question state before recording an answer or deferral.</p>
        </div>
      ) : null}

      <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="adaptive-question-binding-title">
        <p className="section-label">Exact source of truth</p>
        <h3 id="adaptive-question-binding-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          Understanding and session binding
        </h3>
        <dl className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="min-w-0 rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
            <dt className="section-label">Understanding version</dt>
            <dd className="mt-2 break-all font-mono text-[0.7rem] leading-relaxed" style={{ color: "var(--text-primary)" }}>{session.understandingVersionId}</dd>
          </div>
          <div className="min-w-0 rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
            <dt className="section-label">Tenant and question session</dt>
            <dd className="mt-2 break-all font-mono text-[0.7rem]" style={{ color: "var(--text-primary)" }}>{session.tenantRef}</dd>
            <dd className="mt-1 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-secondary)" }}>{session.sessionRef}</dd>
          </div>
        </dl>
        <p className="mt-3 break-all font-mono text-[0.65rem]" style={{ color: "var(--text-tertiary)" }}>Policy: {session.policyVersion}</p>
      </section>

      <div className="grid gap-5 xl:grid-cols-2" aria-label="Prioritized adaptive questions">
        {session.questions.map((question) => (
          <QuestionCard
            key={question.questionRef}
            question={question}
            answerHistory={visibleAnswerHistory}
            isActive={actionStateValid && activeQuestion?.questionRef === question.questionRef}
            onAnswer={actionStateValid ? onAnswer : undefined}
            onSkip={actionStateValid ? onSkip : undefined}
          />
        ))}
      </div>
    </section>
  );
}

export function AdaptiveQuestionPanel(props: AdaptiveQuestionPanelProps) {
  if (props.state === "loading") {
    return <AsyncState variant="loading" title="Loading adaptive questions" description="Retrieving the exact understanding binding, ranked uncertainty, and prior-answer context." />;
  }
  if (props.state === "error") {
    return <AsyncState variant="error" title="Adaptive questions unavailable" description={props.error} />;
  }
  return <ReadyAdaptiveQuestionPanel {...props} />;
}
