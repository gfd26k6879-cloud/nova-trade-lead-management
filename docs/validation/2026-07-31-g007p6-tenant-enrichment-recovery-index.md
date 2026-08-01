# G-007P6 tenant enrichment recovery index validation

Date: 2026-07-31

Baseline: `3cc1d200387b80d3e4291a76d20439933e2a7098`

Branch: `codex/nova-multitenant-integration`

Status: accepted locally; source commit pending

## Scope and decision

G-007P6 is one PostgreSQL-only additive index packet for the tenant-scoped
future forms of two current enrichment recovery mutations:

- stale `running` rows below the attempt ceiling return to `pending`; and
- due `retry_wait` rows below the attempt ceiling return to `pending`.

The installed index is:

```sql
CREATE INDEX idx_g007p6_leads_tenant_enrichment_recovery
  ON public.leads (tenant_id, enrichment_status, score DESC)
  WHERE enrichment_status IN ('running', 'retry_wait');
```

The partial status set excludes pending-ready G-007P5 work and the mixed-status
exhausted terminalization sweep. `score DESC` preserves the retained legacy
status/score shape without changing recovery eligibility. No application query,
runtime repair source, SQLite schema, worker, route, fairness, lease, provider,
or external behavior changed. Both existing global PostgreSQL enrichment
indexes remain installed for current unscoped compatibility.

## PostgreSQL 16.14 plan evidence

The audit applied the complete 48/46/2 pre-P6 migration chain and seeded
100,000 physically interleaved leads, 50,000 per tenant, with stale/fresh/
exhausted running rows, due/future/exhausted retry rows, pending rows, and
terminal noise.

Baseline tenant-scoped stale and due paths each considered 35,000 global status
rows, including 17,500 from the wrong tenant. The accepted 3,736 KiB partial
candidate reduced each path to the target tenant's 17,500 status rows and zero
wrong-tenant candidates. Natural final selectors and exact rolled-back UPDATE
plans use the new index with tenant/status in `Index Cond` and no residual
tenant filter. Each mutation affects the same 7,500-row ID set before and after
DDL.

Two alternatives were rejected before implementation. A 640 KiB minimal
tenant/status partial index was captured through skip-scan by current unscoped
stale and due updates. A 5,288 KiB full-table tenant/status/score index preserved
compatibility but maintained unnecessary states. The accepted two-status
partial index is about 29% smaller than the full candidate.

With the accepted candidate installed, paired natural planned EXPLAINs prove
that exact current unscoped stale, due, exhausted, ready-list, and ready-lease
paths retain their pre-install ownership and never select P6. The current ready
list and lease remain on `idx_leads_enrichment_lease`. Exhausted terminalization
remains naturally sequential and is not claimed as a P6 index path.

## Catalog and replay evidence

The migration fails closed unless the common foundation has exact recovery
column types/nullability, the validated enrichment status constraint, and the
validated `UNIQUE (tenant_id,id)` constraint with a unique, valid, ready, live
backing index. Initial installation additionally requires both retained global
indexes to have exact PostgreSQL 16 definitions and health, no deferred P5
candidate, and no literal-prefix P6 relation.

Final replay accepts only one exact P6 relation with its canonical definition
and valid/ready/live health. Once that final exists, replay is intentionally
forward-compatible with a later authorized removal of globals or installation
of P5. Missing, order/direction/predicate/status-set spoofed, unhealthy,
same-name non-index, and true reserved-sibling states reject before DDL.
Column, status-constraint, retained-global, and G-003 backing-index drift also
reject. A wildcard-lookalike name is correctly outside the literal protected
prefix. Transactional rollback restores the exact baseline with no partial
installation. Live `ensureDbReady` preserves the complete final P6 catalog;
the unit harness also proves runtime repair emits no P6 DDL.

## Review and repair history

Independent architecture and quality reviews initially disagreed over candidate
breadth. Fresh natural plans selected the exact two-status partial definition.
Both reviews then passed the packet boundary.

The first completed draft received architecture PASS and quality REPAIR. The
quality review required literal rather than wildcard prefix matching and a live
runtime-repair catalog snapshot. Both were repaired. A later harness correction
replaced brittle executed unscoped Seq Scan assertions with paired, non-mutating
baseline/final ownership plans while retaining real `EXPLAIN ANALYZE` for the
scoped selectors and UPDATEs. Final architecture and quality re-reviews pass.

## Validation results

All accepted commands used Node 24.13.1 and npm 11.8.0.

- G-003/G-007P6: 3/3 in 103.34 seconds on a fresh root PostgreSQL 16 database.
- G-002: 2/2 in 14.34 seconds.
- G-004A: 1/1 in 108.37 seconds.
- G-005: 1/1 in 108.31 seconds.
- T-029: 19/19 in 8.04 seconds with 49 discovered, 47 applied, and 2 named
  runtime-only migrations skipped.
- Q-002: 1/1 in 2.87 seconds on the accepted isolated rerun.
- Runtime ownership unit: 2/2.
- TypeScript and focused ESLint: pass with zero warnings.
- Recovery verifier: all 37 application tables match SQLite/tracked migrations.
- Fedora-portable SQLite coordinator: 12 passed and 26 Windows-native cases
  skipped. The historical Windows 111/111 evidence is unchanged.
- Production build: pass; 11/11 static pages generated.
- `git diff --check` and full JSONL `jq -s` validation: pass.

## Invalid or rejected invocations retained

- The first implementer PostgreSQL fixture grouped statuses physically. Its
  compatibility assertion expected a Seq Scan but PostgreSQL selected the
  retained global bitmap index; P6 was not selected. The database/container on
  port 55481 was discarded.
- A repaired run on port 55483 exposed dead-tuple/autovacuum sensitivity in the
  same executed Seq Scan assertion. P6 remained absent. The assertion design
  was rejected and the fresh database/container removed.
- A port-55484 container was started but discarded unused when the deterministic
  planned-EXPLAIN design superseded it.
- Root's first PostgreSQL setup used missing Fedora host `pg_isready`/`psql`;
  only the disposable container started and no database was created. Readiness
  and database creation were rerun correctly inside the container.
- The first root Q-002 invocation ran concurrently with T-029. Its test body
  passed, but `afterAll` cleanup exceeded 10 seconds; it is not acceptance
  evidence. The isolated fresh rerun passed and cleaned up.

## Cleanup and authority

All hypothetical indexes, disposable databases, containers, listeners, and
task processes were removed. No hosted Supabase, remote migration, production,
staging, customer data, provider API, paid API, credential, deployment, push,
PR, outreach, or other external action occurred. `main` and the handoff tag
remain unchanged. Parent G-007 remains open; G-007P5 stays deferred and the
next safe action after commit/lock release is a new read-only G-007P7 audit.
