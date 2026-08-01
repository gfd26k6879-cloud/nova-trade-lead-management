# G-007P29 archived-active lead-index audit

Date: 2026-08-01

Baseline: `90a840b75640c38224db5cc98b98e695520b26c5`

Status: accepted RETAIN/DEFER; no migration

## Decision

On fresh PostgreSQL 16.14 after the accepted 54/52/2 portable migration
chain, `idx_leads_archived_active(archived_at, updated_at DESC)` was healthy as
an ordinary, non-constraint index. It was selected by none of the exact current,
future-tenant measurement, or approved control plans. Dropping only the target
inside a transaction changed no canonical result, structural plan fingerprint,
or measured buffer count; explicit rollback restored the exact catalog.

G-007P29 therefore accepts RETAIN/DEFER for the healthy historical PostgreSQL
catalog definition plus the frozen SQLite compatibility definition only. The
target has no exact primary plan owner or demonstrated
necessity. This audit authorizes no removal, replacement, candidate, migration,
or test edit.

The future tenant analog still shows the score-recompute defect accepted by
G-007P10, but that evidence is target-neutral and measurement-only. P29 neither
reopens nor supersedes P10. Its complete deferred cutover obligation remains
G-009/G-011/G-012/G-014/G-019/G-020, with G-017/G-018 governing ordinary
dashboard projections. Leads remain tenant-wide with no workspace authority;
archive state is a selector only.

## Source and catalog

The target originates at
`supabase/migrations/20260602061959_add_lead_archive_fields.sql:5-6`, origin
commit `fe07602ccfb47f529c8aeb62e249217c8fb1828d`, file SHA-256
`20a2f1d51d6048138d86176681ace800315d736d5ec64aba534d9596c9c4f572`.
SQLite mirrors the definition at `src/lib/db/schema.ts:2079`; P29 did not run a
new SQLite health or plan audit.

The live PostgreSQL definition was:

```sql
CREATE INDEX idx_leads_archived_active
ON public.leads USING btree (archived_at, updated_at DESC)
```

Its definition SHA-256 was
`63535088f7ddc0389ad48ed1568cd047b0fc6c588f8b477b98e0ad2097c11d8e`.
The 9,142,272-byte target had `text_ops` and `timestamptz_ops`, index options
`0 3`, two key and two total attributes, no predicate, expression, or INCLUDE,
and zero constraint owners. It was nonunique, nonprimary, nonexclusion,
immediate, valid, ready, live, and not replica identity.

Installed/drop/rollback led to 38/37/38 lead indexes and invariant 10/10/10
lead constraints. The installed/restored complete index-catalog digest was
`09e1093c5386697f1d54f4c4cd587722ecdb82eae49fed63add06b119636d157`;
the target-absent digest was
`896553a52e9b156ee29e15e083d9e2676075ec30a93db7c61561f729216616d3`;
the invariant constraint digest was
`b03a23d8afd10e430be3316bedc3a6294b973e116b4a065a89c337c1b1fdb753`.
All 38 restored lead indexes were healthy. Final corroborative statistics showed
zero target scans, tuples read, or tuples fetched.

## Fixture and query contract

The deterministic fixture contained 153,600 physically interleaved leads:
two tenants, two archive states, three score-staleness states, two exclusion
states, four updated-time bands, four quality buckets, and 400 rows per one of
384 exact factorial cells. Leads had no workspace dimension.

Each tenant contained 76,800 rows. Active and archived populations were 76,800
each; null-score, stale-score, and fresh-score populations were 51,200 each;
excluded and nonexcluded populations were 76,800 each. The exact current
active stale-or-null set was 51,200 and the tenant-A analog was 25,600.

The exact SQLite predicate remained:

```sql
archived_at IS NULL
AND (
  last_quality_scored_at IS NULL
  OR julianday(updated_at) > julianday(last_quality_scored_at)
)
ORDER BY updated_at DESC
LIMIT ?
```

The adapter emits `timestamptz` casts on both operands: live PostgreSQL compares native
`timestamptz` `updated_at` with text `last_quality_scored_at` cast to
`timestamptz`, and orders the native timestamp key. Fixed valid UTC text is
relevant to the SQLite compatibility form and stored last-score values, not to
PostgreSQL's ordering-key type. Limits 1, 100, and 500 had unique boundaries.
Limit 100000 returned the complete eligible population. A separate complete
96-row timestamp tie crossed every non-time fixture dimension at one fixed time
band and replica; all 32 eligible members were compared canonically, so no
nondeterministic partial tie was treated as an ordered result.

Ordinary score text used fixed UTC six-microsecond ISO form. Null-score rows
were admitted by the first OR branch. Stale text was exactly one day before
`updated_at` and was admitted after the cast; fresh text was exactly one day
after and was excluded. Equal text would be excluded by `>` and included by the
fresh `<=` source predicate, but equal ordinary rows were not separately seeded,
so this is source semantics rather than live-fixture evidence. Archived rows
used valid UTC archive text and were excluded regardless of score state. Invalid
timestamp text was not tested and no behavior is claimed.

Unique boundaries were current ranks 1/100/500 at
`2026-04-01 00:00:00.0384+00`, `2026-04-01 00:00:00.038141+00`, and
`2026-04-01 00:00:00.036904+00`; tenant-A ranks were
`2026-04-01 00:00:00.0384+00`, `2026-04-01 00:00:00.037782+00`, and
`2026-04-01 00:00:00.035469+00`. Each boundary group had one row. No rank
100000 boundary exists because both forms are nonbinding complete-set queries.
The complete tie at `2025-01-01T00:00:00.000Z` contained 96 rows and 32 global
eligible rows across both tenants, both archive states, all three score states,
both exclusion states, and all four quality states; it was wholly included.

Limit 1 is an audit of the function's
`Math.max(1, Math.min(100000, Math.floor(limit)))` clamp. The worker route
applies `Number(env)`, requires `Number.isFinite(value) && value > 0`, returns
`Math.min(Math.floor(value), 500)`, and otherwise defaults to 100. The action
invokes `recomputeAllLeadQualityScores()` without an argument, selecting the
function's 100000 default and maximum. Exact source search found no current UI
caller for that action.

## Natural plans

Metrics are medians of three warm natural runs with default planner settings.
Installed, dropped, and restored phases retained the same owner, node structure,
buffers, rows removed, and structural fingerprint for every audited shape.

| Shape | Rows | Owner | Hits I/D/R | Raw EXPLAIN rows removed I/D/R | Result SHA-256 | Structural SHA-256 I/D/R |
|---|---:|---|---|---|---|---|
| current 1 | 1 | stale sibling | 4/4/4 | 0/0/0 | `7a4304bf915b40835f7b9b1bce1f3c4b7fe20703f42d16426da6c257ab1d5164` | `5d3c762f7e6f1baa5c9250641f6eb50354a189e9d24847c6aa1d54624f23648d` |
| tenant 1 | 1 | stale sibling | 4/4/4 | 0/0/0 | `7a4304bf915b40835f7b9b1bce1f3c4b7fe20703f42d16426da6c257ab1d5164` | `b2bbee05507c0c9daed8b329e73bc43cad66b016adf21a5bf7d54ad2d0e96ba3` |
| current 100 | 100 | stale sibling | 264/264/264 | 160/160/160 | `4b4113ac1b9673566e9136ffb7b9cdfe1962070433e95400df2ea3632c6553de` | `5d3c762f7e6f1baa5c9250641f6eb50354a189e9d24847c6aa1d54624f23648d` |
| tenant 100 | 100 | stale sibling | 625/625/625 | 519/519/519 | `da2398459a93ed1a3a62e2cb1e7cbe6b073945435c7df9c426ad12514dd82913` | `b2bbee05507c0c9daed8b329e73bc43cad66b016adf21a5bf7d54ad2d0e96ba3` |
| current 500 | 500 | stale sibling | 1510/1510/1510 | 997/997/997 | `3dd7ee0ecc151a0487a99056e503faa421f764afe955bb75b45913dcdaba470e` | `5d3c762f7e6f1baa5c9250641f6eb50354a189e9d24847c6aa1d54624f23648d` |
| tenant 500 | 500 | stale sibling | 2955/2955/2955 | 2432/2432/2432 | `164896cd537d7018d05c6dbd7e9a999c69e342eeeb350b6155e7b35ec2043943` | `b2bbee05507c0c9daed8b329e73bc43cad66b016adf21a5bf7d54ad2d0e96ba3` |
| current 100000 | 51,200 | seq + sort | 9555/9555/9555 | 102400/102400/102400 | `017f4ee8ea1578da1a91332a95d0d8832146bfe3dc627d85a64af3737125d9e3` | `d30e2ec3eb7a9f93ef21c705761748beae7c2c9c803949dda52b3c6adb93c814` |
| tenant 100000 | 25,600 | `idx_g007p8_leads_tenant_discovered_at` bitmap + sort | 9617/9617/9617 | 51200/51200/51200 | `585df3099b34053ec7a19acb64f52a95f81f6033239fa20786d9d5cf98f2f0fc` | `6da0cc946e5107127d723e71ac58625128f1ac6a1400fca8ed319326a3beafea` |
| stale/fresh aggregate | 1 | seq | 9555/9555/9555 | 0/0/0 | `18d1216fd01df56e436291c8b81e6a9796b598321dab4e83a53c4908dfb916c3` | `efa4e36b1840a493a34d28e4bef4c0a67a7b9d8ab388f0db490efc11a577dd45` |
| active aggregate | 1 | `idx_leads_active_discovered_at` | 254/254/254 | 0/0/0 | `9b39f67c16a05b0514654e42bfa8650a3c3eb07a030fde8d81129c79d18e6bce` | `17254f6bcefce830769e808ecd61cc3c6f958649dbe73bf053101ca3d22ad973` |
| quality breakdown | 4 | seq/group | 9571/9571/9571 | 25600/25600/25600¹ | `a8b82a33751a5dcc1d26af4e4388b5fc3e6ef7bb088990a5aa6c5fcceebdc1b4` | `db28b7b5b98fd0a3b247f40b1c92ab1f4af4afa3c11a05a961bc7ec20bb3536f` |
| active list 100 | 100 | `idx_leads_enrichment_lease` + sort | 38660/38660/38660 | 0/0/0 | `6033183694c377923544233a6eb53be06734c7f8e9e9ba2f2ee8059a6519eef5` | `6058d10f2f5805a4097f9bbb2531b5d0285f7b20b41f6be8ecb8ce8543bc8dff` |
| archived list 100 | 100 | `idx_leads_score` | 386/386/386 | 282/282/282 | `0cfe8761ae10d9b554ed68e2b27aa9f227d0b2b95fc9aef81aebe3b8af106b73` | `eeea7cf5a52d36eae92c17dba88eb65da92118a4811b58f1769498b33d472e05` |
| all-mode list 100 | 100 | `idx_leads_score` | 199/199/199 | 96/96/96 | `07b993d70aa448849974ce2b665c57f546abde3a2dbc0c4de610f0284f41ef1c` | `7d4c3b986cde266731011fecf1d7129d69f31d630f75848f143a381ca754f531` |
| tenant active list 100 | 100 | `idx_leads_enrichment_lease` + sort | 38660/38660/38660 | 19200/19200/19200 | `265efa7ceecf120644e8e97da5d76c9e1f30c414e008489a84e2346b718ce7c4` | `e28052c4144618ef2353bfbc69689bf1f62ec53c4b62e7a249157f9f8d8ea9ec` |

“Stale sibling” denotes `idx_leads_score_recompute_stale`; every owner and
structural digest in the table is identical installed/drop/rollback. Result
digests are canonical full-row SHA-256 values. Raw ANALYZE telemetry was retained
separately from fingerprints. Reads were zero in every phase.

¹ The quality plan was Aggregate/Gather Merge/Sort/Aggregate/parallel Seq Scan.
The raw JSON reports 25,600 rows removed per scan loop/worker average; the
fixture's three loops remove 76,800 archived rows in total.

To return tenant A's first 100 rows, the ordered stale sibling examined 619:
329 other-tenant rows, including 118 otherwise eligible rows, plus 190
same-tenant nonqualifiers. At limit 500 it examined 2,932: 1,454 other-tenant
rows, including 513 otherwise eligible rows, plus 978 same-tenant nonqualifiers.
Tenant/current buffer ratios were 2.37 at limit 100 and 1.96 at limit 500.
The predeclared materiality threshold required at least 2x at both operational
limits; limit 500 did not meet it. More importantly, target removal was neutral
and the tenant form is not yet an authoritative query contract.

All 15 canonical results and all 15 structural plan fingerprints were identical
installed/drop/rollback. Target absence changed no audited plan or buffer count.

## Root validation

Root independently passed:

- focused lead exclusion, scheduler, worker, route, ownership, and detail
  behavior: 82/82;
- TypeScript and corrected focused ESLint;
- recovery verification over 37 application tables;
- Fedora-portable SQLite coordinator: 12 passed, 26 native-Windows skipped;
- production build: 11/11 pages;
- fresh PostgreSQL G-002: 2/2;
- fresh PostgreSQL G-003: 6/6;
- fresh PostgreSQL T-029: 19/19;
- full-ledger JSON parsing and `git diff --check`.

The first ESLint command used two wrong test paths under `src/lib/__tests__`
instead of `src/app/__tests__` and failed before linting. The omitted 19 tests
and corrected ESLint paths then passed. No Windows-only durability suite ran on
Fedora, and historical Windows 111/111 evidence remains unchanged.

## Reviews, arithmetic, and cleanup

Independent test/evidence and architecture/authority reviews report no remaining
P0/P1/P2 finding. The architecture review requires the full P10 cutover owner
set above and forbids representing this PostgreSQL-only audit as fresh SQLite
validation; both constraints are preserved here.

The crosswalk becomes 39 classified and 23 unclassified; G-003 becomes 16/23.
Migration inventory remains 54 discovered, 52 applied, and two runtime-only
skipped. Sequence `202607310010` remains free. Parent G-007 remains open.

The primary audit completed without SQL, fixture, catalog, EXPLAIN, result, or
rollback failure. Its first successful full output exceeded the display budget;
a compact rerun of the same installed/drop/rollback matrix reproduced equality.
Host Node/npm initially reported 24.18.0/11.16.0; every repository Node command
used verified Node 24.13.1/npm 11.8.0 through mise.

All P29 audit and root-gate containers, databases, ports, scripts, processes,
and temporary artifacts are removed. The immediate first check of the audit's
rootless listener observed transient teardown; a bounded retry confirmed port
34695 closed. No candidate, migration, lock, extra worktree, remote, hosted,
provider, deployment, push, PR, credential, or external activity occurred.
