"use client";

import type { ReviewQueue, ReviewQueueItem } from "@/lib/review/review-queue";

type ReadyProps = Readonly<{
  state: "ready";
  queue: ReviewQueue;
  actorId: string;
  now: string;
  onClaim?: (item: ReviewQueueItem) => void;
  onRelease?: (item: ReviewQueueItem) => void;
  onResolve?: (item: ReviewQueueItem) => void;
  error?: never;
}>;

export type ReviewQueuePanelProps =
  | Readonly<{ state: "loading"; queue?: never; actorId?: never; now?: never; error?: never }>
  | Readonly<{ state: "error"; error: string; queue?: never; actorId?: never; now?: never }>
  | ReadyProps;

type ReviewAction = "claim" | "release" | "resolve";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

const KIND_META = Object.freeze({
  ambiguous_account_resolution: { symbol: "?", label: "Ambiguous account resolution" },
  qualification_review: { symbol: "◆", label: "Qualification review" },
  buying_center_review: { symbol: "◎", label: "Buying-center review" },
});

const STATUS_META = Object.freeze({
  queued: {
    symbol: "○",
    label: "Queued",
    style: { background: "var(--surface-muted)", borderColor: "var(--surface-card-border)", color: "var(--text-secondary)" },
  },
  claimed: {
    symbol: "…",
    label: "Claimed",
    style: { background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning-text)" },
  },
  resolved: {
    symbol: "✓",
    label: "Resolved",
    style: { background: "var(--success-bg)", borderColor: "var(--success-border)", color: "var(--success-text)" },
  },
});

const PRIORITY_STYLE = Object.freeze({
  low: { background: "var(--status-muted-bg)", borderColor: "var(--status-muted-border)", color: "var(--status-muted-text)" },
  normal: { background: "var(--surface-muted)", borderColor: "var(--surface-card-border)", color: "var(--text-secondary)" },
  high: { background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning-text)" },
  urgent: { background: "var(--danger-bg)", borderColor: "var(--danger-border)", color: "var(--danger-text)" },
});

function instant(value: string | null | undefined): number | null {
  if (!value || !TIMESTAMP.test(value)) return null;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value ? epoch : null;
}

function formatTimestamp(value: string): string {
  const epoch = instant(value);
  if (epoch === null) return "Unrecognized time";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(epoch);
}

function visibleActions(
  item: ReviewQueueItem,
  actorId: string,
  now: string,
  lastEventAt: string,
): readonly ReviewAction[] {
  if (!UUID.test(actorId)) return [];
  const nowEpoch = instant(now);
  const lastEventEpoch = instant(lastEventAt);
  if (nowEpoch === null || lastEventEpoch === null || nowEpoch <= lastEventEpoch) return [];

  if (item.status === "queued") {
    return item.claimedBy === null && item.leaseExpiresAt === null && item.resolution === null ? ["claim"] : [];
  }
  if (item.status !== "claimed" || !item.claimedBy || !UUID.test(item.claimedBy)
    || item.resolution !== null) return [];
  const leaseEpoch = instant(item.leaseExpiresAt);
  if (leaseEpoch === null) return [];
  if (nowEpoch >= leaseEpoch) return ["claim"];
  return item.claimedBy === actorId ? ["release", "resolve"] : [];
}

function actionLabel(action: ReviewAction, expired: boolean): string {
  if (action === "claim") return expired ? "Reclaim expired item" : "Claim item";
  return action === "release" ? "Release item" : "Resolve item";
}

function StatePanel({ state, message }: Readonly<{ state: "loading" | "error"; message: string }>) {
  const isLoading = state === "loading";
  return (
    <section
      className="glass-heavy rounded-2xl p-5 sm:p-6"
      data-queue-state={state}
      aria-labelledby={`review-queue-${state}-title`}
      role={isLoading ? "status" : "alert"}
      aria-busy={isLoading ? true : undefined}
    >
      <p className="section-label">Review queue · Human decisions</p>
      <h2 id={`review-queue-${state}-title`} className="mt-2 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
        {isLoading ? "Loading review queue" : "Review queue unavailable"}
      </h2>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{message}</p>
    </section>
  );
}

function ReviewItemCard({
  item,
  actorId,
  now,
  lastEventAt,
  onClaim,
  onRelease,
  onResolve,
  index,
}: Readonly<{
  item: ReviewQueueItem;
  actorId: string;
  now: string;
  lastEventAt: string;
  onClaim?: (item: ReviewQueueItem) => void;
  onRelease?: (item: ReviewQueueItem) => void;
  onResolve?: (item: ReviewQueueItem) => void;
  index: number;
}>) {
  const kind = KIND_META[item.kind];
  const status = STATUS_META[item.status];
  const actions = visibleActions(item, actorId, now, lastEventAt).filter((action) => (
    action === "claim" ? Boolean(onClaim) : action === "release" ? Boolean(onRelease) : Boolean(onResolve)
  ));
  const nowEpoch = instant(now);
  const leaseEpoch = instant(item.leaseExpiresAt);
  const leaseExpired = item.status === "claimed" && nowEpoch !== null && leaseEpoch !== null && nowEpoch >= leaseEpoch;
  const titleId = `review-queue-item-${index}-title`;
  const reasonId = `review-queue-item-${index}-reason`;

  return (
    <article className="glass min-w-0 rounded-2xl p-4 sm:p-5" aria-labelledby={titleId} data-review-kind={item.kind}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="section-label"><span aria-hidden="true">{kind.symbol}</span> {kind.label}</p>
          <h3 id={titleId} className="mt-2 break-all text-sm font-semibold leading-relaxed" style={{ color: "var(--text-primary)" }}>
            {item.subject.subjectId}
          </h3>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <span
            className="rounded-full border px-2.5 py-1 text-xs font-semibold capitalize"
            aria-label={`Priority: ${item.priority}`}
            style={PRIORITY_STYLE[item.priority]}
          >
            {item.priority} priority
          </span>
          <span
            className="rounded-full border px-2.5 py-1 text-xs font-semibold"
            data-review-status={item.status}
            aria-label={`Status: ${status.label}${leaseExpired ? ", lease expired" : ""}`}
            style={status.style}
          >
            <span aria-hidden="true">{status.symbol}</span> {status.label}{leaseExpired ? " · lease expired" : ""}
          </span>
        </div>
      </header>

      <section className="mt-4 rounded-xl border p-3 sm:p-4" aria-labelledby={reasonId} style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
        <h4 id={reasonId} className="section-label">Review reason</h4>
        <p className="mt-2 break-words text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>{item.reason}</p>
      </section>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <section className="min-w-0 rounded-xl border p-3" aria-label="Exact subject version" style={{ borderColor: "var(--surface-card-border)" }}>
          <p className="section-label">Exact subject version</p>
          <p className="mt-2 break-all font-mono text-[0.7rem] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {item.subject.versionId}
          </p>
          <p className="mt-1 break-all font-mono text-[0.65rem] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
            {item.subject.contentHash}
          </p>
        </section>

        <section className="min-w-0 rounded-xl border p-3" aria-label="Lease and assignee" style={{ borderColor: "var(--surface-card-border)" }}>
          <p className="section-label">Lease and assignee</p>
          {item.claimedBy ? (
            <>
              <p className="mt-2 break-all font-mono text-[0.7rem]" style={{ color: "var(--text-secondary)" }}>
                Assignee {item.claimedBy}
              </p>
              {item.leaseExpiresAt ? (
                <time className="mt-1 block text-xs" dateTime={item.leaseExpiresAt} style={{ color: "var(--text-tertiary)" }}>
                  {leaseExpired ? "Expired" : "Expires"} {formatTimestamp(item.leaseExpiresAt)} UTC
                </time>
              ) : (
                <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>Lease closed</p>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>Unassigned · no active lease</p>
          )}
        </section>
      </div>

      <section className="mt-4" aria-label="Uncertainty references">
        <p className="section-label">Uncertainty references</p>
        {item.uncertaintyIds.length ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {item.uncertaintyIds.map((uncertaintyId) => (
              <li key={uncertaintyId} className="max-w-full break-all rounded-lg border px-2.5 py-1.5 font-mono text-[0.68rem]" style={{ borderColor: "var(--warning-border)", color: "var(--warning-text)" }}>
                ? {uncertaintyId}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm" style={{ color: "var(--text-tertiary)" }}>No uncertainty references supplied.</p>
        )}
      </section>

      {item.resolution ? (
        <section className="mt-4 rounded-xl border p-3" aria-label="Resolution" style={{ background: "var(--success-bg)", borderColor: "var(--success-border)" }}>
          <p className="text-sm font-semibold capitalize" style={{ color: "var(--success-text)" }}>
            <span aria-hidden="true">✓</span> {item.resolution.decision.replaceAll("_", " ")}
          </p>
          <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>{item.resolution.note}</p>
          <p className="mt-2 break-all text-xs" style={{ color: "var(--text-tertiary)" }}>
            Resolved by {item.resolution.resolvedBy} · <time dateTime={item.resolution.resolvedAt}>{formatTimestamp(item.resolution.resolvedAt)} UTC</time>
          </p>
        </section>
      ) : null}

      {actions.length ? (
        <footer className="mt-4 border-t pt-4" style={{ borderColor: "var(--surface-card-border)" }}>
          <p id={`${titleId}-action-help`} className="text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
            Human actions apply to this exact queued item and current lease state.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            {actions.map((action) => (
              <button
                key={action}
                type="button"
                className={`${action === "resolve" ? "btn-primary" : "btn-glass"} min-h-11 w-full whitespace-normal text-center focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto`}
                aria-describedby={`${titleId}-action-help`}
                data-review-action={action}
                onClick={() => {
                  if (action === "claim") onClaim?.(item);
                  else if (action === "release") onRelease?.(item);
                  else onResolve?.(item);
                }}
              >
                {actionLabel(action, leaseExpired)}
              </button>
            ))}
          </div>
        </footer>
      ) : null}
    </article>
  );
}

export function ReviewQueuePanel(props: ReviewQueuePanelProps) {
  if (props.state === "loading") {
    return <StatePanel state="loading" message="Preparing tenant-scoped ambiguity, qualification, and buying-center reviews." />;
  }
  if (props.state === "error") return <StatePanel state="error" message={props.error} />;

  const { queue } = props;
  const lastEventAt = queue.events.at(-1)?.at ?? queue.createdAt;
  const counts = queue.items.reduce((summary, item) => ({ ...summary, [item.status]: summary[item.status] + 1 }), {
    queued: 0,
    claimed: 0,
    resolved: 0,
  });

  return (
    <section className="space-y-5" data-surface="review-queue-panel" data-queue-state={queue.items.length ? "ready" : "empty"} aria-labelledby="review-queue-title">
      <header className="glass-heavy rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="section-label">Review queue · Human decisions</p>
            <h2 id="review-queue-title" className="mt-2 text-2xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
              Resolve the work that needs judgment
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Claim a bounded review, inspect its exact source version, then release it or record a human resolution.
            </p>
          </div>
          <div className="rounded-xl border px-3 py-2 text-sm" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
            <p className="font-semibold" style={{ color: "var(--text-primary)" }}>{queue.items.length} total items</p>
            <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>Actions follow the current lease only.</p>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {(["queued", "claimed", "resolved"] as const).map((status) => (
            <div key={status} className="rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
              <dt className="section-label">{STATUS_META[status].label}</dt>
              <dd className="mt-1 text-xl font-semibold" style={{ color: "var(--text-primary)" }}>{counts[status]}</dd>
            </div>
          ))}
        </dl>
      </header>

      {queue.items.length === 0 ? (
        <div className="glass rounded-2xl p-6 text-center" role="status">
          <p className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>No human reviews are waiting</p>
          <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            Ambiguity, qualification, and buying-center checks will appear here when judgment is required.
          </p>
        </div>
      ) : (
        <section aria-labelledby="review-queue-items-title">
          <h3 id="review-queue-items-title" className="sr-only">Review queue items</h3>
          <div className="grid gap-4 xl:grid-cols-2">
            {queue.items.map((item, index) => (
              <ReviewItemCard
                key={item.itemId}
                item={item}
                actorId={props.actorId}
                now={props.now}
                lastEventAt={lastEventAt}
                onClaim={props.onClaim}
                onRelease={props.onRelease}
                onResolve={props.onResolve}
                index={index}
              />
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
