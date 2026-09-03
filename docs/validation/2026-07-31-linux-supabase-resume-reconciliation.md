# Fedora/Supabase resume reconciliation

Date: 2026-07-31

Baseline: `0c48035ef4a44b64580716b04d3b629f0c3b5b47`

Branch: `codex/nova-multitenant-integration`

Evidence tier: high

## Result

The Linux relocation is accepted locally as an operating-environment change.
It does not rewrite the Windows G-006B-B2 acceptance boundary. Supabase/Postgres
is the authoritative database for new platform capabilities under accepted
D-004; SQLite remains a dormant legacy/local compatibility lane.

The required finalized-only G-006 reconciliation is:

1. A resumed SQLite path must remint G-006C0 only from the accepted B2 final
   replay contract.
2. It must mint G-006C1 only from the final `user_version=6002` fresh schema.
3. G-006C2A must consume only those finalized bindings before G-006C2B can open.
4. This ordering is not portable to Fedora because the upgraded-path trust root
   is the accepted Win32/NTFS retained-lease contract. The sequence is paused,
   not skipped, deleted, or represented as Linux-validated.

Under the plan's blocker-minimization protocol and D-004, that dormant legacy
activation blocker does not block a Postgres-only child of G-007. The exact next
preflight is `G-007P`: audit the already accepted G-002 through G-005 Postgres
migrations and tests for tenant-inclusive uniqueness, composite parent/child
foreign keys, idempotency keys, and tenant-prefixed hot-path indexes. A new SQL
migration is permitted only for a proved missing contract; otherwise the
preflight must close with no production delta and name the next dependency.

## Implementation contract

- Truth owners: current user decision, PRD, D-004, implementation plan, accepted
  ledger events, current migrations/tests.
- Changed behavior in this transition: Linux executes only the coordinator's
  portable schema/catalog/input cases.
- Preserved behavior: all production SQLite code; all Windows-only test behavior;
  G-006B-B2 source, evidence, startup-disabled state, and 111/111 acceptance.
- Non-goals: G-006C remint implementation, G-006C2B, startup wiring, dependency
  changes, hosted Supabase access, remote migration, deployment, or production.
- Locks: `integration-ledger` and the coordinator test classification only;
  `sqlite-schema` production source is untouched.

## Fedora evidence

- Node `24.13.1`; npm `11.8.0`; `npm ci` completed without lockfile changes.
- npm reported 14 existing advisories: 2 low, 1 moderate, 10 high, 1 critical.
  No audit fix or dependency remediation was performed.
- TypeScript passed.
- Focused ESLint over the four handoff TypeScript files passed.
- Recovery verification passed for 37 application tables.
- Next.js 16.2.6 production build passed with 11/11 static pages.
- Before classification, the complete coordinator file reported 12 pass and 26
  failures, all from the intentional Windows-only native lease rejection.
- After classification, the same file reported 12 pass and 26 explicit skips on
  Fedora in 2.36 seconds with Vitest 4.0.18.

This is local synthetic/static evidence only. It is not hosted Supabase,
staging, production, deployment, migration, provider, outreach, or customer-data
evidence.

## First Postgres implementation result

The G-007P preflight found that PostgreSQL selected a legacy global
`lead_ai_artifacts` queue index for a tenant-filtered hot path. G-007P1 therefore
adds one forward migration that replaces the four inherited global AI-artifact
indexes with tenant-prefixed equivalents and adds exact replay/catalog guards.
The G-002 through G-005 real PostgreSQL suites and T-029 migration/recovery
rehearsal pass. Parent G-007 remains open for the remaining Postgres index audit
and the separately paused SQLite dependency.
