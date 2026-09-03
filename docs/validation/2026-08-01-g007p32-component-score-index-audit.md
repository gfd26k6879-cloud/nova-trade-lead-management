# G-007P32 component-score index audit

Date: 2026-08-01

Source baseline: `436506064a411eaa443493b4292ce433c7469cbc`

Reservation commit: `3a4866ccea27e7088ca963523e86715eb06b0f0b`

Status: accepted RETAIN; future tenant analogue DEFERRED; documentation-only;
independent receipt reviews accepted

## Decision

Sol accepts RETAIN for the healthy historical PostgreSQL definition and frozen
SQLite compatibility definition of
`idx_leads_component_scores(raw_opportunity_score DESC, verification_score
DESC)` and defers any tenant-prefixed analogue. The exact disposition is
`retain_healthy_historical_postgres_component_score_index_with_measured_current_raw_opportunity_sort_plan_ownership_and_frozen_sqlite_compatibility_definition_defer_future_tenant_prefix_and_verification_first_debt_to_G009_G011_G012_G014_G017_no_current_tenant_defect_no_migration_or_removal_basis`.

Current `/leads`, `/explore`, map-helper, Kanban-helper, and CSV-helper paths can
pass either component column through the shared sort allowlist. The visible
Explore UI does not offer those choices, but direct route/helper bindings are
real. The leading raw-opportunity key naturally owns current raw-score sorts.
No current query orders by both component keys, and verification-only ordering
cannot use the second key as a leading order. Default opportunity/map ordering
and AI queue ordering are separate sibling controls.

No current tenant-scoped lead reader exists before G-009/G-011. Following the
accepted P31 authority boundary, tenant-filtered forms are measurements only;
they cannot open DDL. The smallest possible future add-only family is
`(tenant_id, raw_opportunity_score DESC, verification_score DESC)`, but it is
not a candidate, migration, reservation, or authorization in P32. Component
scores never supply tenant or workspace authority.

## Provenance and catalog

- PostgreSQL origin:
  `supabase/migrations/202605130002_ai_verified_quality_pipeline.sql`, origin
  commit `60fbef95b994845cbd4d320f06178c1d3e105a42`, current file SHA-256
  `d8ca8b0626dde2c27dfcda754adc629219cf1a29d55891773c82e147fd472430`.
- PostgreSQL columns are `double precision NOT NULL DEFAULT 0`.
- The target is an ordinary nonunique, nonprimary, nonconstraint `btree` with
  two key/two total attributes, `float8_ops`, `indoption 3 3`, valid/ready/live,
  and no predicate, expression, INCLUDE column, or semantic duplicate.
- SQLite mirrors the columns and target at `src/lib/db/schema.ts`; this is a
  frozen compatibility definition, not fresh Fedora acceptance for Windows.
- The accepted tenant AI-queue index contains raw score only behind queue and
  sales-priority keys and is not a semantic duplicate.

## Source and authority matrix

- `LEAD_ALLOWED_SORT` admits each component independently, and
  `resolveLeadSort` emits one requested column and direction. `getLeads` binds
  25 by default and at most 200 with offsets; Kanban binds 100 by default;
  Explore binds 60 with page offsets; the map route binds 200 through 600; and
  export binds 50,000 through 100,000.
- Admin direct routes can reach raw or verification ASC/DESC. Researcher Leads
  remains self/visible-market constrained; researcher Kanban redirects and CSV
  export is denied. Explore researchers are forced unassigned and visible
  market. These restrictions are legacy access controls, not tenant authority.
- Default opportunity ordering does not have the target prefix. Fast map puts
  website need, sales priority, and quality before raw score. AI lease/backfill
  puts sales priority before raw score and has separately accepted queue
  controls. Score updates and website-consistency repair are mutation/filter
  controls.
- G-011 requires tenant scope before other lead filters; G-012, G-014, and
  G-017 own later mutations, AI families, and aggregates. Until those contracts
  land, explicit tenant predicates are non-authorizing measurements.

## Independent PostgreSQL 16 audit

Faraday used PostgreSQL 16.14, image ID
`88a36c64c1003dad93f56daa12d1f8916ec66d1fa3e5fb1fb0ae7cb77efd56d1`
and digest
`sha256:da8cf245a60506e50a0a8cbb0f39c559ca622d92490605b67fcadc74ca1ea8e4`.
The fresh chain was 54 discovered, 52 applied, and two runtime-only files
skipped. The physically alternating fixture contained 160,000 leads, 80,000
per tenant, with 160,000 distinct values for each component and overlapping
tenant ranges.

Sixteen installed/drop/restored shapes covered exact component structural
controls, raw and verification helper sorts, exact `getLeads` joins, default
opportunity/map ordering, AI queue and backfill, AI candidates, and repair.
Every result was exact I/D/R and every normalized structure was exact I/R.
Target ownership was I/R only for three exact component controls, two raw
helper shapes, and two exact raw `getLeads` shapes. Verification, opportunity,
map, queue, backfill, candidate, and repair shapes were target-neutral.

Representative exact current global `getLeads` raw ordering selected the
target in 0.056 ms; target-only drop used parallel sequential scan/sort in
91.718 ms. Its result digest was
`e0aeb27f35a2de572f25173f3510892e40288d2c66075bc3243f19be31fdeee4`.
The measurement-only G-011 form selected the global target in 0.061 ms and
filtered 24 foreign-tenant rows for 25 results; target-only drop took 58.641
ms. Its result digest was
`935a9d4ee122d63d0c942d0d4ca8212289e6d2ecf34c6c1ed6bf2772e1bd236d`.
That measurement records future debt but does not authorize P32 DDL.

There were 38/37/38 distinct lead indexes, restored exactly. Faraday's broader
constraint-provenance join returned 48/47/48 rows because one referenced
tenant-identity backing index legitimately repeated across foreign-key
constraints. That broader join's I/R digest was
`effc9904632bbcb0d57a9607e1d45b93c0f2a1e413c0576892d8739e4ff3f1df`;
its D digest was
`65d59c7c91f7ad52f347c933d2c6672401a58ed15cbe77f2ce67bfc8d130de44`.
Only the target was absent in D under both views. Final artifact SHA-256
values were
`c44565075b57cd840ac5185071c0954d434e8b2bd9a45d6922dd646da24c30c0`
for the harness,
`9d3b8797f9e27a52630fa01b29433134f93ef975454f9f70e767e965394860d7`
for the raw receipt, and
`54d2465752236f81a1e25f85358a1beaa7b0ceea0272601add25e33c3c4da449`
for the summary.

## Root independent reproduction

Root used a separately generated PostgreSQL 16.14 database and fixture: 54/52/2
migrations, 100,019 leads, two physically interleaved tenants, 100,000 active
nonexcluded rows, 10,001 coordinate rows, and one wholly included 12-row
default `0/0` cohort. Eighteen shapes had exact canonical result sets and
ordered score sequences I/D/R, with exact structures I/R.

| shape | canonical result SHA-256 | structure I/R | structure D | I/R owner |
| --- | --- | --- | --- | --- |
| raw DESC 25 | `af2bdc086b2f6dac1c52dd92b8c1d440ef166927cc655d3140fb928766a5baf6` | `6350ce8e590069b4faf43bd8cbed01e6d0a9e78eaba9fcfeb3699384f6ded662` | `4ea4e66b128a8bc9ebcc26260ab7391e52da8f3b485d704f97d3ae6069588e79` | target |
| raw DESC 25 offset 25 | `885e081ac3d735808a4537ad266662df695d7437232382ea378e5ae8a15a33b1` | `38cb553195e303aacadef3da1dc16be7c799240247add62022fac9fec27aef7a` | same | enrichment sibling |
| raw ASC 25 | `1b4a95dbfd5b28b1315348e03641267611a533ac6a031ea82d8184446ab6514a` | `f01b68e4530edf372b8d1d54e81ba74d9354fa7aaeaafe56ea73091d1ed13b5c` | `ebe9111203fd91f096f2dc6fa55201199d969a786d9f107334f0bad8c3dd98f7` | target backward scan |
| verification DESC 25 | `60f6234881114a81d86995d0dd757c5c9e8e972a7c2b3682b6c86a0586b57dca` | `94a5e14bbf41f8741c6d0567bea1ebbdb354b7c4c248890395606739c2ffc7d6` | same | enrichment sibling |
| verification ASC 25 | `8c16dc8a6b665e9efd7017b41914a37400c29dc20c584e789404fc0077ffae20` | `8532455aec08e0e1b11e47912e065e6f0eca32a913881a84e76e39f6667720b2` | same | enrichment sibling |
| raw DESC 60 | `7be317f83b0862254922f83c7db5fb9fdce891256dea54b00ef4db8b0f81d02e` | `48ac64eda0bf0026d90ce8efcf3b02c3d30b24ee34f4f3ba8f272f4287f5ba7d` | same | enrichment sibling |
| raw DESC 60 offset 60 | `2ed81f66e054954de338612d9b627fc6a23b00a07ad833ca6b3fe842a5ccca3c` | `45c5a9bbae66623aca3c2dbc3e9168142ae66744814db1235a8c93df06459ed9` | same | enrichment sibling |
| raw DESC 100 | `38ba2770983318b91d9fa790761e1efadb63ccfbdd2a30ddb00be305b53f351b` | `8606a44c4b457d69e1594aa3b7c9a883dbae340a766a1c602deb36a87a4c68ce` | same | enrichment sibling |
| raw DESC 200 | `d42830ab98715d685ed2b2be3212fa252209d5620610e8be81584dec81d947fd` | `549d95cda73565203046e28c842d3c23c93651673cc48e23eaaeae8f648c0251` | same | enrichment sibling |
| map raw DESC 600 | `1368df2851ce527010149547ddc3892d988cdf883ed9b1511175f4848ce4e402` | `aee3d6ef5c1bb5eb04239866d9b7de8a9e1b486440eb7fef043f235b261bf1e4` | same | enrichment sibling |
| map verification DESC 600 | `892defff6807aeeb404e360651359a3608cecfd6668922bf935d7a99258ce677` | `3cb4abcdfa16a10c9ad1828de4ed7d567dc1a9f593aa8700d11ed1ea4d8f799d` | same | enrichment sibling |
| export raw DESC 50,000 | `30544bec8fba61a600d6b99885281a089c544313df6e1238bce6841d8f9e0dde` | `dab64c83947006f54fdf2b1125fef7bc3e2a44e7900f4d3ce8ba7fa0d46b1310` | same | enrichment sibling |
| export raw ASC 100,000 | `6cbe451cb8b3cfa79f2a9e7ae5268393f9f9889a09ceddeb7381b59d2ee90716` | `85c84bc2465e0db54d83bebc0186120a289d0734043cbfd1a650af66584e8637` | same | enrichment sibling |
| tenant raw DESC 100 | `8d4cc6a4c61397bf0acc494014c63834931902484db20f71828f8a76002d27dc` | `0b7d3a7426cb13821c530018d7ea12fa96e2f69f5de672455313489c261a0c6d` | same | accepted tenant-discovered/enrichment siblings |
| tenant verification DESC 100 | `a9c3400a7e791ac9bc6d5068c4457ddf0c8d6905860fae84c8573ee09e04be2e` | `554b752f2a000aeae4c10c64b512a50b150c33c290bed7c82ec5d65acf5743b2` | same | accepted tenant-discovered/enrichment siblings |
| exact component control 100 | `38ba2770983318b91d9fa790761e1efadb63ccfbdd2a30ddb00be305b53f351b` | `e6894827615b17995ba3deb125bc746fa878da44952dc029d60a69ecb1d18c43` | same | enrichment sibling |
| queue control 1 | `1cfe05a0c95761773dfcd07d087f9a0cc8351c87b08e7d13b832008ca0538bfc` | `9fbaf4fa73f4cbac38c4642de7c4ebd2d78e13a4450ed0b245621361c3f6e4df` | same | accepted tenant queue/enrichment siblings |
| repair control 100 | `facaa6680170abd21fc104d4d878ad42e3727f32af95d6b16abf8212760ab6ab` | `30bc9182160726e4f3721c096571c25fe16e23a8c48a17913e176e5d273df268` | same | score-recompute sibling |

For the current raw DESC 25 shape, I/R used the target with 58 shared-buffer
hits and 0.020 ms; D used the enrichment sibling plus sort with 17,434 shared
hits and 35.117 ms. Raw ASC 25 used a backward target scan with 38 hits and
about 0.020 ms; D used the sibling plus sort with 17,434 hits and 36.144 ms.
Timing is corroborative, not causal. The separate root tenant measurement was
target-neutral on this distribution, which is consistent with deferring future
DDL rather than assuming a universal candidate.

Root catalog counts/hashes were I 38/
`cbf39fa6cd8d6cbfde9d6398a17105dae6baf41a0fcc875f525df7f3fe3afd02`,
D 37/`851fe7a24bed00815aa2d8b28bfdb54be6497b1a581ac995649128cce91584a8`,
and R/final identical to I. Lead constraints were 10 with digest
`8f1feddd7f44b30e3c7ac84d3b6ede1277207925b6ff768dc522dc415944814e`
I/R. Statement-scoped healthy replay was an exact no-op, and a reversed-key
same-name spoof was rejected before workload. The raw receipt is preserved in
main rollout
`rollout-2026-07-31T17-50-52-019fba96-7f30-7b53-ada3-ecbadc9b5340.jsonl`,
call `call_5LqO97SWzuURO1XmLtBZhWdg`: 29,746 extracted bytes, SHA-256
`f046d80eda02d740b5e515e5324638cffd093c8ab06f94e2963ebc273b2d3837`.

## Invalid attempts and cleanup

Faraday retained four corrected invocations: NOTICE output initially polluted
JSON, runtime fields initially remained in normalized structures, Date
canonicalization initially collapsed timestamps, and host `psql` was absent.
The corrected container-based runs are authoritative.

Root attempt 1 is excluded because replaying the entire historical origin file
recreated a later-retired index and changed the catalog from 38 to 39. Root
attempt 2 is excluded because its default enrichment distribution dominated
the plans and a large boundary tie made ordered identities noncanonical. Each
database was discarded rather than reused. Retry 3 above is the sole root
authority.

All audit containers, databases, ports 55461/55462, scripts, processes, and
temporary artifacts are removed. No hosted Supabase, provider, Windows-only,
deployment, push, PR, credential, customer-data, or external activity occurred.

## Independent review and validation

- The independent architecture/authority review accepts RETAIN for the exact
  healthy historical target and DEFER for any future tenant-prefixed analogue,
  with no P0/P1/P2 finding. Its sole wording correction was incorporated: the
  existing target is retained, not described as a deferred candidate.
- The independent test/evidence review accepts the complete receipt with no
  P0/P1/P2 finding. It independently verified the root raw-receipt extraction
  at 29,746 bytes and SHA-256
  `f046d80eda02d740b5e515e5324638cffd093c8ab06f94e2963ebc273b2d3837`,
  the tie-handling precision, catalog restoration, and no-DDL boundary.
- The producer's final factual cross-check found one P2 description error: its
  distinct-index counts had been coupled to hashes from the broader constraint-
  provenance join. Sol applied the bounded correction above. Independent
  architecture and test/evidence rereviews accept the repaired packet with no
  remaining P0/P1/P2; the producer confirms factual closure without exercising
  acceptance authority.
- Root gates pass under Node 24.13.1 and npm 11.8.0: 63/63 proportional
  behavior tests across 13 files, TypeScript, focused ESLint, recovery over 37
  tables, Fedora-portable coordinator 12 passed/26 Windows-native skipped,
  production build 11/11 pages, fresh PostgreSQL G-002 2/2, G-003 6/6,
  G-004A 2/2, G-005 1/1, and T-029 19/19 at 54/52/2.
- The G-004A and G-005 gates used their own disposable PostgreSQL 16 services;
  the G-002/G-003/T-029 sequence used a separate clean database family. No
  deliberately mutated audit database was reused for clean migration replay.

## Closeout

P32 creates no candidate, migration, test edit, replacement, or removal.
Migration inventory remains 54/52/2 and sequence `202607310010` stays free.
After independent acceptance, the residual crosswalk is 42/20, G-003
becomes 19/20, G-002 remains 13/0, G-004A remains 10/0, original-plan
arithmetic remains 58/318 accepted with 260 remaining, and parent G-007 remains
open. The next source-order residual is
`idx_leads_country_admin(country_code, admin_area1, locality)`, but this receipt
does not open or number it.

Acceptance commit `ca2a4cf3f0ea93474121c1541f769086311d6291` records this
reviewed RETAIN disposition locally. The following lineage-only commit records
that immutable receipt hash and releases the P32 durable-document reservation.
