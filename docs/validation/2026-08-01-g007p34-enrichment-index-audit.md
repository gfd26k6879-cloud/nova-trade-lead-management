# G-007P34 enrichment-status/score index audit

Date: 2026-08-01

Source baseline: `1a45da3274359380c29473ca9e6bbb73734fa90e`

Reservation commit: `a0bedf0095aa16c0ac165894c80e720cc9f80fbf`

Status: accepted RETAIN; future tenant analogue deferred; documentation-only;
independent receipt reviews accepted

## Decision

Sol accepts RETAIN for the exact healthy historical PostgreSQL definition and
frozen SQLite compatibility definition of
`idx_leads_enrichment(enrichment_status, score DESC)`. Fresh PostgreSQL 16
evidence proves current global compatibility ownership for the stale-running
enrichment recovery predicate, small pending status/score reads on some data
distributions, and the scheduler status aggregate. Target-only drop preserves
results but can fall back to less suitable accepted siblings.

The partial `idx_leads_enrichment_lease`, accepted G-007P6 tenant recovery
index, and score/order siblings remain distinct. Broad active list, Quality,
map-helper, and CSV paths commonly select the lease or score siblings. The
50,000/100,000 live CSV shapes were target-neutral in both independent
fixtures. Plan ownership is fixture-sensitive and is not universalized.

No measured current reader or worker in this packet is tenant-scoped or
supplies tenant authority. Future tenant-prefixed pending/running forms remain
measurements; the separately accepted G-007P5 deferred-defect audit remains
open for the G-011/G-012/G-014/G-019/G-020 tenant-aware caller and worker
cutover. P34 creates no candidate, migration, replacement, test edit, removal,
or migration-sequence use.

The SQLite logical mirror remains frozen historical compatibility evidence; it
was neither rerun nor reaccepted on Fedora. The exact PostgreSQL disposition is
`retain_healthy_historical_postgres_enrichment_status_score_index_as_current_global_compatibility_owner_for_stale_recovery_and_selected_status_order_reads_with_lease_score_and_P6_siblings_preserved_defer_tenant_forms_no_current_tenant_defect_no_DDL_or_removal`.

## Source, reachability, and authority

- PostgreSQL origin:
  `supabase/migrations/202605110001_full_schema.sql`, origin commit
  `0c80c1e831b0e95e0007fdb5ee0bd1bfce87da6c`, current file SHA-256
  `1bf0c081317077e52cf313a5d59fb4ef68bd7442318e0ff452b3c778c1a84033`.
- The target is an ordinary nonunique, nonprimary, nonexclusion,
  nonconstraint `btree`: two key attributes, `text_ops` then `float8_ops`,
  status ASC/default NULLS LAST and score DESC/NULLS FIRST, with no predicate,
  expression, INCLUDE column, or semantic duplicate. It is valid, ready, and
  live. SQLite mirrors the logical definition in `src/lib/db/schema.ts` as
  frozen compatibility evidence only.
- Current reachable binders include the Leads default list, admin Kanban,
  admin-only CSV, Quality summary/list/candidate/action paths, scheduler
  state/backlog readers, and the global enrichment worker recovery/lease
  mutations. Admin Kanban intentionally includes excluded active rows;
  researchers are redirected out of Kanban. Nonexcluded Kanban and helper
  maxima are controls when no live route owns that exact form.
- The opening reservation overstated Explore/map reachability. `ExploreParams`
  and `buildExploreQueryState` do not parse enrichment, so `/explore` and
  `/api/explore/map` cannot bind this target. Direct Explore/map query-function
  measurements are controls only.
- The live CSV route defaults to active/nonexcluded inventory and cannot pass
  archived/includeExcluded. Its 50,000 default and 100,000 maximum are live
  admin-route boundaries.
- The current `/api/crawl/enrich-next` endpoint uses the deliberately legacy
  compatibility runner and installs no tenant context. Leads carry mandatory
  `tenant_id` but deliberately have no workspace dimension. Enrichment status
  and score are selectors, never tenant or workspace authority. Fixture tenant
  diversity does not establish authorization or a tenant-scoped caller.

## Formal producer audit and rejected first packet

Faraday replayed 54 discovered/52 applied/two runtime-only skipped migrations
on PostgreSQL 16.14 and a corrected 260,013-row, two-tenant, six-state fixture.
It reported exact results across installed/drop/restored and exact restored
structures, plus a 38/37/38 catalog. It directly observed the target owning the
current stale-running recovery bitmap scan; target-drop used the accepted P6
index with exact mutation results. On that fixture the target read 139 index
pages for 20,001 candidates while P6 read 474 for 20,013 candidates. Whole
query timing and write buffers were treated as noncausal.

Independent review rejected this first packet as complete acceptance evidence:
35 executed entries contained only 34 unique names, LIMIT 1000 and an explicit
tie control were absent, and complete per-shape boundaries and hashes were not
retained. That rejection did not reject RETAIN. The bounded evidence below was
submitted for Sol acceptance. Faraday's internally stable catalog projection
was 38/37/38 with I/R SHA-256
`6ed5ff7848805a5db412c28b1a90ba840e87be86d8ac2c65b313e99f56eb5d9a`,
D `bc40153d7c0df1e4472b41ba0d9291b069564fd85e03356b4ab8436ad586cc14`,
and ten-constraint SHA-256
`b03a23d8afd10e430be3316bedc3a6294b973e116b4a065a89c337c1b1fdb753`.
These producer-specific projections are not asserted equal to the remedy
projection.

## Rejected v1 remedy and v2/v3 corrective supplements

Boole produced a separate, fresh PostgreSQL 16.14 evidence-only v1 run with
prepared statements disabled and literal EXPLAIN ANALYZE JSON plans. The full
chain was 54/52/2. Its 220,040 physically interleaved leads included 170,040
pending rows, 168,371 active/nonexcluded pending rows, and 159,954
worker-eligible pending rows. Each of the other five states had 10,000 rows.
Both tenants and at least 17 markets and 37 cells appeared in every state;
archive, exclusion, exhausted-attempt, zero-score, coordinate, time,
assignment, market, cell, and score dimensions were crossed independently.

The retained v1 review artifact was 184,774 bytes, jq-valid, and had SHA-256
`4aec196cdb42718f2d33c81670a731f37d82a687ce420fe05ce7bcb5f5a3b1f0`.
It recorded 24 unique shapes with exact I/D/R result hashes and I/R normalized
structures. Independent review nevertheless rejected v1 alone: its purported
live lease omitted the source `updated_at ASC` tiebreaker, complete structured
tie identities and their ordered digest were not retained, Quality boundaries
omitted parts of their compound sort tuple, cleanup was outside the payload,
and its Kanban row represented a
nonexcluded control rather than live admin Kanban.

Boole then produced a fresh v2 supplement after another 54/52/2 replay. The
70,424-byte jq-valid mode-0600 artifact had SHA-256
`e7509b0cb1c1bddb9926db2459306881bcb9d4828b6380e8f6bc58c28518013e`.
Its 220,012-row fixture included 170,012 pending rows, 168,343
active/nonexcluded pending rows, and 159,926 exact lease-eligible rows. It
recorded six uniquely named shapes, no invalid database/test attempt, and a
structured post-cleanup report. Root read v1 and v2 completely before required
temporary-artifact cleanup.

Architecture rereview then found that v2's two Quality rows used a different
candidate ordering, not the live page order. A third fresh 54/52/2 supplement
captured read-equivalents of the current `getQualityLeads` WHERE and five-key
ORDER at limits 50 and 100. The reduced selector intentionally omits the live
function's projection, LEFT JOIN, and correlated artifact subqueries. Its
33,856-byte,
jq-valid, mode-0600 payload had SHA-256
`47fd6467cdf62e21dbc1d900a9596d1bbfac04d0a46ec3760cfe3791bccf3556`.
The 220,000-row fixture had 170,000 pending and 168,331 active/nonexcluded
pending rows. Both exact-WHERE/order Quality selector read-equivalents matched
36,053 rows, preserved the full five-key boundary tuple, and were lease-owned
I/D/R. V3 had no invalid attempt and recorded cleanup after its container,
database, port, process, and runner removal. V1 worker/Kanban live claims and
v2 Quality live claims are explicitly superseded by the corrected v2/v3
selector shapes below.

Together the evidence covers every reserved boundary. Every retained
controlling bounded shape has
more matches than its limit, exact kth/k+1 full order tuples, and a stable
boundary. Positive boundary scores are unique where required. V2 records a
complete 12-row top-score tie ordered by distinct `updated_at`; its ordered
identity digest is
`84ed930e194f9b55537cb4cd7da59d508d16fd5300f6443e7a0c405509fbdc36`.

All 24 v1, all six v2, and both v3 canonical result digests were exact
installed/drop/restored. Every normalized plan structure was exact
installed/restored; drop structures are reported honestly. This compact
durable manifest records the controlling/repaired shapes with the I/D/R result
digest once, the I/R structure hash, the D structure hash, and exact installed
and dropped index owners. Helper and direct query-function controls are named
as such:

| Shape | Limit | Matches | Returned | I/D/R result SHA-256 | I/R structure SHA-256 | D structure SHA-256 | I owner | D owner |
| --- | ---: | ---: | ---: | --- | --- | --- | --- | --- |
| `getLeads_live_default_25` | 25 | 168371 | 25 | `edf4545633a3166d0a1c1f0b083df064d93f61d9243c16a49b35503f272ee1d7` | `64bd6d78234f4348a1507d98c38622b88f1c9e91786b5f5afb1b4433859810d5` | `f50513c59d1565d9c344544e32d0627a3d14383b22f56efd80dd885b97f42a2c` | target | score |
| `getLeads_helper_max_200_control` | 200 | 168371 | 200 | `933321c6ed972038153425dd6a3b138efe484f31ef79686884f496833ec3ad3f` | `3c3279261d816cb4e284e2a887059aaaa4be233a32c40419c15efe866fc4bed0` | same | lease | lease |
| `kanban_admin_live_selector_100_include_excluded` | 100 | 169211 | 100 | `2ad05703d1a3ecb1e3181304a7524a0226c2861a72ea1e4e0eeef0c881fbc229` | `b6e51cd84de681f515a4d9aa216859e1fb6cc97f20dfb86694cb7fa742bc6a47` | `d195a1caa9b7cafaeae053afb2fb705db4e4a7dd436dde4facc8d793413f68d7` | target | score |
| `kanban_nonexcluded_100_query_control` | 100 | 168343 | 100 | `c32e421bef2b98d824fbc2dbdd7d02bd122453cd19edf7a1055c3c97e63c1b1b` | `3c3279261d816cb4e284e2a887059aaaa4be233a32c40419c15efe866fc4bed0` | same | lease | lease |
| `getKanban_helper_max_200_control` | 200 | 168371 | 200 | `933321c6ed972038153425dd6a3b138efe484f31ef79686884f496833ec3ad3f` | `3c3279261d816cb4e284e2a887059aaaa4be233a32c40419c15efe866fc4bed0` | same | lease | lease |
| `csv_admin_live_active_default_50000` | 50000 | 168371 | 50000 | `022e4dfe0ed5e525c7609441f977fccfd264a626481da550e7ac30e5cff45270` | `3c3279261d816cb4e284e2a887059aaaa4be233a32c40419c15efe866fc4bed0` | same | lease | lease |
| `csv_admin_live_active_max_100000` | 100000 | 168371 | 100000 | `66511b4d06a9a4ed1e89571380c6ea6ad764f7edfadcea244fcaf84f12691838` | `3c3279261d816cb4e284e2a887059aaaa4be233a32c40419c15efe866fc4bed0` | same | lease | lease |
| `quality_live_source_exact_50` | 50 | 36053 | 50 | `a41ff9f18cebdebd397cc8e639893b0e8d7bfc2853ff252bfca217ecb4b63b71` | `739bffe07ad6e28877ebb1455d20b38fa3151055ec7b7121eb5e5e94c7e74801` | same | lease | lease |
| `quality_helper_source_exact_100` | 100 | 36053 | 100 | `bf5c4d3cec7a47a5371011820d7834d486a8f3a13ecb5721142f9106058b0055` | `739bffe07ad6e28877ebb1455d20b38fa3151055ec7b7121eb5e5e94c7e74801` | same | lease | lease |
| `current_exact_lease_selector_limit1` | 1 | 159926 | 1 | `9a12a400b348adf44850f3ac13766347631459863a88f81932d84c10ec124289` | `0f409af971a5ed48ccbe4a4649e96ce63267b8a1d297ee3a58d7eddb7577e748` | `e19fae23448aa767cad0c617fcfbcfb3f233e3e22a0c39562343250af1299c94` | target + incremental sort | score + incremental sort |
| `worker_candidate_25_control` | 25 | 159954 | 25 | `edf4545633a3166d0a1c1f0b083df064d93f61d9243c16a49b35503f272ee1d7` | `c7e991472ee03b6ec9bd848e572994da906a0a9898d3cc9ce5388a01b21c131b` | same | lease | lease |
| `direct_explore_helper_60_control` | 60 | 168371 | 60 | `d8b82156649fe6d568486b191719556f06ae0a95664bcd14ccbb77ac12b34462` | `3c3279261d816cb4e284e2a887059aaaa4be233a32c40419c15efe866fc4bed0` | same | lease | lease |
| `direct_map_route_max_600_query_control` | 600 | 134698 | 600 | `2953ff126bdac6dc842a6bc4640c6142b0a58c493cbf5d5c55cbe84fdd275326` | `45e4b74d2a50d1ca68ad976043fe251c8caf0c239d4df3d6225d87af760732dd` | same | lease | lease |
| `direct_map_helper_max_1000_control` | 1000 | 134698 | 1000 | `05d7012782e2271b1aa46cc8eafdf1e57785943da07367a0e57d273be99c68b3` | `45e4b74d2a50d1ca68ad976043fe251c8caf0c239d4df3d6225d87af760732dd` | same | lease | lease |
| `structured_top_tie_cohort_12` | — | 12 | 12 | `95fb8ce9e4112c560225a97d8cc0677855241fbd58c55c8b18d963a702527a58` | `e6d5ec460afe00e2407ef609636465c54b911b097611e9ed5c099e6c2471daf5` | same | none | none |
| `active_state_pending_top25` | 25 | 168371 | 25 | `edf4545633a3166d0a1c1f0b083df064d93f61d9243c16a49b35503f272ee1d7` | `64bd6d78234f4348a1507d98c38622b88f1c9e91786b5f5afb1b4433859810d5` | `f50513c59d1565d9c344544e32d0627a3d14383b22f56efd80dd885b97f42a2c` | target | score |
| `active_state_running_top25` | 25 | 9907 | 25 | `2fb6e205fd71f62d33c59eeb7ce7412011c732e636da7d9e39f78d1e10d4e74d` | `03a174b39e546c94503f7c594989f4628388370e4fa02954c63079ed84ee6cb1` | same | lease | lease |
| `active_state_retry_wait_top25` | 25 | 9898 | 25 | `fc2465dc6d6d155ccd4520aed0727a576e48d4dbadfcab8ead1ec6da843df8c7` | `cf9a488926b4e88ad031669d2cab57c0fbffdc10425539e89100f1b4e83fb646` | same | lease | lease |
| `active_state_enriched_top25` | 25 | 9907 | 25 | `81b7457041ad0f38d9bc022d8a82257057b4220bcd227e230ce84d4489b89b8c` | `bb67f1f78484470826cbd66478c7263621f364bc04ae61e6e6441e52ef5b4f4a` | same | lease | lease |
| `active_state_error_top25` | 25 | 9897 | 25 | `b2c13beea21ff7dffb6a1f395de1ee92311feecb6d95d63080ddd728c5736a52` | `faef65b328030c2939768e7d2e76192f31605037dae6d36ee89c6f38546662fd` | same | lease | lease |
| `active_state_skipped_top25` | 25 | 9907 | 25 | `7951cb35ff11411c984c33d61a657dad2caef5e0bf426b91d4ab6f75da32b9ce` | `11583511990d7fa7233e077132ac6c23c71cebe13877b9b5bcaa07f8c5d16b31` | same | lease | lease |
| `current_stale_running_recovery_read_equivalent` | — | — | 9136 | `e8d9851275257d8469469b51b51c0bc28f57d3c6973b8db83743490d00ed754f` | `0e2b735d6fb9c7900a1d28ae3e51139e3d532d6b693653be4d72bcabfd3ff757` | `277ff272d84f1d9b60404ad44279c38a9c1729ce776c7e5a2a9289d2efc1d063` | target | P6 recovery |
| `scheduler_enrichment_state_groups` | — | — | 6 | `3d2105e5fe5564f2428a2af2c2d4ed636b8ba5e7636b349c66b00e4a93895483` | `9f31241bd8a0bc7ad29a9f7f8d1b51af8eccd7f6914b266ea2ceffd39c1ec6ae` | `dd253d7715a2781f3e3960318b9e01a7e05752c1390093abbf3605a87114defb` | target | no named index |
| `scheduler_pending_active_backlog` | — | — | 1 | `84b5e4f5264486e12e4596ffba1719dd4cff40f5f1fdd99f82184a9a1fb044b4` | `6a3dcf274ce215291782b5795ccdace96f37937b170ab27e33c93d8d1dce8fcf` | same | lease | lease |
| `quality_pending_summary` | — | — | 1 | `c01128a14553cd515b1b761feb4e553870246b6de46177bb88d0c4af73fd5374` | `7ae694210d6143a7d59cef117369b0eaea16be071f1b14ba19c2fdc3a77d8e27` | same | lease | lease |

The v2 exact lease SQL retains every current selector and
`ORDER BY score DESC, updated_at ASC LIMIT 1`. Its top 12 eligible rows share
score 2,000,000 and use distinct one-second `updated_at` values. Installed and
restored use the target followed by Incremental Sort; target-drop uses
`idx_leads_score` followed by the same sort. The live admin Kanban
lead-selector read-equivalent has archived-active scope and no exclusion
predicate; it is target-owned installed/restored and score-owned on drop. The
active/nonexcluded Kanban shape is a direct helper control, not a researcher
route or a complete assignment/market authorization shape.

Buffer figures in the evidence artifacts are recursive sums of counters
reported at every plan node. They are not deduplicated physical-buffer totals;
cache-varying counters, timings, and write buffers are observational and
noncausal.

Installed/restored/final v1 distinct lead-index catalogs were 38/38 with SHA-256
`72bb0e0d41d51d60ab1214ad3b6fddb9219017c73a72c66d3b9039ed81202619`;
drop was 37 with
`58ed12cfb98220d9691a757e9d525b1c87374f1cf89a89e1dc75d5c4739a0708`.
Ten constraints remained invariant at SHA-256
`1456d6974124db2b9921de838651c25face2b4da7b50a3708ae68b7ba49f076b`.
The final target was canonical and both catalog projections restored exactly.

## Replay and catalog-guard debt

Healthy replay was an exact no-op. Before P6 installation, a reversed-key
same-name target survived the historical name-only origin statement but P6's
baseline guard rejected it with `G007P6_INDEX_CATALOG_DRIFT`. After the exact
P6 index already existed, the P6 installed-final fast path validated its own
index and did not revalidate later drift of this historical target. A
reversed-key target therefore survived origin and P6 replay in that later
state. The producer reported transactional probes, and the canonical target
was restored.

Faraday additionally checked reversed keys, score ASC, and a partial same-name
target. An audit-side exact catalog validator detected them; the historical
name-only statement did not repair them. This is explicit historical target
catalog-guard debt. It is not a tenant-query defect, does not weaken exact
validation of P6's own candidate, and grants no P34 DDL authority. P6's
installed-final fast path does not revalidate later drift of this sibling
historical target.

## Invalid attempts and cleanup

Faraday excluded: a parse error before database work; VACUUM inside a seed
transaction (`25001`) with rollback; a block-correlated fixture; a
mutation-rollback bloat run with one restored-structure mismatch; and one
read-only wrong-column count. Each was replaced by a clean run and none is
acceptance evidence.

Boole's first independent run excluded an integer-overflow fixture expression
and VACUUM inside a transaction; both rolled back to zero rows. The v1 remedy
evidence run required no database or workload retry. One post-run read-only jq
reporting expression had a syntax error; the corrected jq invocation succeeded
and did not affect the artifact or database.

Root's first combined temporary-payload cleanup command was rejected before
execution because `rm -f` was disallowed. Root retried with four explicit
validated `unlink` targets; all reviewed payloads were removed and the rejected
invocation changed no state.

Producer, independent, remedy, upstream, and root containers/databases,
loopback ports 34465/42579/43447/38535/37443/41649 and their task
listeners/processes, runner directories, and temporary scripts were removed.
Root retained the evidence payloads only through complete inspection and
independent rereview, then removed them. No extra worktree remains. Sol's P34
durable-document reservation stays held until the lineage receipt releases it.

## Validation and reviews

Root gates pass under Node 24.13.1 and npm 11.8.0:

- focused source behavior: 51/51 across nine files; an earlier overlapping
  five-file subset was 41/41;
- TypeScript and focused ESLint;
- recovery over 37 tables;
- Fedora-portable coordinator 12 passed/26 Windows-native skipped; historical
  Windows evidence is preserved and not replaced;
- production build 11/11 pages;
- fresh PostgreSQL G-002 2/2, G-003 6/6, G-004A/G-007P20A 2/2, G-005 1/1,
  and T-029 19/19 at 54/52/2;
- `git diff --check` and JSONL jq validation.

The first frozen packet received independent P1 evidence rejection without a
technical RETAIN rejection. After the bounded remedy, independent
architecture/authority rereview and independent test/evidence review accept
the packet with no remaining P0/P1/P2. No producer accepts its own packet; Sol
owns final acceptance.

## Closeout

Migration inventory remains 54/52/2 and sequence `202607310010` stays free.
The residual crosswalk becomes 44/18, G-003 becomes 21/18, G-002 remains 13/0,
and the original plan remains 58/318 accepted with 260 remaining. Parent G-007
remains open.

The exact next source-order residual is
`idx_leads_exclusion_score(is_excluded, score DESC)`, but this receipt does not
open or number P35. The acceptance commit records this reviewed RETAIN decision
locally; a following lineage-only commit will record its immutable hash and
release the P34 durable reservation. No push or external action occurs.

## Lineage

Acceptance commit `f61379c998df912abdbdb7a95a1a37836c89637c`
records this reviewed RETAIN decision locally. The following lineage-only
commit releases the P34 durable reservation without opening or numbering P35.
No task-owned disposable resource or lock remains, and no push or external
action occurs.
