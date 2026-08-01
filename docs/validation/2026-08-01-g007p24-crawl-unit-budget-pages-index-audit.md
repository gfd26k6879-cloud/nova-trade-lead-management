# G-007P24 crawl-unit budget-pages index audit

Date: 2026-08-01

Baseline: `f1fcb5b83895453b034ecc0beb21a24d3774da6b`

Branch: `codex/nova-multitenant-integration`

Status: retain exact current aggregate owner; no migration

Receipt commit: `290c7aee65d16397c896f91eb044e2687fa456b0`

## Scope and current owner

G-007P24 audits exactly
`idx_crawl_units_budget_pages(crawl_run_id, status, pages_fetched, max_pages)`.

`getCrawlRunRemainingSearchCalls` filters a globally unique current run and a
mode-specific status set, then sums positive `max_pages - pages_fetched`.
`open` and `open_or_failed` are current resume/retry action paths; `failed` is a
supported helper control. This is compatibility remaining-search-call
estimation before safety checks, not the future G-021 tenant cost/reservation
ledger.

Current run-ID-only behavior is valid performance/result evidence because run
IDs are globally unique and accepted constraints bind children to one run. It
is not tenant authorization. G-013 still owns the exact tenant/workspace query
contract; tenant controls below are measurements only.

## PostgreSQL 16 catalog and fixture

A fresh tmpfs-backed loopback PostgreSQL 16.14 database replayed 54 migrations,
applied 52 portable migrations, and skipped the same two runtime-only files.
The disposable database was `g007p24_budget_a1` on `127.0.0.1:45355`.

The fixture contained 120,000 physically interleaved units across two tenants
and eight globally unique runs, 15,000 units per run. Four runs had exact
workspaces and four had null workspaces, splitting rows 60,000/60,000. Each of
the six statuses had 20,000 rows globally and 2,500 per run. `max_pages` values
1/2/3 occurred 40,032/39,984/39,984 times; below/equal/above-cap page states
occurred 40,032/40,032/39,936 times. One deliberate 834-row other-tenant update
made its scalar distinguishable. Tenant/workspace inheritance mismatches were
zero.

The target was a healthy valid/ready/live ordinary nonunique btree, 1,204,224
bytes, with exact definition SHA-256
`281386ebfe6458239d055466fe5ab1d6b649b7f13d166771f0ab1232183a2cf5`.
The accepted P4 run, run-status, retry-ready, and tenant-run-status controls
remained healthy and unchanged. Both the retained single-column run FK and the
G-002 compound tenant/run FK were validated. The final table had 12 indexes,
zero unhealthy indexes, and no `idx_g007p24%` residue.

## Scalar truth and natural plans

Seven ordinary runs returned open 2,502, failed 834, and open-or-failed 3,336.
The deliberately changed other-tenant run returned 1,668/834/2,502. The sorted
24-row scalar payload was 615 bytes with SHA-256
`5a5acb5f3727d0708689c5a9753973d18d3841dc595da829d90c7b8e691da282`.
Correct tenant/workspace and null-workspace controls returned 2,502; wrong
tenant and wrong workspace returned zero. A known other-tenant run ID returned
that run's distinct scalar as current compatibility behavior, not authorization.

After `VACUUM (ANALYZE, FREEZE)`, every exact current mode naturally selected
the target without planner forcing:

| Mode | Plan | Rows | Heap fetches | Shared hits | Time | Scalar |
|---|---|---:|---:|---:|---:|---:|
| open | index-only scan | 7,500 | 0 | 16 | 0.995 ms | 2,502 |
| failed control | index-only scan | 2,500 | 0 | 5 | 0.342 ms | 834 |
| open-or-failed | index-only scan | 10,000 | 0 | 20 | 1.128 ms | 3,336 |

Unapproved tenant/workspace controls used existing tenant/P4 indexes and heap
plans: tenant+run 2,756 hits/7.883 ms; tenant+workspace+run 2,766 hits/6.954 ms;
tenant+null-workspace+run 2,757 hits/8.907 ms. Those measurements may inform
G-013 but do not prove an approved-query defect and authorize no candidate.

## Transactional drop comparison

Inside one explicit transaction, only the target was dropped. All 24 scalar
results and the scalar digest remained exact. Natural fallback plans used the
accepted P4 run-status index plus heap reads:

| Mode | Fallback | Shared hits | Exact heap blocks | Time |
|---|---|---:|---:|---:|
| open | bitmap index + heap | 2,747 | 2,738 | 3.137 ms |
| failed control | bitmap index + heap | 2,503 | 2,500 | 2.033 ms |
| open-or-failed | bitmap index + heap | 2,750 | 2,738 | 4.061 ms |

Explicit `ROLLBACK` restored the target valid/ready/live with the identical
definition SHA, scalar digest, and index-only plan. The restored open plan used
zero heap fetches, 13 hits, and 0.893 ms. Final statistics corroborated use but
were not the primary evidence: target 43 scans/432,500 tuples read/0 fetched;
run-status 22/172,500/0; tenant-run-status and tenant-workspace-market-status
3/45,000/0 each.

## Disposition, validation, and cleanup

The target is retained as the exact current three-mode aggregate owner. Its
index-only plans materially avoid the heap work observed during transactional
removal. There is no current plan defect, and result correctness never changed.
No candidate, migration, test edit, or removal packet is justified. Future
tenant/workspace redesign remains deferred to an exact G-013/G-021 contract;
P4 control dispositions remain unchanged.

Root separately passed the current behavior baseline under Node 24.13.1 and npm
11.8.0: `crawl-actions.test.ts`, `worker.integration.test.ts`, and
`discovery-sizing.test.ts`, 60/60. The audit agent inspected host defaults only,
then verified the required mise versions; no validation ran under host defaults.

Counts remain 54/52/2 and sequence `202607310010` stays free. The crosswalk
becomes 33 classified and 29 unclassified, with G-002 at 8/5. No downstream
card unlocks and the next residual family remains separately unopened.

Explicit rollback and psql close completed before the tmpfs container was
stopped and auto-removed. No container, listener on 45355, PostgreSQL/psql
process, candidate, temporary artifact, extra worktree, or lock remains. Main
and the handoff tag remain unchanged. No hosted, provider, remote migration,
production, deployment, push, pull request, outreach, credential, or other
external action occurred.
