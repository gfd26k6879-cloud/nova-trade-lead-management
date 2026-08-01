# G-007P30 assigned-lead index audit

Date: 2026-08-01

Baseline: `7880f3eecd41420b26be15bece7d459ff80c811f`

Status: accepted RETAIN/DEFER; no migration

Receipt commit: `e3e2c9759f2e8f53cc8299d746237a928fb9674f`

## Decision

Sol accepts RETAIN/DEFER for the exact healthy historical PostgreSQL catalog
definition and frozen SQLite compatibility definition. Ordinary current
assignment readers and assigned/NULL query-function export controls do not
naturally select the target, and no current assignment reader orders by
`updated_at`. The exact local `removeAppUser`
assignment-null cleanup does naturally select the leading assignment key, but
target-only drop after `VACUUM FULL` did not demonstrate a material buffer or
runtime advantage. FK `ON DELETE SET NULL` support could not be attributed
through the visible parent-delete plan. The evidence therefore proves neither
target necessity nor target redundancy/removal safety and establishes no
tenant-query defect. No candidate, DDL, migration, replacement, test edit, or
removal is accepted.

The exact disposition is
`retain_defer_healthy_historical_postgres_catalog_and_frozen_sqlite_compatibility_definition_with_exact_cleanup_plan_selection_but_no_material_cleanup_necessity_and_unproven_FK_support_no_current_updated_at_order_owner_no_tenant_defect_no_removal_basis`.

Assignee UUID is a selector, never tenant or workspace authority. One global
Auth identity can be active in both tenants, and leads remain tenant-wide with
no workspace dimension. Tenant-prefixed analogs remain measurement-only until
the exact G-009/G-011/G-012/G-016/G-017/G-018/G-019 cutovers. The legacy
ownership map's G-020 workbench/team citation conflicts with strict G-020 fair
worker dispatch and does not displace those owners.

## Source, replay, and catalog

The target is created first by
`supabase/migrations/202605120002_supabase_auth_roles.sql:47`, origin commit
`6b397324caf90bdad9a4aae2d872374a05868dc5`, current file SHA-256
`8c5077d5e0011bfb37aabd977cfa7ecd5e91d8f70f987777e9f2a715982dbf2c`.
The later `IF NOT EXISTS` statement at
`supabase/migrations/20260515123000_researcher_workbench_outreach.sql:15-16`,
origin commit `536a899587a6daf48413cd32897bdb6cf1a8a324`, current file SHA-256
`275ed2fccf759910053ea371662fff44d884b3ad164e576dd238d4e290a678b5`,
was a semantic no-op. SQLite mirrors the historical definition at
`src/lib/db/schema.ts:2091`; no fresh SQLite health or plan claim is made.

Fresh PostgreSQL 16.14 replayed 54 discovered migrations: 52 applied and two
runtime-only migrations were skipped. The primary audit's full semantic catalog
SHA-256 was
`1e25364578cd9c7700fe26fdf71c3592e622d2ab50d0f663d81330762dc36ff0`
at first origin, before the duplicate, after the duplicate, and after the full
chain. A fresh compact corroboration used a deliberately smaller catalog
projection and held its own SHA-256
`24c9d34ccf1f09d99865037fca0da7d173ccfbfa6f141420cadc8b2441e70e24`
at those same four points. Projection digests are not compared across harnesses.

The live definition was:

```sql
CREATE INDEX idx_leads_assigned_to_user
ON public.leads USING btree (assigned_to_user_id, updated_at DESC)
```

Its canonical no-newline SHA-256 was
`c68a4b18f176561b58ea39f1bebfea2373f44c65b52d47f87ddfecf679a2ab0f`.
It was an ordinary, nonunique, nonprimary, nonexclusion, immediate, valid,
ready, live, non-replica-identity btree with two key/total attributes,
`uuid_ops` then `timestamptz_ops`, index options `0 3`, and no predicate,
expression, INCLUDE column, or constraint owner. `assigned_to_user_id` was
nullable UUID with no default; `updated_at` was non-null `timestamptz` with
`now()` default. Exactly one valid, nondeferrable MATCH SIMPLE FK referenced
`auth.users(id)` with UPDATE NO ACTION and DELETE SET NULL.

The pristine post-replay index was 8,192 bytes. After the primary matrix and
rolled-back mutation probes it measured 24,862,720 bytes; after `VACUUM FULL`
it was 13,877,248 bytes, so post-fixture/probe sizes are not presented as
pristine size. Installed/drop/rollback
held 38/37/38 lead indexes with catalog SHA-256
`964e27fe929b8000412f96add9f44eb2d81fa41343ce49871931c777b7b7cc02`,
`f4b1f93638bf33572fcb168d472b21ec022e75bac11edb73f8fa49728f31f15c`,
and the installed digest again. Lead constraints remained 10/10/10 with
SHA-256
`6ae4672e46425838b8a22f01737737b08d0a6c5d6419e6078a460991fbd1d910`.

## Fixture, boundaries, and rejection controls

The deterministic fixture contained 368,640 physically interleaved leads:
18,432 exact factorial cells and 20 replicas. Each tenant had 184,320 rows.
Shared-active, tenant-local-active, and NULL assignment states each had 122,880
rows; each tenant-local actor had 61,440. Active/archived,
included/excluded, due/NULL reminders, and the two shared platform markets each
split 184,320/184,320. Three statuses each held 122,880 rows; four quality
buckets and four score bands each held 92,160. Score and `updated_at` were
globally unique. Active/included rows numbered 92,160; each assignment state had
30,720, including 15,360 queue-qualifying rows.

Assigned score ranks 1/25/26/50/51/100/101/200/201/600/601/1000/1001/30720
resolved respectively to IDs
`0000217/0001369/0001370/0002522/0002545/0004850/0004873/0009722/0009745/0028778/0029017/0048050/0048073/0368402`
under the `g007p30-` prefix. NULL-unassigned ranks resolved to
`0000221/0001373/0001374/0002526/0002549/0004854/0004877/0009726/0009749/0028782/0029021/0048054/0048077/0368406`.
Every score boundary had tie count one. Updated-order ranks 1/25/26/100/101/
200/201/122880 resolved to assigned IDs `0368636/0368564/0368563/0368341/
0368336/0368041/0368036/0000001`; exact microsecond strings were not emitted,
so no timestamp value is invented. Fast-map and NowQueue compound tuples end
in globally unique score and therefore have tie count one, but their exact
boundary IDs were not emitted and are not claimed.

Suspended and other-tenant-only actors rejected with SQLSTATE `23514` and
`G003_ACTIVE_SAME_TENANT_ACTOR_REQUIRED`. Empty UUID text rejected with
SQLSTATE `22P02`. All three preserved unchanged state SHA-256
`28555af463df127b6a86a3c9b3456dda3f80e9422cd6a82ad161c5792e43d20c`.
The shared active identity was deliberately valid in both tenants; this proves
identity collision is not tenant authority.

## Natural read plans

All 33 canonical result digests were exact installed/drop/rollback. Every
installed structural fingerprint was restored exactly after rollback. Drop
plans are intentionally not asserted equal where target absence changed them.
Raw `hits/reads/removed` below are recursive EXPLAIN telemetry, not a derived
causality or materiality field.

Plan aliases are full SHA-256 values: `AC` =
`1c11c29b985f5a63f12a3dee68a2cd3006d7171cdf3bedfe6f64f761cdc05622`;
`A1` = `d92b3b2579bfd721e98d90de7e64faa44316822ff80987c594ec24c46882d008`;
`AL` = `4bc936f88070ff54ee0820c7a35f1d1a8a180269856f91171837247f1c114d7d`;
`AM` = `e3ae3005f9d07a3c3de8a7ba50277f396041ce4ac79bc226123fbde927a8424f`;
`AF` = `9edb7e9d372342c6e52b8c079c71b2c64a7eea4f86b93a90168195572a3436a0`;
`AN` = `3f356360547c1e7180ab9f287ead9c662804a0bd90a043a8a4b4c35ef6003a08`;
`UC` = `e38f6c379489e55380b6849e8bea3894204f011e60c53512b423b5426c75a754`;
`U1` = `97e10609ff1d32b8166c02d41ac9861974bcc5cbe061c1860c31fbf622f8a49f`;
`UL` = `f339e6ba06781ebe89fbf7b0417e607614c6684f00af56a51f2d93228e7b3a2f`;
`UM` = `d817866997355b3beacb9272c58e371bc6ac960dedab2cb50d9d55fc2e3ae756`;
`UF` = `9f7f3caf6bb5ae12c1fe3bff42eb2642a4300b56be53c0d0b368df0ffcf70195`;
`UN` = `39d770b29a85584877d80742f28218439eacd12b955cb4ee906b0bc232144bd4`;
`W` = `19fc76c7f21582fa36bbdfcaa0bae26d0e94b0ba70803e24f709331d720a249b`;
`T` = `3b00b9707b050ff1dd3445a54242f1a27ddfc9451226e7a6e6c71128206fe3cd`;
and structural control `S` =
`2c90a784bcaeb352fd0eafe9021a7f750761d2a08e460f185909bc86d9d62c8f`
installed/restored versus
`52ae8658ce965f951e97e3f1e2a9bea708e4dcef99a0ba40f513cba36dc34d58`
dropped.

| # | Shape | Rows | Result SHA-256 | Plan | Owner I/D/R | Hits I/D/R | Reads I/D/R | Removed I/D/R |
|---:|---|---:|---|---|---|---|---|---|
| 1 | assigned count | 1 | `2da18a5f29e74a0741f8c45896f9e8b086ee53969932c5f1c28806770981ffce` | AC | enrichment lease | 5110/946/902 | 36034/40198/40242 | 61440/61440/61440 |
| 2 | assigned getLeads 1 | 1 | `b7e5532167b5324da607aa960eabc8d4d3ae1d1ee28c41dfb19c4bd52f407b25` | A1 | user key + score | 0/0/0 | 20/20/20 | 0/0/0 |
| 3 | assigned getLeads 25 | 25 | `3a73767ee15a17f5f56943593065cd140b88b3bfdad49834049c13c2950f9dfa` | AL | user key + enrichment lease | 1766/1534/1590 | 80532/80764/80708 | 61440/61440/61440 |
| 4 | assigned getLeads 100 | 100 | `24ea667686dd288b899f95f8c3d9e527df6dad8912f697b58ee5044cb5f8ce61` | AL | same | 1526/1630/1749 | 80772/80668/80549 | 61440/61440/61440 |
| 5 | assigned getLeads 200 | 200 | `8326390aa1ae16a552b4ed8d19aec06837f63997655d2e93cc2552078ca78b04` | AL | same | 1745/1621/1557 | 80553/80677/80741 | 61440/61440/61440 |
| 6 | assigned getLeads 25 offset 25 | 25 | `087a398b7b745c5255b9c89d8bb9da1185c7cceaa25671936e275c52a031da15` | AL | same | 1621/1789/1653 | 80677/80509/80645 | 61440/61440/61440 |
| 7 | assigned Kanban 100 | 100 | `72cc0b9c150a9aecea93d6577edd9611aef7a935e8812b870f41d19bae6ffd6d` | AL | same | 1825/1457/1461 | 80473/80841/80837 | 61440/61440/61440 |
| 8 | assigned map normal 600 | 600 | `7b6baa0ee0e3f91b121f9ebd856a832f674f1aabae69a1b7d0ed3d66d4e290eb` | AM | user key + enrichment lease | 1573/1613/1745 | 80725/80685/80553 | 61440/61440/61440 |
| 9 | assigned map fast 600 | 600 | `414ac1a97f73fe5b4e97f44f0759941486054ecdb23df2374f0a99634c9418b6` | AF | same | 1725/1569/1553 | 80573/80729/80745 | 61440/61440/61440 |
| 10 | assigned map normal 1000 | 1000 | `0932e577590105f12f70cd68f213cfdafd8a2f07b2bd2e7838cbfff1c83c3b50` | AM | same | 1621/1765/1589 | 80677/80533/80709 | 61440/61440/61440 |
| 11 | assigned map fast 1000 | 1000 | `a2473f11fea3c18391fe61b72a32bd9fb675a7e5b3f48e9dbfbca2cf86e70c5c` | AF | same | 1749/1449/1413 | 80549/80849/80885 | 61440/61440/61440 |
| 12 | assigned export helper 50000, nonbinding full set | 30720 | `7795ff1afdc7ca71a228b1da0568b07aeb80bb21dbc709068481a9cef6870ab5` | AL | user key + enrichment lease | 1529/1557/1721 | 80769/80741/80577 | 61440/61440/61440 |
| 13 | assigned export helper 100000, nonbinding full set | 30720 | same as 12 | AL | same | 1705/1501/1537 | 80593/80797/80761 | 61440/61440/61440 |
| 14 | assigned NowQueue 25 | 25 | `78aa4ddc460a3dd76052a09926a2b5f07694a62c57a9ab2278b617cc8efd6445` | AN | workbench candidates + PK | 49101/49094/49192 | 18665/18672/18574 | 0/0/0 |
| 15 | unassigned count | 1 | `2da18a5f29e74a0741f8c45896f9e8b086ee53969932c5f1c28806770981ffce` | UC | enrichment lease | 16656/16792/16736 | 24488/24352/24408 | 61440/61440/61440 |
| 16 | unassigned getLeads 1 | 1 | `b9c62aee6274c90f0c453b16c710608f73368f846586ef1d81fb25151f4d52ad` | U1 | user key + score | 3/3/3 | 9/9/9 | 4/4/4 |
| 17 | unassigned getLeads 25 | 25 | `33aa57133b45960f4e4cd87808107fb5e81e635bb3a40ea44ab4b0581d2953d1` | UL | user key + enrichment lease | 2276/2812/2576 | 80012/79476/79712 | 61440/61440/61440 |
| 18 | unassigned getLeads 100 | 100 | `33175b964936579dafd4dcd67414b7e2b543afcd6c8037f0d83fa423c9318ba5` | UL | same | 1800/1628/1656 | 80488/80660/80632 | 61440/61440/61440 |
| 19 | unassigned getLeads 200 | 200 | `8101c6fec6074dbb830ceeaa779456c20049e01b5f670ef864e28665cb398fc1` | UL | same | 1484/1520/1620 | 80804/80768/80668 | 61440/61440/61440 |
| 20 | unassigned getLeads 25 offset 25 | 25 | `c48a678da79325c52ac6f73ed9daef9ba51301982c57ffc49961fbffdc8b2595` | UL | same | 1436/1536/1608 | 80852/80752/80680 | 61440/61440/61440 |
| 21 | unassigned Kanban 100 | 100 | `eb868a6a58ed5d67b5ad02477ddee6b61dc32d1f95599a428ed832c0adffa6c9` | UL | same | 1592/1748/1596 | 80696/80540/80692 | 61440/61440/61440 |
| 22 | unassigned map normal 600 | 600 | `6970dee37f390b875069d49ea3ee168ded59b3218a15ba58c4e5bf20dc4baf55` | UM | user key + enrichment lease | 1700/1644/1540 | 80588/80644/80748 | 61440/61440/61440 |
| 23 | unassigned map fast 600 | 600 | `ed96cf5bf87aa99f296ef0cfaa3e80654eabd85617014d835db489c6ed57f988` | UF | same | 1596/1528/1724 | 80692/80760/80564 | 61440/61440/61440 |
| 24 | unassigned map normal 1000 | 1000 | `1abe2687f325867330093629f6236f148048a9a4a78239d357dd2d037030f393` | UM | same | 1500/1524/1608 | 80788/80764/80680 | 61440/61440/61440 |
| 25 | unassigned map fast 1000 | 1000 | `9a1d0d62f009f6e006292d99c2ebf08eedeb9149c9a8b7f30e82fde60fcd3a8f` | UF | same | 1596/1796/1600 | 80692/80492/80688 | 61440/61440/61440 |
| 26 | unassigned export helper 50000, nonbinding full set | 30720 | `39d2ce4f09987dd68b7170520e209313a08cbd110ecfc330b2266508fea043e3` | UL | user key + enrichment lease | 1660/1616/1512 | 80628/80672/80776 | 61440/61440/61440 |
| 27 | unassigned export helper 100000, nonbinding full set | 30720 | same as 26 | UL | same | 1748/1596/6664 | 80540/80692/75624 | 61440/61440/61440 |
| 28 | unassigned NowQueue 25 | 25 | `12e4be891395fac9c4ae531dc5ae8e98db99ccebf70b38c568829321e702c4d4` | UN | enrichment lease + PK | 10223/10237/32322 | 141781/141767/119682 | 76800/76800/76800 |
| 29 | workbench summary | 1 | `5980a8b134c09ba6d5bcc76ee1482da913b948245e13250f1cbebe6b4c0eff0c` | W | enrichment lease | 1324/1384/1768 | 39820/39760/39376 | 0/0/0 |
| 30 | team assignment aggregate | 4 | `dc12258afe78e615ba080a769b461ec90103738694b5bea75357bd03de45869e` | T | enrichment lease | 1688/1592/2416 | 80605/80701/79877 | 1/1/1 |
| 31 | structural assigned/updated 25 | 25 | `6021146d5385d5fda8b8f85b7442757c551ae8244b61a2692e58f7d1df78e458` | S/D/S | target/stale sibling/target | 6/6/6 | 10/10/10 | 0/52/0 |
| 32 | structural assigned/updated 100 | 100 | `5b3c9b0da452cabf97d724d3fde33b4bda7576e9dfb2de2ba52579ab59b3a2f2` | S/D/S | target/stale sibling/target | 42/42/42 | 0/2/0 | 0/200/0 |
| 33 | structural assigned/updated 200 | 200 | `931c92c08cbe5e267cb37c50695ba65e032af83ca8c46fae9acd630606d48dd1` | S/D/S | target/stale sibling/target | 72/78/72 | 8/10/8 | 0/400/0 |

The exact current cleanup SQL is
`UPDATE leads SET assigned_to_user_id=NULL WHERE assigned_to_user_id=?` at
`src/lib/app-users.ts:641-647`; it is the only exact current compatibility owner.
Current assignment filters at `src/lib/db/queries.ts:4945-4957` use other sort
contracts and never order by `updated_at`. The three assigned/updated shapes are
structural controls only, not current or durably approved readers.
`getLeadsForExport` accepts those shared assignment filters, but its only
production CSV-route caller passes neither assignment filter. Rows 12/13/26/27
are therefore exact query-function helper-capability controls, not reachable
assigned CSV-route behavior; their 30,720-row primary results are nonbinding
complete-set controls.

## Fresh export-boundary supplement

The factorial fixture did not make the 50,000 and 100,000 export-helper limits
binding. A separate fresh PostgreSQL 16.14 replay closed only that gap. It
replayed 54/52/2 migrations and seeded a positive-only, physically interleaved
two-tenant fixture of 200,010 active, nonexcluded leads: 100,005 assigned to one
shared actor and 100,005 actual SQL NULL. Tenant A contributed 50,003 of each
mode and tenant B 50,002. The actor had active membership in both tenants and
one `app_users` join row. No archived or excluded negatives were added; those
predicate dimensions remain supported by the factorial fixture. Leads remained
tenant-wide with no workspace dimension.

Globally unique scores made every boundary tie count one. Exact assigned ranks
50,000/50,001 were `exp-a-050000` score 900001 and `exp-a-050001` score
899999; ranks 100,000/100,001 were `exp-a-100000` score 800001 and
`exp-a-100001` score 799999. Exact SQL-NULL ranks were `exp-u-050000` score
900000, `exp-u-050001` score 899998, `exp-u-100000` score 800000, and
`exp-u-100001` score 799998.

| Helper control | Rows | Full-row SHA-256 I/D/R | Ordered ID/score SHA-256 I/D/R | Structural SHA-256 I/D/R | Lead owner I/D/R |
|---|---:|---|---|---|---|
| assigned 50000 | 50000 | `580e58b43eb6750c2ab3980b5b81c3535474ade0c60bd9ef76dff7c92e607643` | `693df86368748db63910eb62c7dbed0a4eb8f11e170e81175da899e5f931e8c6` | `7edc62d11b0e4d99657713ed9b7403a0726805dde579f1e4c4b80dacbc273cb1` | enrichment lease |
| assigned 100000 | 100000 | `30a1aca8d0f6489bf2b29fab655d38100a65f95a7923274dd283f232d4ca2caf` | `d45cbae0410084fc9e20d8088c63127f2a4d38b6a634e31ef5fb7b09afff3927` | assigned structure above | enrichment lease |
| NULL 50000 | 50000 | `a17acb37306d090fb6d7896e5f2904abe2922cb26aeeb51d5c209b77de0a6ec2` | `8d668d2c81a19100650e7d1a315036637e386ed037ed3534953bca959ce87b29` | `b9e49f0f888e07fbc85379cdfb84fb26061d348eaadc9aad41ce743555b85434` | enrichment lease |
| NULL 100000 | 100000 | `903338bccd8243d9f2270517c4571598b6f1c3bd47f0ba4dbe91b74d13777512` | `2ab8931d9fa4d437a84c4f2eb162f0750abcacb1518de6044a7d37087aa26fe9` | NULL structure above | enrichment lease |

Every digest and structure in that table was exact installed/drop/rollback.
Every natural lead-side plan selected `idx_leads_enrichment_lease`; the target
was absent in all phases. Installed/drop/rollback catalog counts were 38/37/38,
with index SHA-256
`9e55d52e114948e4a3f66b8c5a03b7ee656f8353a279efd1ca63b6f86a08b80d`,
`06bfdaf1f3899303a9073483498020af70daad6869507b1f8d9b0ab4127077b4`,
and the installed digest again. Constraints remained 10/10/10 with SHA-256
`70c304aed1d4278b9cae78c630d9a4edd264da319e767e98925bb5df896c05dc`.
The target was present/absent/present and exact after rollback.

Raw display telemetry is `hits/reads/removed/output rows/ms`:

- assigned 50000: I `11517/0/100005/50000/244.107`, D
  `11514/0/100005/50000/232.698`, R `11514/0/100005/50000/230.282`;
- assigned 100000: I `11514/0/100005/100000/247.859`, D
  `11514/0/100005/100000/251.466`, R `11514/0/100005/100000/242.176`;
- NULL 50000: I `11514/0/200010/50000/239.628`, D
  `11514/0/200010/50000/245.072`, R `11514/0/200010/50000/239.178`; and
- NULL 100000: I `11514/0/200010/100000/246.699`, D
  `11514/0/200010/100000/252.136`, R `11514/0/200010/100000/250.161`.

Those values are display corroboration only, not causal or benchmark evidence.
The target was not required by these four helper plans; that does not establish
general redundancy or removal safety.

The first supplement database on port 55439 seeded successfully but stopped
before any plan/result phase with SQLSTATE `42883` because the chain did not
provide `digest(bytea, unknown)`. The entire database/container was discarded
and contributed zero evidence. The authoritative fresh retry on port 55443 used
`pg_catalog.sha256(bytea)`. Host `psql` fallback and a protected broad `/tmp`
scan were corrected respectively with container `psql` and a scoped
max-depth-one scan. A later plan-only display replay on the same successful,
restored database repeated target drop/rollback and then reasserted all catalog
and result phases; it is corroboration, not a new authority or projection.

Root independently reproduced the supplement on a second fresh PostgreSQL
16.14 database at port 55447 with the same 54/52/2 replay, 100,005/100,005
eligibility, and eight rank/score boundaries. Its separately generated IDs and
payload produced projection-local full/order SHA-256 pairs
`108f5160a8eb61beb2da38abc515af99eed29b8d102100ea9b60339ab0ebd20e` /
`c97dcfc395d0ad2eaf1f7e2ee81cff9ab8469ef832ad23541202fd09f7e877d7`,
`455bcb738e5bdff3aad6b0d4d5587cef81da6dfa5e3009839f6acdc8b2557fde` /
`eac1936fdd31730aa341ef358f3081abbface38237a994b4d58b554e5c4d878e`,
`8bc9cd9dd0730639c56a4726c0fbf9c7c67de409988f6fbc264f4d4cf7d1d9e1` /
`44ab5e8f1c62f9399aa772a80f614801942219d821b79a2d053a56756996f977`,
and
`8b4d44e17aa7355c63e322abc2ab2483b79363f610eb2bd49af442e45ecfabb6` /
`9fa894e0710226e6caa8d59cb6bc70a471d7bbe40ba1ad003fc01ea76a549c1c`;
each was exact I/D/R. Its assigned and NULL structural SHA-256 values were
`6f7b03867369e8f6bde7f2037cf28b964af64ee3de1926b672a4f95c3a937c81`
and `b5a32bc2aa9c3073123b7dac88bb7cd3b653bec3b5ddeed2ac8770449793fdcc`
in every phase. The lead-side owner remained enrichment lease, the app-user join
used its unique key, and the target was absent. Its projection-local index
catalog restored at 38/37/38 with installed/drop SHA-256
`058c8662dcf544bdde4d1fe3d2a4f5224864699acfdf8f7606c5a8cc9d747084`
and `ccb02dbadad36916c65382882ece311847bb5ad8a0d25c9da4800886e755ba6b`;
10 constraints retained SHA-256
`ded5fb96e599ab7028928609c3e78500164171c420afda9186a8b897848618da`.
These digests are not compared to the first supplement's different
fixture/projection. Root removed its container and temporary harness; the
transient port 55447 teardown listener closed on bounded recheck.

## Mutations and cleanup materiality

PK assign and claim each changed one row, were `leads_pkey`-owned in all phases,
and produced state SHA-256
`be406ab55e19279b4e6f4807fa25fffa7b5a39b034d46d2ac1a6a5ba3caa03c9`.
Their structural SHA-256 values were respectively
`4b9f444766d9b590543e7998790a1b5e66c0e0dd370b54fe8902b9fcd6ad8354`
and `2b36ac6617520a91f09b59a94ba0c452daee884fac42a23b668a76dfde2ab5ef`.

Local cleanup set 61,440 tenant-local assignments to NULL, leaving 184,320
NULL assignments and zero rows for that local actor. Installed/restored used the
target with structural SHA-256
`bf27bfbc1d905a19ea269f8881da792b67b23a8573d47ace86d1d45c33e643f8`;
drop used a sequential plan with
`81dae3474e48b44dc7b0aca651e5c82d07d8dc34c645e834fed21229eb2fca6f`.
The compact state projection SHA-256 was
`d042b5506e8a9f1366833abece9a80c4ca3df1677c0ba35fcd97b351d2787237`;
the primary audit's differently shaped combined-count projection was
`1ee3f1ca25811ad0b9ebb6cf669d119d686cb987940c77335f7e66db942e5f4d`.
The row outcome was exact in both. After `VACUUM FULL`, all phases touched about
21,680 heap blocks and measured 64.213 ms installed, 67.713 ms dropped, and
51.530 ms restored. This corroborative single-machine result is not a material
advantage or benchmark claim.

A rollback-only local `DELETE FROM auth.users` produced the expected SET NULL
outcome with state SHA-256
`8f981cd02b3bc95e00e9838647e7d6dea9259270d7df6c77bbf7779a17bef4bc`
and structural SHA-256
`ae4160e2950d3acfb901ee93b2011676c9b8a08dde223234e05cf23a057875d6`.
The visible top-level owner was `users_pkey`; nested RI work was not exposed and
no target FK-support attribution is claimed. The audit did not invoke the
remote-Auth-first `removeUserAction` and does not accept global identity deletion
as a tenant membership-removal contract.

## Validation, invalid history, and cleanup

Root independently passed focused behavior 75/75, TypeScript, focused ESLint,
recovery verification over 37 application tables, Fedora-portable SQLite
coordinator 12 passed/26 native-Windows skipped, production build 11/11 pages,
fresh PostgreSQL G-002 2/2, G-003 6/6, and T-029 19/19, plus full-ledger JSON
parsing and `git diff --check`. Windows-only durability tests were not run on
Fedora; historical Windows 111/111 evidence remains unchanged.

After the supplement, root also passed the proportional statistics and lead-
exclusion helper suites 14/14 and independently reproduced all four binding
export controls on a second fresh PostgreSQL 16.14 database.

Invalid or superseded audit invocations are preserved:

- the initial fixture assertion expected 184,320 rows instead of the exact
  368,640 factorial and was discarded with its database before a fresh retry;
- the temporary harness briefly landed at repository root, was moved to `/tmp`
  before execution, and left no worktree change;
- host `psql` was unavailable and the audit was rerun through container `psql`;
- a generic derived `target_effect` field was rejected as causally invalid and
  excluded from every authoritative receipt;
- a proposed force-style temporary cleanup command was rejected before
  execution and replaced by explicit graceful cleanup; and
- the first compact corroboration stopped at matrix start on temporary harness
  spacing `$1AND`, SQLSTATE `42601`; that database was dropped and a fresh empty
  database replayed the entire chain; no replay, seed, or result evidence from
  the failed database was reused.

Evidence authority is projection-specific. Fresh retry1 is authoritative for
its 368,640-row factorial fixture, larger semantic catalog projection, 33-shape
reader matrix, canonical installed/drop/rollback results, installed/restored
structural fingerprints, and separately labelled high-volume telemetry. Fresh
receipt2b is the final authority for its compact four-checkpoint projection and
exact named comparable receipt fields, including its own catalog projection,
rejection and mutation outcomes, and cleanup phases. Overlapping semantic
outcomes corroborate one another, but hashes are compared only within the same
harness and projection; no cross-projection digest equality is claimed. Invalid
initial arithmetic, the rejected `target_effect`, and the failed compact
invocation are excluded.

The fresh export supplement is authoritative only for its separate positive
binding fixture and within-supplement installed/drop/rollback digests. It closes
the four helper-limit boundaries but neither replaces nor changes the factorial
33-shape matrix. The failed port-55439 database contributes no evidence.

Independent test/evidence and architecture/authority reviewers report no
P0/P1/P2. The crosswalk becomes 40 classified/22 unclassified; G-002 remains
13/0 and G-003 becomes 17/22. Counts remain 54/52/2, sequence
`202607310010` remains free, and parent G-007 remains open.

All audit and root-gate containers, databases, ports, scripts, task processes,
and temporary artifacts are removed. The baseline was clean before receipt
authoring; after runtime cleanup, the only worktree changes are this pending
five-file durable receipt. Main and the handoff tag remain unchanged. No extra
worktree, hosted Supabase, remote migration, provider, deployment, push, PR,
credential, customer-data, outreach, or other external activity occurred.
