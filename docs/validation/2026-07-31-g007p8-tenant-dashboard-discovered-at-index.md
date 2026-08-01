# G-007P8 tenant dashboard discovered-at index validation

Date: 2026-07-31

Baseline: `ab5a23777e6542a48e9bba27c9635150db7927c7`

Branch: `codex/nova-multitenant-integration`

Status: accepted locally, source commit pending

## Scope and decision

G-007P8 is one PostgreSQL-only additive index packet for the future
tenant-scoped form of the dashboard today count. The current contract derives a
UTC date string with `new Date().toISOString().slice(0, 10)` and counts every
lead at or after that boundary, including archived and excluded rows.

The installed index is:

```sql
CREATE INDEX idx_g007p8_leads_tenant_discovered_at
  ON public.leads (tenant_id, discovered_at);
```

Both global dashboard indexes remain installed. No query, caller, UTC boundary,
archive/exclusion semantics, workspace model, permission, runtime repair source,
SQLite schema, active-statistics family, provider, or external behavior changed.

## PostgreSQL 16.14 plan evidence

The audit applied the complete 50/48/2 pre-P8 chain and seeded 200,000
physically interleaved leads, 100,000 per tenant. Each tenant had 10,000 today
rows and 90,000 older rows; the fixture included exact midnight, archived,
excluded, and archived-plus-excluded today cases under `Etc/UTC`.

The future tenant-scoped baseline used `idx_leads_discovered_at`, considered
20,000 today rows, removed 10,000 wrong-tenant rows through a residual filter,
read 2,079 buffers, and completed in 5.192 ms. The accepted 7,960 KiB candidate
reduced the same count to 53 buffers and 0.643 ms, with tenant and discovered
time in `Index Cond`, no filter, and the same 10,000 result.

The exact current unscoped today count retains `idx_leads_discovered_at`, does
not select P8, returns the same 20,000 result, and reads 80 buffers before and
after installation. The adjacent all-leads count also retains its exact planned
shape and 200,000 result. The separate active-discovered global and P9 family
are not claimed.

## Catalog, replay, and runtime evidence

The migration fails closed unless `tenant_id` is non-null UUID,
`discovered_at` is non-null timestamptz, and the exact validated G-003
`UNIQUE (tenant_id,id)` constraint has a unique, valid, ready, live backing
index. Initial installation additionally requires no literal-prefix P8 object
and exact healthy `idx_leads_discovered_at`.

Final replay accepts exactly one healthy index with canonical key order and
definition. Missing, order, direction, predicate, extra-key, same-name
non-index, unhealthy, and reserved-sibling states reject without catalog
change. Foundation and retained-global drift also reject. A wildcard lookalike
does not collide with the literal prefix, and transactional rollback restores
the exact baseline. Once installed, replay tolerates later authorized removal
of both dashboard globals and unrelated P5/P9 evolution while preserving P6
and P7.

Live `ensureDbReady` preserves the complete P8 catalog, and the unit harness
proves runtime repair emits no P8 DDL. Independent architecture and quality
reviews both passed without repair.

## Root validation results

All accepted commands used Node 24.13.1 and npm 11.8.0.

- G-003/G-007P6/G-007P7/G-007P8: 5/5 in 133.82 seconds on a fresh root
  PostgreSQL 16 database; P6 took 23.077 seconds, P7 16.062 seconds, P8
  23.891 seconds, and upstream G-003 70.585 seconds.
- G-002: 2/2 in 14.51 seconds.
- G-004A: 1/1 in 82.68 seconds on the accepted isolated rerun.
- G-005: 1/1 in 83.20 seconds.
- T-029: 19/19 in 5.99 seconds with 51 discovered, 49 applied, and 2 named
  runtime-only migrations skipped.
- Q-002: 1/1 in 11.12 seconds on an isolated sequential run.
- Focused runtime ownership and crawl actions: 23/23.
- TypeScript and focused ESLint: pass with zero warnings.
- Recovery verifier: all 37 application tables match SQLite/tracked migrations.
- Fedora-portable SQLite coordinator: 12 passed and 26 Windows-native cases
  skipped. Historical Windows 111/111 evidence is unchanged.
- Production build: pass; 11/11 static pages generated.
- `git diff --check` and full JSONL `jq -s` validation: pass.

## Invalid invocations retained

- The read-only audit initially used the pinned local image ID as a registry
  digest; inspection failed without state change and was corrected.
- Its first raw migration loop lacked the required auth/worker bootstrap and
  stopped at an auth schema error. That partial disposable database/container
  was destroyed; all evidence came from a fresh complete replay.
- After valid baseline plans, an invalid `SELECT (EXECUTE ...)` syntax probe
  failed without mutation; the counts were rerun with standalone `EXECUTE`.
- Root's concurrent G-004A run ended with `ECONNRESET` after 21.68 seconds and
  is not acceptance evidence. Its self-owned container cleaned up, and a fresh
  isolated rerun passed.

## Cleanup and authority

All hypothetical indexes, disposable databases, containers, listeners, and
task processes were removed. No hosted Supabase, remote migration, production,
staging, customer data, provider API, paid API, credential, deployment, push,
PR, outreach, or other external action occurred. `main` and the handoff tag
remain unchanged. Parent G-007 remains open, G-007P5 remains deferred, and the
next safe action after local commit and lock release is a read-only post-P8
G-007P9 audit of the active statistics `idx_leads_active_discovered_at` family.
No migration is assumed.
