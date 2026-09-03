"use client";

import type { ConnectorSourcePolicyDecision } from "@/lib/connectors/source-policy-registry";
import type { ConnectorSourceRunAuthoritySnapshot } from "@/lib/connectors/source-run-authority";

export type ConnectorGovernanceAuditState =
  | Readonly<{ state: "recorded"; eventId: string; recordedAt: string; actorId: string }>
  | Readonly<{ state: "pending" | "missing"; eventId?: never; recordedAt?: never; actorId?: never }>;

type ReadyProps = Readonly<{
  state: "ready";
  authority: ConnectorSourceRunAuthoritySnapshot;
  decision: ConnectorSourcePolicyDecision;
  audit: ConnectorGovernanceAuditState;
  asOf: string;
  onEnable?: (accountId: string) => void;
  onDisable?: (accountId: string) => void;
  onReview?: (sourcePolicyId: string) => void;
  error?: never;
}>;

export type ConnectorGovernancePanelProps =
  | Readonly<{ state: "loading"; error?: never; authority?: never; decision?: never; audit?: never; asOf?: never }>
  | Readonly<{ state: "error"; error: string; authority?: never; decision?: never; audit?: never; asOf?: never }>
  | Readonly<{ state: "empty"; error?: never; authority?: never; decision?: never; audit?: never; asOf?: never }>
  | ReadyProps;

type Tone = "success" | "warning" | "danger" | "muted";

const TONE_STYLE: Readonly<Record<Tone, Readonly<{
  background: string;
  borderColor: string;
  color: string;
}>>> = Object.freeze({
  success: { background: "var(--success-bg)", borderColor: "var(--success-border)", color: "var(--success-text)" },
  warning: { background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning-text)" },
  danger: { background: "var(--danger-bg)", borderColor: "var(--danger-border)", color: "var(--danger-text)" },
  muted: { background: "var(--status-muted-bg)", borderColor: "var(--status-muted-border)", color: "var(--status-muted-text)" },
});

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function instant(value: string): number | null {
  if (!TIMESTAMP.test(value)) return null;
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

function humanize(value: string): string {
  return value.replaceAll("_", " ");
}

function StatePanel({ state, message }: Readonly<{
  state: "loading" | "error" | "empty";
  message: string;
}>) {
  return (
    <section
      className="glass-heavy rounded-2xl p-5 sm:p-6"
      aria-labelledby={`connector-governance-${state}-title`}
      role={state === "error" ? "alert" : "status"}
      aria-busy={state === "loading" ? true : undefined}
      data-connector-state={state}
    >
      <p className="section-label">Admin · Connector governance</p>
      <h2 id={`connector-governance-${state}-title`} className="mt-2 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
        {state === "loading" ? "Loading connector authority" : state === "error" ? "Connector authority unavailable" : "No connector authority selected"}
      </h2>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{message}</p>
    </section>
  );
}

function Badge({ label, symbol, tone, state }: Readonly<{
  label: string;
  symbol: string;
  tone: Tone;
  state: string;
}>) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold"
      data-state={state}
      style={TONE_STYLE[tone]}
    >
      <span aria-hidden="true">{symbol}</span> {label}
    </span>
  );
}

function Fact({ label, children, breakAll = false }: Readonly<{
  label: string;
  children: React.ReactNode;
  breakAll?: boolean;
}>) {
  return (
    <div className="min-w-0 rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
      <dt className="section-label">{label}</dt>
      <dd className={`mt-1 text-sm font-semibold ${breakAll ? "break-all font-mono text-xs" : "break-words"}`} style={{ color: "var(--text-primary)" }}>{children}</dd>
    </div>
  );
}

export function ConnectorGovernancePanel(props: ConnectorGovernancePanelProps) {
  if (props.state === "loading") {
    return <StatePanel state="loading" message="Checking registry, source policy, run budget, and audit authority." />;
  }
  if (props.state === "error") return <StatePanel state="error" message={props.error} />;
  if (props.state === "empty") {
    return <StatePanel state="empty" message="Select a connector account to inspect its exact launch and run authority." />;
  }

  const { account, activation, policy, registryVersion, run, unit } = props.authority;
  const asOfEpoch = instant(props.asOf);
  const activationEpoch = instant(activation.activatedAt);
  const leaseEpoch = unit.leaseExpiresAt === null ? null : instant(unit.leaseExpiresAt);
  const scopeAligned = [activation, policy, account, run, unit].every((record) => (
    record.tenantId === run.tenantId && record.workspaceId === run.workspaceId
  ));
  const referencesAligned = registryVersion.sourceCardId === run.sourceCardId
    && registryVersion.version === run.connectorVersion
    && account.id === run.connectorAccountId
    && account.sourceCardId === run.sourceCardId
    && account.connectorVersion === run.connectorVersion
    && policy.id === run.sourcePolicyId
    && policy.connectorAccountId === account.id
    && policy.sourceCardId === run.sourceCardId
    && policy.connectorVersion === run.connectorVersion
    && activation.sourcePolicyId === policy.id
    && activation.policyKey === policy.policyKey
    && activation.policyVersion === policy.version;
  const fixtureOnly = registryVersion.executionMode === "fixture" && registryVersion.transport === "none"
    && policy.executionMode === "fixture" && account.credentialRefHash === null;
  const policyCurrent = policy.state === "active" && policy.termsState === "approved"
    && !policy.attestationRevoked && activation.revokedAt === null
    && asOfEpoch !== null && activationEpoch !== null && activationEpoch <= asOfEpoch;
  const budgetAligned = unit.reservedUnits <= run.hardCapUnits && run.hardCapUnits <= policy.hardCapUnits;
  const runCurrent = run.status === "running" && run.cancelRequestedAt === null && unit.status === "running"
    && unit.runId === run.id && unit.inputHash === run.inputHash && unit.maxAttempts === run.maxAttempts
    && unit.attemptCount > 0 && unit.attemptCount === unit.leaseGeneration
    && leaseEpoch !== null && asOfEpoch !== null && leaseEpoch > asOfEpoch;
  const decisionAligned = props.decision.sourceCardId === run.sourceCardId
    && props.decision.connectorVersion === run.connectorVersion
    && props.decision.connectorAccountId === account.id
    && props.decision.sourcePolicyId === policy.id
    && props.decision.sourcePolicyVersion === policy.version;
  const launchAllowed = props.decision.decision === "allow" && props.decision.code === "D015_PASS"
    && decisionAligned && scopeAligned && referencesAligned && fixtureOnly && policyCurrent
    && account.status === "fixture_only" && budgetAligned && runCurrent && props.audit.state === "recorded";

  const baseHumanActionSafe = scopeAligned && referencesAligned && asOfEpoch !== null
    && props.audit.state === "recorded" && account.status !== "revoked" && policy.state !== "revoked";
  const canEnable = baseHumanActionSafe && account.status === "disabled" && fixtureOnly && policyCurrent;
  const canDisable = baseHumanActionSafe && ["fixture_only", "ready", "suspended"].includes(account.status);
  const canReview = baseHumanActionSafe && !launchAllowed;
  const auditTone: Tone = props.audit.state === "recorded" ? "success" : props.audit.state === "pending" ? "warning" : "danger";

  return (
    <section className="space-y-5" aria-labelledby="connector-governance-title" data-surface="connector-governance-panel" data-connector-state="ready">
      <header className="glass-heavy rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="section-label">Admin · Connector governance</p>
            <h2 id="connector-governance-title" className="mt-2 break-words text-2xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
              {run.sourceCardId}
            </h2>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Version {run.connectorVersion} · {registryVersion.executionMode} execution · {registryVersion.transport} transport
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Badge
              label={launchAllowed ? "Launch approved" : "Launch denied"}
              symbol={launchAllowed ? "✓" : "×"}
              tone={launchAllowed ? "success" : "danger"}
              state={launchAllowed ? "launch-allowed" : "launch-denied"}
            />
            <Badge label={`Audit ${props.audit.state}`} symbol={props.audit.state === "recorded" ? "✓" : "!"} tone={auditTone} state={`audit-${props.audit.state}`} />
          </div>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,.65fr)]">
        <div className="space-y-5">
          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="connector-registry-title">
            <p className="section-label">Registered source</p>
            <h3 id="connector-registry-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Registry and source scope</h3>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <Fact label="Registry identity" breakAll>{registryVersion.sourceCardId}:v{registryVersion.version}</Fact>
              <Fact label="Account" breakAll>{account.id}</Fact>
              <Fact label="Tenant scope" breakAll>{run.tenantId}</Fact>
              <Fact label="Workspace scope" breakAll>{run.workspaceId ?? "Tenant-wide"}</Fact>
            </dl>
            <div className="mt-3 rounded-xl border p-3" data-scope-state={scopeAligned && referencesAligned ? "aligned" : "mismatch"} style={TONE_STYLE[scopeAligned && referencesAligned ? "success" : "danger"]}>
              <p className="text-sm font-semibold"><span aria-hidden="true">{scopeAligned && referencesAligned ? "✓" : "×"}</span> {scopeAligned && referencesAligned ? "Exact authority references align" : "Authority scope or references do not align"}</p>
            </div>
          </section>

          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="connector-policy-title">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="section-label">Deny by default</p>
                <h3 id="connector-policy-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Source-policy decision</h3>
              </div>
              <p className="break-all font-mono text-xs" style={{ color: "var(--text-tertiary)" }}>{policy.id}:v{policy.version}</p>
            </div>
            <div className="mt-4 rounded-xl border p-4" role="status" data-policy-decision={launchAllowed ? "allow" : "block"} style={TONE_STYLE[launchAllowed ? "success" : "danger"]}>
              <p className="text-sm font-semibold"><span aria-hidden="true">{launchAllowed ? "✓" : "×"}</span> {launchAllowed ? "Approved for this exact fixture run" : "Blocked — no launch authority"}</p>
              <p className="mt-1 break-words text-xs">Canonical decision: {props.decision.code}{decisionAligned ? "" : " · decision reference mismatch"}</p>
            </div>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Fact label="Policy state">{humanize(policy.state)}</Fact>
              <Fact label="Terms">{humanize(policy.termsState)}</Fact>
              <Fact label="Account state">{humanize(account.status)}</Fact>
              <Fact label="Execution">{fixtureOnly ? "Fixture only · no network" : "Not fixture-safe"}</Fact>
              <Fact label="Operations">{policy.allowedOperations.join(", ")}</Fact>
              <Fact label="Fields">{policy.allowedFields.join(", ")}</Fact>
            </dl>
          </section>

          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="connector-run-title">
            <p className="section-label">Bounded execution</p>
            <h3 id="connector-run-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Budget and run authority</h3>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Fact label="Policy hard cap">{policy.hardCapUnits} units</Fact>
              <Fact label="Run hard cap">{run.hardCapUnits} units</Fact>
              <Fact label="Current reservation">{unit.reservedUnits} units</Fact>
              <Fact label="Run state">{humanize(run.status)}</Fact>
              <Fact label="Unit state">{humanize(unit.status)}</Fact>
              <Fact label="Attempt">{unit.attemptCount} of {unit.maxAttempts}</Fact>
            </dl>
            <div className="mt-3 rounded-xl border p-3" data-run-authority={budgetAligned && runCurrent ? "current" : "blocked"} style={TONE_STYLE[budgetAligned && runCurrent ? "success" : "danger"]}>
              <p className="text-sm font-semibold"><span aria-hidden="true">{budgetAligned && runCurrent ? "✓" : "×"}</span> {budgetAligned && runCurrent ? "Current lease and budget align" : "Run authority is not current"}</p>
              <p className="mt-1 text-xs">As of <time dateTime={props.asOf}>{formatTimestamp(props.asOf)} UTC</time>{unit.leaseExpiresAt ? <> · lease ends <time dateTime={unit.leaseExpiresAt}>{formatTimestamp(unit.leaseExpiresAt)} UTC</time></> : " · no active lease"}</p>
            </div>
          </section>
        </div>

        <aside className="space-y-5" aria-label="Connector audit and controls">
          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="connector-audit-title">
            <p className="section-label">Governance record</p>
            <h3 id="connector-audit-title" className="mt-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>Audit state</h3>
            <div className="mt-3 rounded-xl border p-3" data-audit-state={props.audit.state} style={TONE_STYLE[auditTone]}>
              <p className="text-sm font-semibold"><span aria-hidden="true">{props.audit.state === "recorded" ? "✓" : "!"}</span> {humanize(props.audit.state)}</p>
              {props.audit.state === "recorded" ? (
                <>
                  <p className="mt-2 break-all font-mono text-[0.68rem]">{props.audit.eventId}</p>
                  <p className="mt-1 text-xs">{props.audit.actorId} · <time dateTime={props.audit.recordedAt}>{formatTimestamp(props.audit.recordedAt)} UTC</time></p>
                </>
              ) : <p className="mt-1 text-xs leading-relaxed">A recorded audit event is required before human controls become available.</p>}
            </div>
          </section>

          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="connector-authority-title">
            <p className="section-label">Current bindings</p>
            <h3 id="connector-authority-title" className="mt-1 text-base font-semibold" style={{ color: "var(--text-primary)" }}>Authority references</h3>
            <dl className="mt-3 space-y-2">
              <Fact label="Activation" breakAll>{activation.id}</Fact>
              <Fact label="Run" breakAll>{run.id}</Fact>
              <Fact label="Unit" breakAll>{unit.id}</Fact>
            </dl>
          </section>
        </aside>
      </div>

      {(canEnable && props.onEnable) || (canDisable && props.onDisable) || (canReview && props.onReview) ? (
        <footer className="glass-heavy rounded-2xl p-4 sm:p-5" aria-labelledby="connector-actions-title">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 id="connector-actions-title" className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Human governance controls</h3>
              <p id="connector-actions-help" className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>Callbacks apply only to these exact references. This panel performs no provider, network, or credential work.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              {canReview && props.onReview ? <button type="button" className="btn-glass min-h-11 w-full whitespace-normal focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" aria-describedby="connector-actions-help" onClick={() => props.onReview?.(policy.id)}>Review policy</button> : null}
              {canEnable && props.onEnable ? <button type="button" className="btn-primary min-h-11 w-full whitespace-normal focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" aria-describedby="connector-actions-help" onClick={() => props.onEnable?.(account.id)}>Enable fixture account</button> : null}
              {canDisable && props.onDisable ? <button type="button" className="btn-glass min-h-11 w-full whitespace-normal focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" aria-describedby="connector-actions-help" onClick={() => props.onDisable?.(account.id)}>Disable connector account</button> : null}
            </div>
          </div>
        </footer>
      ) : null}
    </section>
  );
}
