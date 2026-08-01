# G-007P25 crawl-unit cell-status index audit

Date: 2026-08-01

Baseline: `699f2af59f0ef1a95d5630c1f22a53a3343f51f4`

Branch: `codex/nova-multitenant-integration`

Status: retain exact current compatibility owner; no migration

Receipt commit: pending

## Scope and authority

G-007P25 audits exactly
`idx_crawl_units_cell_status(location_cell_id, status, category)`. Current
owners are the direct cell-coverage aggregates and the global or selected-run
location-cell ledger. The current market summary shares the same cell join, but
this audit measures it only through the bounded control identified below.

Cell IDs name shared platform reference data. They never authorize tenant-owned
crawl units. Run-only results remain current compatibility/performance evidence,
while tenant/workspace and null-workspace forms below are measurements for
future G-010/G-013 contracts. Generalized units correctly retain a null cell and
are excluded by cell equality and join shapes.

The index is not constraint-owned and does not cover the full accepted
`crawl_units_market_cell_fkey(market_id, location_cell_id)` child key. P4
run-scoped indexes and the market-status sibling remained controls, not reopened
or combined audit families.

## Provenance and fresh catalog

The target originated at commit
`fe07602ccfb47f529c8aeb62e249217c8fb1828d`. The current migration LF SHA-256 is
`af73cd9d955a69266bac9140eebf981df1e289110ced3d3f1d2e41433ec28372`.
Current and frozen SQLite retain the same compatibility index; this Fedora
receipt makes no Windows/NTFS or SQLite-activation claim.

A fresh loopback PostgreSQL 16.14 database `g007p25_cell_a2` replayed 54
tracked migrations, applied 52 portable migrations, and skipped the two
documented runtime-only files. The target was an ordinary nonunique btree,
valid/ready/live, 1,359,872 bytes, with zero constraint owners. Its exact
definition SHA-256 was
`805d42992f328b060c0d2349b5375b40b83f0c1fb07e1133b38e14dbed16d613`.

The final table had 12 indexes and 11 constraints. No index was unhealthy. A
canonical payload of sorted index definitions/health/owners and constraint
definitions/validation flags had SHA-256
`93e1468e7db1805834179abc22871b47f4ca5af976f27859091372662b75c61f`.

## Representative fixture and results

The accepted fixture contained 120,000 physically interleaved units across two
tenants and eight globally unique 15,000-unit runs. Twelve constructed cells
spanned two markets. Exactly 96,000 platform-cell units and 24,000 generalized
null-cell units were present; 60,000 rows inherited null workspace. Every cell
was measured at 8,000 rows, both tenants, all six statuses, and all six
categories. Tenant/workspace/market inheritance mismatches were zero.

All 36 generalized status/category combinations remained in base data, with
664-669 rows per combination, while generalized rows in cell-owned shapes were
zero. Correct-tenant, exact-workspace, null-workspace, wrong-workspace, and
other-tenant controls returned 4,000/2,000/2,000/0/4,000. These are result and
scope controls only, not accepted tenant query contracts.

Five canonical result payloads remained byte-identical before target removal,
during removal, and after rollback:

| Shape | Rows/bytes | Result SHA-256 | Representative result |
|---|---:|---|---|
| exact cell | 1/48 | `98b9ad01e3578736b4d1a7a3ab48829a454e8b3886cdd907d79b744a96b0ce49` | 8,000 total; 1,332 done; 1,333 failed |
| cell plus three categories | 3/153 | `007ee117780da44db646446d7ab4617c8ba2873056fcd8e41cdd42c5ce698e2c` | canonical category rows |
| global cell ledger | 23/9,464 | `663d360048faf91c147e67ba79fc35c8c5e4676aed4fbafa4bfbdecae09daf6b` | target cell 8,000/1,332/1,333/4,001 open/1,334 canceled |
| selected-run cell ledger | 23/9,192 | `b3ea34bc67b172858e628594c9f8738113ed4cce36166ec67257ab2e3acacdc1` | target cell 2,000/334/334/999 open/333 canceled |
| bounded market control | 1/356 | `881b2c44bd76a5e84f280edb46e33a0eb0e0dedfa0323f7945ca189a2cd76a41` | 6 cells and 48,000 joined units |

The ordered map of those five result hashes had SHA-256
`a6e5cdd6c8d52e4d59067c624ce3c99cf882ed813a633979679815568b6b2521`.
The bounded market control copied the current coverage join/aggregate and added
an audit-only market predicate. It returned `active_cells=48000` because the
underlying current SQL sums across joined unit rows; this is representative
control evidence, not a byte-for-byte current query or acceptance of that
multiplicity as a distinct-cell contract.

## Natural plans and transactional removal

After vacuum/analyze/freeze, four current/current-derived shapes and the bounded
market control naturally used the target without planner forcing. Inside an
explicit transaction, dropping only the target preserved every result but
changed all five structural plan fingerprints:

| Shape | Installed natural plan | Drop fallback | Installed/drop time |
|---|---|---|---:|
| exact cell | target bitmap; 3,265 hits | 120k seq scan; 112k removed; 3,253 hits | 2.341/13.655 ms |
| cell/categories | target bitmap; 3,265 hits | parallel seq scan | 2.698/10.017 ms |
| global cell ledger | target bitmap; 39,299 hits | one 120k seq scan; 3,301 hits | 66.523/77.691 ms |
| selected-run ledger | target plus P4 run-status bitmap; 12,419 hits | P4 run-status-only bitmap; 3,325 hits | 19.030/19.373 ms |
| bounded market control | target bitmap; 19,597 hits | 120k seq scan; 3,258 hits | 48.461/68.667 ms |

Installed structural fingerprints were respectively
`b375ddf4f38f7622df56d177cfc3aa678df98cd891bbcf66d0e2af307b0a589c`,
`ee4e7882d62285224b7859705d122b15da0d366b58b73a1d7608a9c9543d4be3`,
`49a559a5351557d4dbb2ddbbc48f6a02f2104c6066bd33b53373bbea33a3d22e`,
`d079e53c923d7bcd7f45a1558a035c0a2f1b447dd97234fbf7312541f87de591`,
and `286c07c8d45ea1b7afc168145d2594d88e2807496ddb990c01f9472ccfc8443e`.
Drop fingerprints were
`95c383ac346d80e5356b8fb30557c8f4c4107c3915a00bb8055006148b6f2bf9`,
`74b1a92c8fe2136ee3d5296a62d4a70a40917a5c2c28e08d8ccd6e61b58d3564`,
`ba04166572078b3e2184431b640395ec93e85d9a644c5c82deedb638cc14a889`,
`cf96201048d741c14918a1221f159ea4144fddf3dd7e6d56d4364b01dbe42b7a`,
and `790ac21952530186c71f78dbdff9104db3e6cb7ccefc756b623fec001e490b6b`.
The drop catalog SHA-256 was
`b087a981dc6d5fb755d2416648e642d9ef0a03aeb28507758feba795d1952982`.

Explicit `ROLLBACK` restored the exact target definition, installed catalog
digest, combined result digest, and all five installed structural fingerprints.
Restored execution times were 2.861/2.629/64.941/17.027/48.741 ms. Final
statistics only corroborated the plan evidence: target 220 scans, 1,056,000
tuples read, and zero fetched. No `idx_g007p25%` residue remained.

## Invalid evidence, validation, and cleanup

The first `a1` database replayed 54/52/2 and loaded 120,000 rows. Its first
post-load inheritance query failed with PostgreSQL 42702 because `workspace_id`
was ambiguous; no target mutation had occurred. After correction, the fixture
was rejected because correlated cell/status modulo cycles left an individual
cell without representative done/failed rows. No `a1` plan evidence is accepted.
Fresh `a2` replayed from zero with independent cycles and had no invalid
invocation.

Root separately passed Node 24.13.1/npm 11.8.0 behavior tests 34/34,
TypeScript, focused ESLint, recovery verification for 37 tables, the
Fedora-portable coordinator suite 12 passed/26 skipped, and production build.
Fresh separate PostgreSQL databases passed G-002 2/2 and T-029 19/19. The first
G-002 cleanup assertion saw a transient listener after successful container
stop; the retry confirmed the container absent and port closed. This is not
Windows/NTFS acceptance evidence.

The audit container `g007p25_cell_20260801114355_1422658`, listener 36083,
clients, task processes, temporary artifacts, and candidate residue are all
gone. Root's G-002/T-029 containers and ports 36084/36085 are also gone. One
current worktree and zero extra worktrees remain. Main and the handoff tag are
unchanged. No hosted, provider, remote migration, production, deployment, push,
pull request, outreach, credential, or other external action occurred.

The target is retained as an exact current compatibility owner. No defect,
candidate, migration, test edit, removal, or G-010/G-013 acceptance is justified.
Counts remain 54/52/2, sequence `202607310010` stays free, the crosswalk becomes
34 classified/28 unclassified and G-002 becomes 9/4. Parent G-007 remains open.
