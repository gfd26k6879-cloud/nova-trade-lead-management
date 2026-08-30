"use client";

import type {
  AccountMergeSnapshot,
  AccountResolution,
  AccountSourceObservation,
} from "@/lib/discovery/account-resolution";

export type AccountMergeActionRequest = Readonly<{
  snapshot: AccountMergeSnapshot;
  survivorAccountId: string;
  retiredAccountId: string;
  evidenceObservationIds: readonly string[];
}>;

type ReadyProps = Readonly<{
  state: "ready";
  resolution: AccountResolution;
  mergeSnapshot?: AccountMergeSnapshot | null;
  onRequestReview?: (resolution: AccountResolution) => void;
  onRequestMerge?: (request: AccountMergeActionRequest) => void;
  onRequestUnmerge?: (request: AccountMergeActionRequest) => void;
  error?: never;
}>;

export type AccountResolutionPanelProps =
  | Readonly<{ state: "loading"; resolution?: never; mergeSnapshot?: never; error?: never }>
  | Readonly<{ state: "error"; error: string; resolution?: never; mergeSnapshot?: never }>
  | Readonly<{ state: "empty"; resolution?: never; mergeSnapshot?: never; error?: never }>
  | ReadyProps;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const HASH = /^sha256:[0-9a-f]{64}$/u;
const RESOLUTION_ID = /^account-resolution:[0-9a-f]{64}$/u;
const CANDIDATE_ID = /^account-candidate:[0-9a-f]{64}$/u;
const MERGE_EVENT_ID = /^account-merge-event:[0-9a-f]{64}$/u;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

const STATE_META = Object.freeze({
  auto_resolved: {
    symbol: "✓",
    label: "Exact match",
    summary: "One active account matched every source observation by exact source identity.",
    style: { background: "var(--success-bg)", borderColor: "var(--success-border)", color: "var(--success-text)" },
  },
  human_review: {
    symbol: "?",
    label: "Human review required",
    summary: "The evidence does not establish one canonical account. No identity change has been made.",
    style: { background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning-text)" },
  },
  canonical_candidate: {
    symbol: "+",
    label: "Canonical candidate",
    summary: "No existing account matched this exact source identity. A candidate was derived without creating an account.",
    style: { background: "var(--info-bg)", borderColor: "var(--info-border)", color: "var(--info-text)" },
  },
});

const RULE_REASON = Object.freeze({
  EXACT_SOURCE_ID_SAME_TENANT_NAMESPACE: "Exact source key, namespace, and external ID matched one active account in this workspace.",
  CONFLICTING_EXACT_IDENTITY: "Exact identity evidence points to multiple records, conflicting observations, or a non-active record.",
  NO_MATCH_OR_INSUFFICIENT_EVIDENCE: "The observations describe one source identity, but no existing account carries that exact identity.",
});

function validTimestamp(value: string): boolean {
  if (!TIMESTAMP.test(value)) return false;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value;
}

function formatTimestamp(value: string): string {
  if (!validTimestamp(value)) return "Unrecognized time";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(Date.parse(value));
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length && values.every((value) => value.length > 0);
}

function isCanonicalResolution(resolution: AccountResolution): boolean {
  if (resolution.resolutionVersion !== 1 || !UUID.test(resolution.tenantId) || !UUID.test(resolution.workspaceId)
    || !RESOLUTION_ID.test(resolution.resolutionId) || !HASH.test(resolution.resolutionHash)
    || resolution.observations.length === 0 || !unique(resolution.candidateAccountIds)
    || !unique(resolution.observations.map((item) => item.observationId))) return false;
  if (resolution.observations.some((item) => item.tenantId !== resolution.tenantId
    || item.workspaceId !== resolution.workspaceId || !validTimestamp(item.observedAt)
    || item.sourceKey.length === 0 || item.namespace.length === 0 || item.externalId.length === 0
    || !HASH.test(item.payloadHash) || !HASH.test(item.provenanceHash))) return false;

  if (resolution.state === "auto_resolved") {
    return resolution.ruleId === "EXACT_SOURCE_ID_SAME_TENANT_NAMESPACE"
      && resolution.targetAccountId !== null
      && resolution.canonicalCandidateId === null
      && resolution.candidateAccountIds.length === 1
      && resolution.candidateAccountIds[0] === resolution.targetAccountId;
  }
  if (resolution.state === "canonical_candidate") {
    return resolution.ruleId === "NO_MATCH_OR_INSUFFICIENT_EVIDENCE"
      && resolution.targetAccountId === null
      && resolution.canonicalCandidateId !== null && CANDIDATE_ID.test(resolution.canonicalCandidateId)
      && resolution.candidateAccountIds.length === 0;
  }
  return resolution.state === "human_review"
    && resolution.ruleId === "CONFLICTING_EXACT_IDENTITY"
    && resolution.targetAccountId === null
    && resolution.canonicalCandidateId === null;
}

function isCanonicalMergeSnapshot(snapshot: AccountMergeSnapshot, resolution: AccountResolution): boolean {
  if (snapshot.mergeVersion !== 1 || snapshot.tenantId !== resolution.tenantId
    || snapshot.workspaceId !== resolution.workspaceId || !HASH.test(snapshot.stateHash)
    || snapshot.members.length < 2 || snapshot.members.length > 128 || snapshot.events.length > 100
    || !unique(snapshot.members.map((member) => member.accountId))
    || !unique(snapshot.events.map((event) => event.eventId))) return false;

  const replay = new Map(snapshot.members.map((member) => [member.accountId, {
    status: "active" as "active" | "merged",
    redirectToAccountId: null as string | null,
  }]));
  let previousAt: string | null = null;
  for (const event of snapshot.events) {
    const survivor = replay.get(event.survivorAccountId);
    const retired = replay.get(event.retiredAccountId);
    const survivorMember = snapshot.members.find((item) => item.accountId === event.survivorAccountId);
    const retiredMember = snapshot.members.find((item) => item.accountId === event.retiredAccountId);
    if (!survivor || !retired || !survivorMember || !retiredMember
      || event.tenantId !== snapshot.tenantId || event.workspaceId !== snapshot.workspaceId
      || !MERGE_EVENT_ID.test(event.eventId) || event.actor.kind !== "human" || !UUID.test(event.actor.actorId)
      || event.reason.length === 0 || !validTimestamp(event.at)
      || (previousAt !== null && Date.parse(event.at) <= Date.parse(previousAt))
      || event.survivorAccountId === event.retiredAccountId || event.evidenceObservationIds.length === 0
      || !unique(event.evidenceObservationIds)
      || !survivorMember.observationRefs.some((id) => event.evidenceObservationIds.includes(id))
      || !retiredMember.observationRefs.some((id) => event.evidenceObservationIds.includes(id))) return false;
    if (event.action === "merge") {
      if (survivor.status !== "active" || retired.status !== "active") return false;
      retired.status = "merged";
      retired.redirectToAccountId = event.survivorAccountId;
    } else {
      if (survivor.status !== "active" || retired.status !== "merged"
        || retired.redirectToAccountId !== event.survivorAccountId) return false;
      retired.status = "active";
      retired.redirectToAccountId = null;
    }
    previousAt = event.at;
  }

  return snapshot.members.every((member) => {
    const expected = replay.get(member.accountId);
    return expected && Number.isSafeInteger(member.version) && member.version > 0
      && unique(member.observationRefs) && member.status === expected.status
      && member.redirectToAccountId === expected.redirectToAccountId;
  });
}

function actionRequest(
  snapshot: AccountMergeSnapshot,
  survivorAccountId: string,
  retiredAccountId: string,
): AccountMergeActionRequest | null {
  const survivor = snapshot.members.find((member) => member.accountId === survivorAccountId);
  const retired = snapshot.members.find((member) => member.accountId === retiredAccountId);
  if (!survivor || !retired || survivor.observationRefs.length === 0 || retired.observationRefs.length === 0) return null;
  return Object.freeze({
    snapshot,
    survivorAccountId,
    retiredAccountId,
    evidenceObservationIds: Object.freeze([...new Set([
      ...survivor.observationRefs,
      ...retired.observationRefs,
    ])].sort()),
  });
}

function eligibleMergeRequests(
  resolution: AccountResolution,
  snapshot: AccountMergeSnapshot | null,
): readonly AccountMergeActionRequest[] {
  if (!snapshot || resolution.state !== "human_review" || resolution.candidateAccountIds.length !== 2
    || snapshot.events.length >= 100) return [];
  const [first, second] = resolution.candidateAccountIds;
  if (!first || !second) return [];
  const firstMember = snapshot.members.find((member) => member.accountId === first);
  const secondMember = snapshot.members.find((member) => member.accountId === second);
  if (firstMember?.status !== "active" || secondMember?.status !== "active") return [];
  return [actionRequest(snapshot, first, second), actionRequest(snapshot, second, first)]
    .filter((request): request is AccountMergeActionRequest => request !== null);
}

function eligibleUnmergeRequests(snapshot: AccountMergeSnapshot | null): readonly AccountMergeActionRequest[] {
  if (!snapshot || snapshot.events.length >= 100) return [];
  return snapshot.members.flatMap((retired) => {
    if (retired.status !== "merged" || !retired.redirectToAccountId) return [];
    const latest = [...snapshot.events].reverse().find((event) => event.survivorAccountId === retired.redirectToAccountId
      && event.retiredAccountId === retired.accountId);
    const request = latest?.action === "merge"
      ? actionRequest(snapshot, retired.redirectToAccountId, retired.accountId) : null;
    return request ? [request] : [];
  });
}

function StatePanel({ state, message }: Readonly<{ state: "loading" | "error" | "empty"; message: string }>) {
  const loading = state === "loading";
  return (
    <section
      className="glass-heavy rounded-2xl p-5 sm:p-6"
      data-account-resolution-state={state}
      aria-labelledby={`account-resolution-${state}-title`}
      role={loading ? "status" : state === "error" ? "alert" : undefined}
      aria-busy={loading ? true : undefined}
    >
      <p className="section-label">Account identity · Evidence governed</p>
      <h2 id={`account-resolution-${state}-title`} className="mt-2 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
        {loading ? "Loading account resolution" : state === "error" ? "Account resolution unavailable" : "No account resolution yet"}
      </h2>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{message}</p>
    </section>
  );
}

function ObservationCard({ observation }: Readonly<{ observation: AccountSourceObservation }>) {
  return (
    <li className="min-w-0 rounded-xl border p-3 sm:p-4" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <p className="break-all text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{observation.observationId}</p>
        <time className="shrink-0 text-xs" style={{ color: "var(--text-tertiary)" }} dateTime={observation.observedAt}>
          {formatTimestamp(observation.observedAt)} UTC
        </time>
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div><dt className="text-xs" style={{ color: "var(--text-tertiary)" }}>Source</dt><dd className="mt-1 break-all text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>{observation.sourceKey}</dd></div>
        <div><dt className="text-xs" style={{ color: "var(--text-tertiary)" }}>Namespace</dt><dd className="mt-1 break-all text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>{observation.namespace}</dd></div>
        <div><dt className="text-xs" style={{ color: "var(--text-tertiary)" }}>External ID</dt><dd className="mt-1 break-all text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>{observation.externalId}</dd></div>
      </dl>
      <p className="mt-3 break-all text-[11px] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>Payload: {observation.payloadHash}</p>
      <p className="mt-1 break-all text-[11px] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>Provenance: {observation.provenanceHash}</p>
    </li>
  );
}

export function AccountResolutionPanel(props: AccountResolutionPanelProps) {
  if (props.state === "loading") return <StatePanel state="loading" message="Checking exact source identities and prior account records." />;
  if (props.state === "error") return <StatePanel state="error" message={props.error} />;
  if (props.state === "empty") return <StatePanel state="empty" message="Run discovery before resolving source observations to a canonical account." />;

  const { resolution } = props;
  if (!isCanonicalResolution(resolution)) {
    return (
      <section className="glass-heavy rounded-2xl p-5 sm:p-6" data-account-resolution-state="invalid" role="alert" aria-labelledby="account-resolution-invalid-title">
        <p className="section-label">Account identity · Fail closed</p>
        <h2 id="account-resolution-invalid-title" className="mt-2 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Resolution withheld</h2>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>This record is not an exact canonical resolution. Review and identity-change controls are unavailable.</p>
      </section>
    );
  }

  const mergeSnapshot = props.mergeSnapshot && isCanonicalMergeSnapshot(props.mergeSnapshot, resolution)
    ? props.mergeSnapshot : null;
  const mergeRequests = eligibleMergeRequests(resolution, mergeSnapshot);
  const unmergeRequests = eligibleUnmergeRequests(mergeSnapshot);
  const meta = STATE_META[resolution.state];
  const canonicalIdentity = resolution.targetAccountId ?? resolution.canonicalCandidateId;
  const hasActions = (resolution.state === "human_review" && Boolean(props.onRequestReview))
    || (Boolean(props.onRequestMerge) && mergeRequests.length > 0)
    || (Boolean(props.onRequestUnmerge) && unmergeRequests.length > 0);

  return (
    <section
      className="glass-heavy min-w-0 rounded-2xl p-4 sm:p-6"
      data-account-resolution-state="ready"
      data-resolution-kind={resolution.state}
      aria-labelledby="account-resolution-title"
    >
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="section-label">Account identity · Evidence governed</p>
          <h2 id="account-resolution-title" className="mt-2 text-xl font-semibold" style={{ color: "var(--text-primary)" }}>Canonical account resolution</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{meta.summary}</p>
        </div>
        <span className="w-fit rounded-full border px-3 py-1.5 text-xs font-semibold" aria-label={`Resolution status: ${meta.label}`} style={meta.style}>
          <span aria-hidden="true">{meta.symbol}</span> {meta.label}
        </span>
      </header>

      <div className="mt-5 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(19rem,.7fr)]">
        <div className="min-w-0 space-y-4">
          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="account-resolution-evidence-title">
            <p className="section-label">Source receipts</p>
            <h3 id="account-resolution-evidence-title" className="mt-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>Identity evidence</h3>
            <ol className="mt-4 space-y-3" aria-label="Account identity observations">
              {resolution.observations.map((observation) => <ObservationCard key={observation.observationId} observation={observation} />)}
            </ol>
          </section>

          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="account-merge-history-title">
            <p className="section-label">Reversible history</p>
            <h3 id="account-merge-history-title" className="mt-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>Merge and unmerge audit</h3>
            {!props.mergeSnapshot ? (
              <p className="mt-3 text-sm" style={{ color: "var(--text-secondary)" }}>No merge history is attached to this resolution.</p>
            ) : !mergeSnapshot ? (
              <p className="mt-3 rounded-xl border p-3 text-sm" role="alert" style={{ background: "var(--danger-bg)", borderColor: "var(--danger-border)", color: "var(--danger-text)" }}>
                Merge state could not be verified in this workspace. Identity-change controls are unavailable.
              </p>
            ) : mergeSnapshot.events.length === 0 ? (
              <p className="mt-3 text-sm" style={{ color: "var(--text-secondary)" }}>No accounts have been merged. Every member remains independently active.</p>
            ) : (
              <ol className="mt-4 space-y-3" aria-label="Account merge and unmerge history">
                {mergeSnapshot.events.map((event) => (
                  <li key={event.eventId} className="rounded-xl border p-3 sm:p-4" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{event.action === "merge" ? "Merged accounts" : "Reversed merge"}</p>
                      <time className="text-xs" style={{ color: "var(--text-tertiary)" }} dateTime={event.at}>{formatTimestamp(event.at)} UTC</time>
                    </div>
                    <p className="mt-2 break-all text-xs" style={{ color: "var(--text-secondary)" }}>{event.retiredAccountId} → {event.survivorAccountId}</p>
                    <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{event.reason}</p>
                    <p className="mt-2 break-all text-[11px]" style={{ color: "var(--text-tertiary)" }}>Human actor: {event.actor.actorId}</p>
                    <p className="mt-1 break-all text-[11px]" style={{ color: "var(--text-tertiary)" }}>Evidence: {event.evidenceObservationIds.join(", ")}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside className="min-w-0 space-y-4" aria-label="Canonical identity and human controls">
          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="canonical-account-title">
            <p className="section-label">Canonical identity</p>
            <h3 id="canonical-account-title" className="mt-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>
              {canonicalIdentity ? "Identity established" : "Identity unresolved"}
            </h3>
            <p className="mt-3 break-all rounded-xl border p-3 text-sm font-semibold" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)", color: "var(--text-primary)" }}>
              {canonicalIdentity ?? "No canonical account selected"}
            </p>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{RULE_REASON[resolution.ruleId]}</p>
            {resolution.candidateAccountIds.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>Matched records</p>
                <ul className="mt-2 space-y-2" aria-label="Candidate account identities">
                  {resolution.candidateAccountIds.map((accountId) => <li key={accountId} className="break-all rounded-lg border px-3 py-2 text-xs font-semibold" style={{ borderColor: "var(--surface-card-border)", color: "var(--text-secondary)" }}>{accountId}</li>)}
                </ul>
              </div>
            )}
          </section>

          {mergeSnapshot && (
            <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="account-members-title">
              <p className="section-label">Current state</p>
              <h3 id="account-members-title" className="mt-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>Account members</h3>
              <ul className="mt-3 space-y-2" aria-label="Current account merge members">
                {mergeSnapshot.members.map((member) => (
                  <li key={member.accountId} className="rounded-xl border p-3" data-member-status={member.status} style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 break-all text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{member.accountId}</p>
                      <span className="shrink-0 text-xs capitalize" style={{ color: member.status === "active" ? "var(--success-text)" : "var(--warning-text)" }}>{member.status}</span>
                    </div>
                    {member.redirectToAccountId && <p className="mt-2 break-all text-xs" style={{ color: "var(--text-secondary)" }}>Redirects to {member.redirectToAccountId}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {hasActions && (
            <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="account-resolution-actions-title">
              <p className="section-label">Human checkpoint</p>
              <h3 id="account-resolution-actions-title" className="mt-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>Available requests</h3>
              <div className="mt-4 grid gap-2">
                {resolution.state === "human_review" && props.onRequestReview && (
                  <button type="button" className="rounded-xl border px-4 py-2.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2" style={{ background: "var(--accent)", borderColor: "var(--accent)", color: "var(--text-on-accent)", outlineColor: "var(--accent)" }} onClick={() => props.onRequestReview?.(resolution)}>
                    Review ambiguous identity
                  </button>
                )}
                {props.onRequestMerge && mergeRequests.map((request) => (
                  <button key={`merge:${request.survivorAccountId}:${request.retiredAccountId}`} type="button" className="rounded-xl border px-4 py-2.5 text-left text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)", color: "var(--text-primary)", outlineColor: "var(--accent)" }} onClick={() => props.onRequestMerge?.(request)}>
                    Merge {request.retiredAccountId} into {request.survivorAccountId}
                  </button>
                ))}
                {props.onRequestUnmerge && unmergeRequests.map((request) => (
                  <button key={`unmerge:${request.survivorAccountId}:${request.retiredAccountId}`} type="button" className="rounded-xl border px-4 py-2.5 text-left text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2" style={{ background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning-text)", outlineColor: "var(--accent)" }} onClick={() => props.onRequestUnmerge?.(request)}>
                    Unmerge {request.retiredAccountId} from {request.survivorAccountId}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>These controls request human review or a reversible identity transition. This panel never changes records directly.</p>
            </section>
          )}

          <p className="break-all px-1 text-[11px] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>Resolution: {resolution.resolutionId}</p>
        </aside>
      </div>
    </section>
  );
}
