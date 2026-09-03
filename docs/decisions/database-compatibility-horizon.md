# D-004 Database compatibility horizon for tenant-intelligence expansion

Source artifact: `docs/plans/2026-07-27-multi-tenant-lead-intelligence-platform-implementation-plan.md`

Accepted dependency: `docs/architecture/tenant-workspace-contract.md` (D-001)

Status: **Accepted D-004 decision — parent-verified for local implementation**

Date: **2026-07-27**

## 1) Decision and non-negotiables

For all new platform capabilities in Phases 1-8, **Postgres is the authoritative runtime** for tenant isolation, queueing, worker orchestration, object storage control flow, compliance state, evidence history, and auditability.

SQLite is approved only as a **bounded legacy/local compatibility lane** and **test surface** while preserving existing local website-lead behavior and current recovery tooling.

SQLite cannot be used as a production-like authority for:

- tenant-scoped isolation proof,
- RLS-equivalent enforcement,
- scheduler/queue execution with lease semantics,
- secure object storage workflows,
- authenticated worker invocations,
- source-connector contracts with regulated credentials or billing,
- vector/semantic retrieval or tenant-indexed cache isolation.

There is no implicit dual-authority state. A dataset is either Postgres-authoritative or SQLite-compatibility-scoped for the task, never both.

## 2) Current state anchors (read from repository)

- `src/lib/db/index.ts` already switches backend by `DATABASE_URL` presence.
  - with `DATABASE_URL` configured: Postgres path
  - without `DATABASE_URL`: local `nosite-leads.db` SQLite path
- Recovery tooling is hard-bound to the **23 legacy tables** in
  `scripts/data-transfer-contract.mjs` and `docs/DATA_RECOVERY.md`.
  - export/import does **not** apply migrations
  - protected columns are excluded, Google review JSON is redacted
  - import is atomic upsert in one transaction in Postgres target
- `src/lib/db/schema.ts` contains legacy table definitions plus local migration columns.
- Migration files already show Postgres-only primitives used today:
  - role restriction + revocation in `202605120002_supabase_auth_roles.sql`
  - cron/worker invocation + `pg_net`/`pg_cron` in
    `20260514161714_supabase_ai_verification_cron.sql`
  - general app scheduler + restricted worker function invocations in
    `20260514163203_scheduler_v2_sales_ready_pipeline.sql`
  - explicit hardening of DB function access and RLS defaults in
    `202607120002_harden_database_function_access_and_fk_indexes.sql`
- `README.md` and `docs/DATA_RECOVERY.md` define the current local/backward-compatible command set.

## 3) Capability inventory and compatibility class

### 3.1 Postgres-only required now or by design

1. **RLS/authorization surface** (tenant-aware policy enforcement):
   required for launch isolation across all resource families.
2. **Restricted DB roles + function-only write path** (no direct anon/authenticated mutation):
   enforced in current migrations.
3. **Transaction-local tenant context** and safe context reset semantics:
   required before any production-scope auth-critical operation.
4. **Queue/cron orchestration** with worker lease and background schedules:
   current code uses Postgres extension-backed scheduling.
5. **Object storage + malware-scan/validation workflows**:
   future connector decisions require storage-backed document ingestion and evidence provenance.
6. **Connector/provider secret handling and signed callback state**:
   needs dedicated secret store and DB-backed policies.
7. **Search/indexing and future embedding paths**:
   any retrieval index used for model-facing context must be tenant-versioned and immutable-history-safe; treat as Postgres-authoritative.

### 3.2 SQLite supported for this slice

1. **Developer ergonomics and legacy compatibility** for existing local workflow.
2. **Schema continuity and migration smoke in legacy paths** via schema additive migrations in local DB helper.
3. **Recovery command training**:
   export/verify/import-dry-run for the legacy 23-table contract.
4. **Local deterministic unit and fixture execution** for compatibility-path components.

All SQLite support above is explicitly bounded: one table set, one workflow (`legacy-website-lead` compatibility), and no production authorization claims.

## 4) Phase 1-8 matrix (backend authority, test posture, and fail behavior)

| Phase | Subsystem family | Authoritative backend | SQLite handling | Migration/backfill/export expectation | Unsupported-backend behavior |
|---|---|---|---|---|---|
| 1 | Tenant/workspace model, memberships, RBAC, lifecycle, support access, rate/kill states, tenant logging, worker auth context | **Postgres only** | **Mirror-safe schema + fixtures only** for local compatibility tests | New tenant/workspace/membership tables are introduced in Postgres migrations with explicit indexes and constraints; any SQLite-mirrored columns are additive only for parity tests. | If `DATABASE_URL` mode is active, SQLite-only path is rejected for tenant-auth critical operations with explicit fail reason. |
| 2 | Backward compatibility migration for legacy 23 tables (local markets, leads, place cache/observations, crawl runs/units, admin requests/demos, API usage, ai artifacts, etc.) | **Postgres for isolation proof**, SQLite for legacy fixture parity where explicitly called out | SQLite retains table shapes used by current compatibility play; post-tenant scope can be represented in local data only for deterministic tests | Recovery contract still scoped to 23 tables; D-001 D-004-required tenant reclassification is tracked and backfilled through compatibility migration task paths. Export/import remains a 23-table legacy contract until contract update tasks are approved | If tenant isolation checks require RLS-backed behavior, SQLite-only run is marked as compatibility-only and cannot satisfy acceptance gates. |
| 3 | Document ingestion, extraction, claims/evidence, document version/chunk tables, malware scan queue, URL fetcher | **Postgres only** for connector secrets, storage refs, and legal/audit state | SQLite may run parser/normalization fixtures only; no connector secret handling or storage-backed ingestion as authoritative behavior | Legacy 23-table recovery contract cannot carry post-Phase-3 feature rows yet. Any exported data for these features must be treated as non-authoritative until contract extension is explicitly approved | Any attempt to validate production claims (storage scan status, malware verdict, connector fetch outcomes) in SQLite is a blocked test mode with explicit diagnostic code |
| 4 | Agent runs, tool-call logs, adaptive questions, business-understanding, uncertainty inventory | **Postgres only** for replay-safe, tenant-scoped model context | SQLite allowed only for deterministic harnesses and synthetic fixtures without external model calls | New phase tables are not part of current recovery contract; backfill can only be via Postgres fixtures generated by test lanes | If an adaptive-agent state mutation is attempted in SQLite, it must fail with explicit unsupported-backend message |
| 5 | ICPs, plays, versions, play search/qualification policy validators | **Postgres only** for versioned policy, review, and explainability audit | SQLite allowed for scaffolded fixtures only when explicitly deactivated from side-effectful operations | Recovery contract unchanged unless a phase-level schema update is intentionally approved in future; no legacy fallback for active ICP/play records | Any active play activation or version publish in SQLite path must fail-closed |
| 6 | Connector registry, source policies, discovery plans, source runs/units, canonical account tables, account resolution, normalizers | **Postgres only** for connector policy, cost accounting, run isolation, source provenance | SQLite may keep the legacy compatibility path and existing Google Places cache rows for local developer continuation | 23-table recovery export/import does not cover connector/account resolution and run tables in this slice; these are non-migratable until a future recovery-contract expansion decision | Post-search/source-run mutations in SQLite are rejected unless explicitly marked "test adapter only" |
| 7 | Contacts, contact permissions/suppression, buying centers, qualification, scoring, review queues | **Postgres only** | SQLite only for compatibility fixtures and no-contact-use side-effect simulation | New scoring/contact/buying tables are outside legacy contract until contract expansion is approved. Retention/export obligations stay on Postgres-only evidence path | If suppression or contact use evaluation is executed in SQLite, reject and require Postgres-authoritative execution |
| 8 | Outreach drafts, approvals, policy checks, outcomes, learning proposals | **Postgres only** for human gates and outcome/legal traceability | SQLite allowed only for in-memory/dry-run UI or fixture render tests; no authoritative draft or outcome state | Legacy recovery contract has no outreach-learning tables; SQLite has no role in live approval, suppression checks, or outcome attribution | Any "approved draft" or "send-ready" state in SQLite is invalid and must hard-stop |

## 5) Compatibility and failover rules (mandatory implementation requirements)

1. **No silent fallback from Postgres to SQLite.** Backend selection follows explicit `DATABASE_URL` configuration only; runtime failure in Postgres mode must fail the request/operation with error and not auto-switch adapters.
2. **Production prohibition for SQLite authority:** no outbound, policy, or consent-sensitive operations may use SQLite as source-of-truth for launch.
3. **Compatibility-mode labeling:** all SQLite flows used during this phase must log/mark themselves as "legacy compatibility only" in execution metadata where surfaced.
4. **Cross-tenant defaults forbidden:** any SQLite test path that lacks tenant/workspace filtering must stay explicitly scoped to compatibility fixtures.
5. **No schema-dependent silent drift:** if SQLite is missing a required legacy contract key or protected column, command and migration checks must fail hard with line-precise diagnostics.

## 6) Migration, backfill, and recovery behavior by class

### 6.1 Clean/disposable Postgres implementation track

- Used for new features in phases 1-8 and for acceptance gates that need tenant isolation, RLS, and worker scheduling.
- Migration and backfill behavior are local and disposable unless a later explicit remote baseline slice authorizes linked-project checks.
- This task does **not** run linked remote migration scans.

### 6.2 Linked-remote baseline authorization track

- Remote-linked baseline evidence remains a separately authorized concern (linked to D-005 in the plan) and is not a gating precondition for D-004 local decision execution.
- If and when remote baseline checks are authorized, they are used only for compatibility drift and rollout readiness, never as an implied local default authority.

### 6.3 Legacy recovery contract track (current)

- **23-table contract remains binding** for `db:export:sqlite`, `db:verify:recovery`, and `db:import:supabase`.
- Protected settings columns must stay excluded; review the contract and recovery docs for exact exclusions.
- Import is atomic by design; write operations are in one transaction with auth-reference validation.
- Any table added in future phases is **not** part of this contract until that phase explicitly updates recovery scope.

## 7) Compatibility horizon and explicit retirement trigger

SQLite remains active for legacy compatibility only until all of the following are approved in writing:

1. Phase 2 tenant-boundary proof is complete and accepted on Postgres (`Q-012` completed),
2. The post-legacy table expansion contract explicitly defines which future tables are included in portable recovery,
3. Outreach-outcome and learning workflows are accepted in Postgres with legal/privacy gates,
4. A dated cutover decision records fallback and cleanup behavior for existing local-only workflows.

When those conditions are met, run a dedicated decision slice to retire or narrow SQLite compatibility; until then, no implicit cutoff date is assumed.

## 8) Test lanes and DB/recovery commands to use with this decision

### 8.1 Required recovery and data-lane commands

- `npm run db:verify:recovery -- --db nosite-leads.db`
  - exit code: `0` success, non-zero on schema/table/key mismatch
- `npm run db:export:sqlite -- --db nosite-leads.db --out <DIR>`
  - prints row counts, exits non-zero if DB schema or contract mismatch
- `npm run db:verify:recovery -- --dir <EXPORT_DIR>`
  - verifies manifest structure, checksums, row counts, key constraints
- `npm run db:import:supabase -- --dir <EXPORT_DIR> --dry-run`
  - validates target schema and auth references without writes
- `npm run db:import:supabase -- --dir <EXPORT_DIR>`
  - requires `DATABASE_URL`; single-transaction upsert commit or full failure/rollback on error

### 8.2 Testing lanes relevant to backend authority

- `npm run release:check` for static/build/e2e public baseline.
- `npm run test:e2e`, `npm run test:e2e:public`, `npm run test:e2e:launch` as per auth/cookie requirements.
- `npm run test:e2e:mutating` only with explicit local mutation override.
- Plan gates to execute on real Postgres for DB isolation evidence: `Q-012`, `Q-034`, `Q-036`, `Q-038`, and `Q-040` dependencies.

## 9) Acceptance criteria (D-004 execution)

This decision is complete when all of the following are satisfied and documented:

1. Every Phase 1-8 subsystem in this file has one explicit authority mode and one non-ambiguous SQLite scope.
2. No task text or test receipt for this slice uses "both databases authoritative" wording.
3. No-path-fail mode allows a Postgres-required flow to complete in SQLite without explicit compatibility labeling.
4. Recovery command set behavior is unchanged until a future explicit contract expansion task.
5. Legacy website-lead compatibility remains functional in local SQLite and migration paths until the explicit cutoff slice.

## 10) DoneClaim (for task handoff)

- File: `docs/decisions/database-compatibility-horizon.md`
- Matrix counts:
  - Phase matrix entries: **8**
  - Legacy recovery tables: **23**
  - Recovery/DB command families covered: **5** core commands
  - Test lanes referenced for DB authority: **6** (release/recovery/e2e/auth-mutation + lane classes)
- Criteria:
  - one authoritative statement: Postgres-only launch path
  - one bounded SQLite path: legacy compatibility/test fixtures only
  - explicit no-silent-fallback rules
  - explicit retirement trigger conditions
- Stale-state probes (before accepting D-004 evidence snapshots):
  - verify working tree state is known (`git status --short --untracked-files=all`)
  - confirm no unexpected exports remain (`npm run db:export:sqlite` outputs only in approved temp path)
  - confirm no untracked whitespace-only changes in this file using repository-aware checks
- Cleanup protocol:
  - delete temporary export directories once validated,
  - retain decision file and any command manifests needed for audit,
  - clear any temporary Postgres/SQLite scratch DB artifacts per local runbook
- Known risks:
  - continuing SQLite in legacy mode can obscure RLS/tenant bugs if tests are not explicit per-phase,
  - recovery tooling currently covers only legacy tables, so phase 3+ data is non-portable without contract expansion,
  - object-storage and vector/search confidence depends on explicit connector/storage decisions outside current slice.

## 11) 2026-07-31 Fedora and Supabase operating clarification

This append-only clarification records an environment relocation, not a redesign
or a rewrite of the Windows acceptance record.

- Fedora/Linux is the primary development and local-validation environment from
  this point forward.
- Supabase/Postgres remains the authoritative application database for all new
  multi-tenant capabilities. Linux development must exercise the Postgres path
  with an explicit `DATABASE_URL`; absence of that variable continues to select
  only the bounded legacy/local SQLite compatibility path until a later card
  changes that runtime selector.
- The accepted G-006B-B2 Win32/NTFS evidence remains valid historical evidence
  for its exact legacy boundary. Fedora cannot reproduce or replace its file-ID,
  share-mode, retained-handle, or PowerShell guarantees.
- Finalized-only G-006C0/G-006C1 reminting and G-006C2A consumption are still the
  next dependencies if the dormant SQLite activation path is resumed. They are
  not prerequisites for Postgres-only work under D-004 and must not be executed
  on Fedora under weaker filesystem assumptions.
- G-006C2B remains unopened. No SQLite finalizer or compatibility writer is wired
  into startup, and no persistent database is mutated by this clarification.
- The next Postgres dependency slice must be explicitly bounded and validated on
  disposable PostgreSQL before any hosted Supabase, staging, or production claim.
