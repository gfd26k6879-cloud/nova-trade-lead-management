# G-007P11 tenant-wide open admin-request list index validation

Date: 2026-07-31

Baseline: `2bf605579297c89e5bbe4611e1c87f1dabd05707`

Branch: `codex/nova-multitenant-integration`

Status: accepted locally

Source commit: pending attributable local commit

## Scope and decision

G-007P11 is one PostgreSQL-only additive index packet for the future
tenant-wide open admin-request list. The installed partial expression index is:

```sql
CREATE INDEX idx_g007p11_admin_tenant_open_priority_status_created
  ON public.admin_requests (
    tenant_id,
    (CASE priority WHEN 'urgent' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END),
    (CASE status
      WHEN 'new' THEN 0
      WHEN 'seen' THEN 1
      WHEN 'in_progress' THEN 2
      WHEN 'waiting_on_researcher' THEN 3
      ELSE 4
    END),
    created_at DESC
  )
  WHERE status IN ('new', 'seen', 'in_progress', 'waiting_on_researcher');
```

`admin_requests.workspace_id` remains nullable. This packet proves only
tenant-wide list ownership; it does not create or claim workspace authority.
The current global list index remains installed. No caller, query, summary,
lead-local lookup, mutation, session, permission, runtime repair, SQLite, UI,
or provider behavior changed.

## PostgreSQL 16.14 plan evidence

The audit applied the complete 51/49/2 pre-P11 chain and seeded 144,000
physically interleaved requests, 72,000 per tenant and 48,000 open per tenant.
Each tenant has exactly 36,000 null-workspace and 36,000 non-null-workspace
rows. Tenant B's timestamps are all newer, so every future tenant baseline must
discard 48,000 wrong-tenant open rows before returning tenant A.

All typed and untyped tenant baselines at limits 6, 50, 100, and 200 use a
sequential scan plus sort, have no tenant `Index Cond`, and do not use P11.
After installation, all twelve analyzed tenant forms use P11 with tenant in
`Index Cond`, no sort, no residual tenant filter, and identical ordered ID
digests. The accepted candidate is 4,800,512 bytes. `request_type` remains a
residual filter deliberately, avoiding a duplicate typed/untyped index family.

The exact current unscoped typed and untyped lists and fulfillment summary
retain their planned shapes, results, and ordering without P11. Both current
lead-local paths retain `idx_admin_requests_lead_created`, identical planned
shapes and expected results. This includes the joined lead-detail CASE-ordered
form and the typed newest-open-for-lead form.

## Catalog, replay, and rollback evidence

The migration fails closed on column type/nullability drift, status/type/priority
constraint drift, primary-key drift, tenant-lead/workspace foundation drift,
G-003 backing-index drift, retained-global drift, unhealthy indexes, non-index
spoofs, and any literal-prefix reserved sibling. Initial installation requires
zero P11-prefix objects plus the exact healthy current global index.

Final replay accepts exactly one live, ready, valid, non-unique index with the
canonical four-key expression definition and exact open-status predicate.
Wrong key order, CASE semantics, predicate, collation, INCLUDE, uniqueness,
table, object kind, health, and same-prefix siblings reject before DDL. A
wildcard lookalike does not collide. Failed preflight and explicit transaction
rollback leave no partial installation. Later authorized removal of the global
index and unrelated index evolution do not invalidate a complete final P11
catalog. Live `ensureDbReady` preserves P11 and emits no P11 DDL.

Initial architecture and quality reviews required a mixed nullable-workspace
fixture, explicit preinstall tenant plan defects, and both exact current
lead-local compatibility controls. Those repairs were made. Fresh independent
architecture and quality re-reviews both pass.

## Root validation results

All accepted commands used Node 24.13.1 and npm 11.8.0.

- G-003/G-007P6/G-007P7/G-007P8/G-007P11: 6/6 in 170.23 seconds on a fresh
  uniquely named loopback PostgreSQL 16 database.
- G-002: 2/2 in 8.98 seconds.
- G-004A: 1/1 in 75.34 seconds.
- G-005: 1/1 in 62.30 seconds.
- T-029: 19/19 in 5.99 seconds with 52 discovered, 50 applied, and 2 named
  runtime-only migrations skipped.
- Q-002: 1/1 in 2.80 seconds on an isolated sequential run.
- Focused runtime, workbench, actions, and protected-layout source: 32/32.
- TypeScript and focused ESLint: pass with zero warnings.
- Recovery verifier: all 37 application tables match SQLite/tracked migrations.
- Fedora-portable SQLite coordinator: 12 passed and 26 Windows-native cases
  skipped. Historical Windows 111/111 evidence is unchanged.
- Production build: pass; 11/11 static pages generated.
- `git diff --check` and full JSONL `jq -s` validation: pass.

## Invalid and rejected invocations retained

- The audit bundled `VACUUM` statements, which PostgreSQL rejected atomically;
  each statement was then rerun separately.
- The initial migration harness expected a single-line `pg_get_indexdef`; the
  canonical PostgreSQL 16 multiline form was captured and guarded exactly.
- Two repair runs exposed volatile parallel-worker spill/row details in exact
  analyzed-plan string equality. Compatibility uses stable planned-shape
  equality while retaining analyzed plans, result hashes, and ordered results.
- One superseded full run was intentionally interrupted with exit 130 at the
  architecture-repair boundary and is not evidence.
- A repair launch used a short image name that Podman rejected before creating
  a container; the fully qualified pinned image retry passed.
- Root's first G-003 URL used a database name outside the required harness
  prefix and all five opt-in cases rejected before database work. A fresh
  correctly named database produced the accepted 6/6 result.
- Root's first focused command named two nonexistent paths, so only 23 tests in
  two files ran. It is excluded; the corrected four-file run passed 32/32.

## Cleanup and authority

All hypothetical indexes, disposable databases, containers, listeners, and
task processes were removed. No hosted Supabase, remote migration, production,
staging, customer data, provider API, paid API, credential, deployment, push,
PR, outreach, or other external action occurred. `main` and the handoff tag
remain unchanged. Parent G-007 remains open. After the attributable local
commit and lock release, the next safe action is a read-only G-007P12 audit of
the `idx_outreach_events_actor_created` family; no migration is assumed.
