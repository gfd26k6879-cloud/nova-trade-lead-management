# G-007P3 tenant-prefixed lead AI queue indexes

Date: 2026-07-31

Baseline: `d4a1a538e1d6f381954393e28036aeb857b2df6f`

Branch: `codex/nova-multitenant-integration`

Status: locally implemented, validated, and committed

Source commit: `5a16a2602cb02e36b61e5c8dc2881902d80a7816`

## Scope and finding

G-007P3 is the third bounded Postgres-only child of G-007. It changes only the
`leads` AI verification queue index family and removes four obsolete runtime
Postgres repair statements that would otherwise recreate global indexes already
retired by G-007P1, G-007P2, or this packet. Serialized migrations remain the
sole owner of those index families. Application query APIs, SQLite production
behavior, RLS, grants, data, and remote databases are unchanged.

The read-only PostgreSQL 16.14 audit covered all 121 indexes on the 16
G-002-through-G-005 tenant-owned tables. On 80,000 representative `leads` rows
split evenly across two tenants, the tenant-scoped ready query used a global
queue index, scanned 8,000 candidates, and removed 4,000 wrong-tenant rows. The
stale-running query also scanned 8,000 global candidates. The bounded
tenant-first comparison scanned only the 4,000 target-tenant candidates for
each shape and removed the tenant post-filter.

Migration `202607310003_tenant_prefix_lead_ai_queue_indexes.sql` replaces only
`idx_leads_ai_queue_ready` and `idx_leads_ai_queue_status` with exact
tenant-first ready and status indexes. It requires the accepted G-003 tenant
column and a healthy backing index for `UNIQUE (tenant_id, id)`. Exact final
replay is a no-op; missing, partial, same-name non-index, spoofed-definition, or
unhealthy foundation catalogs raise `G007P3_INDEX_CATALOG_DRIFT` before DDL.

## Review and repair history

The first draft was rejected before acceptance. Architecture found an empty,
forced plan regression, incomplete G-003 backing-index health verification,
and missing adversarial states. Quality found that the supported runtime
Postgres repair path could recreate four global indexes removed by accepted
G-007 packets. The repaired packet:

- uses natural `EXPLAIN ANALYZE` over the same 80,000-row two-tenant population;
- verifies exact unique-constraint backing-index health;
- snapshots protected relation kinds and covers ready/status/non-index spoofs;
- removes exactly four conflicting runtime index creations without synthesizing
  partial final catalogs; and
- exercises both mocked and real full-chain runtime repair.

Fresh architecture and quality re-reviews returned PASS. Two final quality-only
harness omissions—status-index runtime assertions and inherited environment
restoration—were repaired and rechecked PASS.

## PostgreSQL 16 evidence

Fedora, Node 24.13.1, npm 11.8.0, pinned PostgreSQL 16.14:

- G-002: 2/2 passed in 11.50 seconds on a fresh unique loopback database.
- G-003/G-007P3: 2/2 passed in 76.63 seconds on a separate fresh unique
  loopback database. The natural plans prove global baseline tenant filtering,
  nonzero wrong-tenant removals, intended tenant-index selection afterward,
  and no tenant post-filter.
- G-004A: 1/1 passed in 110.45 seconds.
- G-005: 1/1 passed in 86.48 seconds.
- T-029: 19/19 passed in 6.22 seconds; 48 migrations discovered, 46 applied,
  and the same 2 Supabase-runtime-only migrations skipped.
- Q-002 full-chain tenant fixtures: 1/1 passed in 3.31 seconds. Its stale
  42/40/2 inventory assertion is corrected to 48/46/2.

The original audit measured the ready plan at 14.202 ms and 4,545 buffers
before the tenant index versus 5.689 ms and 2,519 buffers afterward. The
stale-running plan measured 4.340 ms and 4,055 buffers before versus 1.791 ms
and 2,032 buffers afterward. Timing is evidence, not a brittle test threshold.

## Fedora and application gates

- TypeScript passed.
- Focused ESLint over the changed source and tests passed with zero warnings.
- Runtime-repair unit tests passed 2/2.
- Recovery verification passed for 37 application tables.
- Portable SQLite coordinator passed 12 cases and skipped 26 Windows-native
  cases; historical Windows 111/111 acceptance is unchanged.
- Next.js 16.2.6 production build passed; 11/11 static pages generated.
- `git diff --check` and JSONL validation passed.

Invalid and rejected invocations are retained truthfully. One repaired G-003
run omitted the disposable server's non-TLS adapter setting and stopped with
`ECONNRESET`; a fresh run used the explicit test-only `DATABASE_SSL=disable`.
Two undersized plan fixtures naturally selected the unrelated global
`idx_leads_enrichment_lease`; neither was counted as queue-index evidence. The
final fixture reproduces the original audited 80,000-row distribution. Root's
first parallel launcher also failed in JavaScript before creating any process
or container because it interpolated a shell variable; the corrected launcher
then passed both fresh database lanes.

## Disposition

G-007P3 is accepted as a child milestone. Parent G-007 remains open. The next evidence-only audit
candidate is one separately bounded G-007P4 family; no migration is justified
without another real tenant-query plan defect. G-006 remains paused on its
Windows-native boundary, G-006C2B is unopened, and G-008/G-009/G-004B remain
dependency-blocked.

No push, pull request, deployment, hosted Supabase access, remote migration,
production or customer-data access, provider call, credential change, or
external communication occurred.
