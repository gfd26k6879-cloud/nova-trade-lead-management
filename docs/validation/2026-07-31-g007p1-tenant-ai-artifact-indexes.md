# G-007P1 Postgres tenant-prefixed AI artifact indexes

Date: 2026-07-31

Baseline: `0c48035ef4a44b64580716b04d3b629f0c3b5b47`

Source commit: `076ce53719749546efaa5e89f113845bf2b8a4a0`

Branch: `codex/nova-multitenant-integration`

Status: locally implemented and validated; parent G-007 remains open

## Boundary

G-007P is the Postgres-only child of G-007 permitted by D-004 while the legacy
SQLite G-006 finalized-binding activation path remains paused on its accepted
Windows/NTFS trust boundary. G-007P1 covers only the
`lead_ai_artifacts` hot-path index family.

The migration requires the accepted non-null `tenant_id` column and exact G-004A
tenant queue index. It replaces four global indexes with tenant-prefixed
equivalents for lead/type history, status/created ordering, retry readiness, and
requester history. It grants no privileges, adds no RLS policy, changes no row,
and does not alter a constraint or application query.

Replay accepts only the exact final catalog. A missing, partial, or spoofed
baseline/final index set raises `G007P1_INDEX_CATALOG_DRIFT` before any DDL.

## Evidence

Fedora, Node 24.13.1, npm 11.8.0, PostgreSQL 16 disposable local containers:

- G-002 Postgres: 2/2 passed, 8.84 seconds.
- G-003 Postgres: 2/2 passed, 40.56 seconds.
- G-004A Postgres: 1/1 passed, 79.21 seconds.
- G-005 plus G-007P1 catalog, explicit final replay, and query-plan proof: 1/1
  passed, 76.76 seconds.
- T-029 recovery/migration replay: 19/19 passed, 46 migrations discovered,
  44 applied, and the same 2 Supabase-runtime-only migrations skipped.
- TypeScript passed.
- Focused ESLint over all changed TypeScript tests passed with zero warnings.
- Recovery verifier passed for 37 application tables.
- Next.js 16.2.6 build passed; 11/11 static pages generated.

The first query-plan probe failed because PostgreSQL selected the inherited
global `idx_lead_ai_artifacts_status_created` index instead of a tenant-prefixed
index. That failure is the finding this slice fixes. The first migration attempt
then failed safely because an absent optional index was cast directly to
`regclass`; null-safe `to_regclass` inspection corrected the preflight without
any applied DDL. Neither failure is represented as a pass.

## Remaining work

Parent G-007 is open. G-007P2 must audit the remaining global indexes on G-002
through G-005 tenant-owned tables and split further exact Postgres index packets
where query-plan evidence proves a real delta. The SQLite portion of G-007 stays
dependent on the paused G-006 compatibility lane. G-006C2B remains unopened.

No hosted Supabase, remote migration, staging, production, provider, customer
data, deployment, push, pull request, credential, or outreach action occurred.
