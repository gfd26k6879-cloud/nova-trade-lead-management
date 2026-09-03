# G-007P21 crawl-run visibility index audit

Date: 2026-08-01

Baseline: `f3be206fa64ba69efd0fd0414dfe9e7f12518506`

Branch: `codex/nova-multitenant-integration`

Status: no tenant-query plan defect proven; retain both global compatibility indexes

Receipt commit: `47ce318a0acf7fd40b41798ee8154915da29bc04`

## Scope and source ownership

G-007P21 audits exactly:

- `idx_crawl_runs_status_created(status, created_at DESC)`; and
- `idx_crawl_runs_created_desc(created_at DESC)`.

The current production queries are global compatibility paths. They select the
newest running/queued run, newest paused run, newest run, and the newest 1-50
discovery runs. The current session and permission boundary supplies no tenant
or workspace visibility contract, and the crawl worker selects a global run
before leasing its unit. The crawl route remains explicitly
`legacy_unscoped`.

G-013 requires future crawl create/list/state/lease/retry/count operations to
be tenant-scoped, but it does not yet fix tenant-only versus tenant/workspace
predicates, null-workspace visibility, status sets, ordering, tie-breaking, or
limits. G-009 must first define the mandatory typed scope helper, and G-020
later owns fair dispatch. Synthetic tenant controls therefore measure the
accepted G-002 foundation; they do not authorize DDL or invent those contracts.

The opening registry phrase that the status-leading index “owns” the processing
and paused queries is corrected by this receipt. It is logical compatibility
filter support, but the representative natural plans selected the created-time
index for both queries. No removal basis is proven for either global index.

## PostgreSQL 16 catalog and fixture

A fresh disposable loopback PostgreSQL 16.14 database replayed 54 migrations,
applied 52 portable migrations, and skipped the same two runtime-only files.
The database was `g007p21_crawl_audit_20260801_a1` in a tmpfs-backed
`postgres:16-alpine` container on `127.0.0.1:45233`.

The fixture contained 280,000 physically interleaved `crawl_runs`, 140,000 per
tenant. Each of the seven valid statuses contained 40,000 global rows and
20,000 rows per tenant. For each tenant/status pair, 10,000 rows had a null
workspace and 10,000 had that tenant's workspace. Unique timestamps ranged
from `2025-01-01T00:00:01Z` through `2025-01-04T05:46:40Z`.

Both target indexes are postgres-owned, healthy valid/ready/live, nonunique,
nonconstraint, predicate-free immediate btrees with no expressions or included
columns:

- `idx_crawl_runs_status_created`: 16,465,920 bytes;
- `idx_crawl_runs_created_desc`: 11,321,344 bytes.

The primary key and accepted `UNIQUE (tenant_id, id)` constraint index remain
separate identifier and referential-integrity concerns. The complete crawl-run
index catalog digest was
`b49acdb0ae5a09c1da6dfcb8d057449a`.

## Natural plans and result evidence

PostgreSQL naturally selected `idx_crawl_runs_created_desc` for every exact
current query. No planner GUC, hint, forced scan, or prepared-plan coercion was
used.

| Query | Owner | Returned / filtered | Shared hits / reads | Time |
|---|---|---:|---:|---:|
| processing, limit 1 | `idx_crawl_runs_created_desc` | 1 / 0 | 4 / 0 | 0.049 ms |
| paused, limit 1 | `idx_crawl_runs_created_desc` | 1 / 5 | 4 / 0 | 0.052 ms |
| latest, limit 1 | `idx_crawl_runs_created_desc` | 1 / 0 | 4 / 0 | 0.039 ms |
| exact history CTE, limit 1 | `idx_crawl_runs_created_desc` | 1 / 0 | 8 / 0 | 0.213 ms |
| exact history CTE, limit 50 | `idx_crawl_runs_created_desc` | 50 / 0 | 6 / 0 | 0.322 ms |

Tenant controls stayed small: processing used four shared hits; paused removed
12 rows with four hits; and tenant history 50 removed 49 rows with six hits.
Tenant/workspace processing used four hits. Tenant/workspace paused used the
accepted G-002
`idx_crawl_runs_tenant_workspace_status_created` with zero filtered rows and
four hits. Tenant/workspace history 50 removed 149 rows with nine hits. No plan
used temporary I/O.

Six transactional candidates covered tenant processing, paused, and created
history in tenant-only and tenant/workspace forms. They totaled 38,158,336
bytes. PostgreSQL ignored every candidate except the workspace-paused form,
which merely replaced the already exact G-002 index at the same four buffers
and changed 0.045 ms to 0.033 ms. That is not material and does not justify a
duplicate or speculative contract.

Baseline and candidate ordered results matched for all 11 checks. Representative
MD5 digests were:

- global history 1: `23489aa97a7b4286ce413d966efbf5b9`;
- global history 12: `7842ee81cb8d47d1e10007a75e72e3cc`;
- global history 50: `61c62b807eb8303a4cff1a081d5254dc`;
- tenant history 50: `280a798795cadc5213161f836884dc74`;
- tenant/workspace history 50: `ed747c363d4eb9d6d76e34b44b7074`.

Current queries lack a secondary tie-break key. The authoritative fixture uses
unique timestamps for strict ordering. Equal-time cohorts are set-equivalent
controls only; G-007P21 does not invent a stable tie-break contract.

## Disposition and validation

No exact current or durably approved tenant query has a material plan defect.
Both global indexes are retained for compatibility, no migration is created,
counts remain 54/52/2, and sequence `202607310010` remains free. A future audit
may revisit tenant-prefixed run selection/history only after G-009/G-013 fixes
the exact visibility query. `idx_crawl_runs_blocked_created` and
`idx_crawl_runs_market_created` remain separate unopened families.

Independent source/dependency and test/acceptance audits agree that G-013 alone
does not authorize DDL and report no P0/P1/P2 issue with this disposition. Root
also passed the current compatibility baseline under Node 24.13.1 and npm
11.8.0: `planner-queries.test.ts` plus `db-postgres-client.test.ts`, 16/16.

All six candidates rolled back and candidate residue is zero. The disposable
container/database, loopback port, and temporary harness files were removed.
One post-stop Docker-shim command substitution was invalid because a Podman
warning contaminated captured output; a direct Podman and socket check then
passed. No task process, extra worktree, listener, or lock remains.

Main and the handoff tag remain unchanged. No hosted Supabase, remote migration,
production, staging, customer data, provider call, deployment, push, pull
request, outreach, credential, or other external action occurred.
