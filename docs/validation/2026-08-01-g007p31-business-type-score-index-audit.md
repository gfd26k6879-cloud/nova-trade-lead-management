# G-007P31 business-type score-index audit

Date: 2026-08-01

Baseline: `68df67d9c7aad416e6cab1a12675a01c44da1b76`

Status: accepted RETAIN; no migration

## Decision

Sol accepts RETAIN for the exact healthy historical PostgreSQL definition and
the frozen SQLite compatibility definition of
`idx_leads_business_type_score(business_type, score DESC)`. The exact decision
is
`retain_healthy_historical_postgres_business_type_score_independently_reproduced_measured_reachable_canonical_local_services_score_order_plan_owner_and_frozen_sqlite_compatibility_definition_no_target_attributable_tenant_index_defect_no_removal_basis`.

The large shared `plumbing` admin Leads/Kanban/Explore/map/CSV shapes and
researcher Leads/Explore/map shapes naturally used accepted sibling indexes and
were target-neutral. Researcher Kanban redirects and researcher export is
permission-denied; neither is represented as executed SQL. Target neutrality in
those shapes does not make the index redundant. The measured reachable
canonical `local_services` equality plus score-order query-function shape at
limit 100 naturally selected the target;
target-only transactional drop increased the primary fixture from 8,597 to
40,173 shared buffer hits and from zero to 128,353 filtered rows, with 5.664 ms
installed, 25.560 ms dropped, and 4.840 ms restored. Root independently
reproduced target selection for the same canonical literal and a target-absent
scan over 100,013 nonmatching rows on a separately generated fixture. Raw
timing is corroborative only; exact plan ownership, buffers, filtered rows, and
rollback restoration establish current literal-family support.

No current application query uses business type or score as tenant or workspace
authority. The explicit future tenant-filtered measurements are controls only
and cannot authorize DDL before G-011/G-017. SQL NULL, empty text, and literal
`local_services` remain distinct for equality; aggregate readers that coalesce
NULL to `local_services` retain query-semantic debt, not an index defect. No
tenant-prefixed candidate, migration, replacement, removal, or test edit is
accepted.

## Source, replay, and catalog

The target originates at
`supabase/migrations/202605110001_full_schema.sql:307`, origin commit
`0c80c1e831b0e95e0007fdb5ee0bd1bfce87da6c`, with current file SHA-256
`1bf0c081317077e52cf313a5d59fb4ef68bd7442318e0ff452b3c778c1a84033`.
SQLite mirrors the definition at `src/lib/db/schema.ts:2082`; this audit made no
fresh SQLite health or plan claim and did not run Windows-only evidence.

Fresh PostgreSQL 16.14 used local image ID
`de3a4eab8fdfa507ea92aac488b916b08089e515db49b055fe71dfa271ba3a28`
and digest
`sha256:7a396fd264a2067788b6551122b50f162bf6136312c7fc9d74381cb92c648382`.
It replayed 54 discovered migrations: 52 applied and the two named pg_net/pg_cron
runtime migrations were skipped. The tracked
post-chain `IF NOT EXISTS` source-statement replay was exact before and after;
name-only replay was not treated as definition proof.

The live target was the sole reserved and sole semantic candidate:

```sql
CREATE INDEX idx_leads_business_type_score
ON public.leads USING btree (business_type, score DESC)
```

It was an ordinary, nonunique, nonprimary, nonexclusion, immediate, valid,
ready, live btree with two key and two total attributes. `business_type` was ASC
NULLS LAST using `text_ops` and its resolved column collation; `score` was DESC
NULLS FIRST using `float8_ops` with no collation. Raw `indoption` was `0 3`.
There was no INCLUDE column, predicate, expression, constraint owner, alternate
semantic duplicate, or search-path ambiguity. `business_type` is nullable text
with default `local_services`; `score` is non-null double precision with default
zero. The post-fixture target measured 7,192,576 bytes; no pristine-size claim
is made.

The matrix/session/spoof harness SHA-256 values were respectively
`0b1ab7b552a02253c09f0d3661a80be8da4679a0e9f098b56be8bf2774176401`,
`538a04004ed946781ba339e165a3e08d6b6a9b21a1bceefd6215b3c9f4388673`,
and `9ce3ef05056cf9449a1019e4b8c327df1cf7d342b92ee4bd7f4cbc4692d279d3`.
Their raw result-receipt SHA-256 values before verified cleanup were
`1a53fa5a1f8089ef035b6b66fbdaf9968e37b6ef863b6bf5521dd0b9c657a6e0`,
`91f5e28313021da9db3206366f35e9ab7f4f4a278066a0175edd41e19cd8178f`,
and `9daa0d654a10de11473f1d20a5f9766a2ddefaf46a430ffe645b65154004e146`.
Raw-session recovery independently rehashed the 14,361-byte matrix TSV as
`60ebaa50f8d3a9ad3f3a97a832e8769622a9945e24b962402e7813e512a435ca`
and the 8,718-byte session TSV as
`7d0a0ed7c814b8f5fc03379dc947f754d9ba5a46484943fbb80a0c0c9d52266e`.

The final session projection held 38/37/38 lead indexes with SHA-256
`5d2dfc9f529cc100cf05649d75bcc4108e8aa019d07148fed6d2d05e66cff259`,
`6ad07a4a5d5db2930d58f7cca1bd5e3c935467391357feffa63ccd00f4c0a41b`,
and the installed digest again. Lead constraints remained 10/10/10 with
SHA-256
`8b6590c7539da40600106368d7a187e6dcfd1bbf1a28c99eba86d01f30d28365`.
The broader family projection independently held 38/37/38 indexes with
installed/restored SHA-256
`1b5f4b5d6e0f39c6aef1f0c93e196cac02c5ebdfc554956ec4592b5acfa2bd1f`
and dropped SHA-256
`6a35e51ae735ad9199eb909fd4abc3bc57c1d52a6e4f66673061f28b7a30b5b1`.

## Authoritative fixture and boundaries

The primary deterministic fixture contained 160,010 physically score-
interleaved leads, exactly 80,005 per tenant, with no workspace dimension.
There were 120,010 active, nonexcluded rows for the shared literal `plumbing`.
After correcting a nonbinding researcher-map preflight, 3,612 shared rows had
coordinates: 1,204 were admin-unassigned and 602 were researcher-visible and
unassigned. The remaining controls included 6,665 SQL-NULL business types,
6,665 empty strings, 6,664 literal `local_services`, 19,994 other literals,
19,995 archived rows, 19,994 excluded rows, and a complete 12-row score tie.
Status, quality/AI state, assignment, market, location, discovered-time,
archive, exclusion, tenant, and business-type states were represented and
cyclically exercised. Status/assignment, quality/AI, and tenant/market
dimensions were intentionally correlated by their seed cycles; no independent-
factorial or explicit `updated_at`-variation claim is made.

Shared score boundaries, all with tie count one, were:

| Rank | ID suffix | Score |
|---:|---|---:|
| 1 / 2 | `000001` / `000002` | 999999 / 999998 |
| 25 / 26 | `000025` / `000026` | 999975 / 999974 |
| 50 / 51 | `000050` / `000051` | 999950 / 999949 |
| 60 / 61 | `000060` / `000061` | 999940 / 999939 |
| 100 / 101 | `000100` / `000101` | 999900 / 999899 |
| 120 / 121 | `000120` / `000121` | 999880 / 999879 |
| 200 / 201 | `000200` / `000201` | 999800 / 999799 |
| 600 / 601 | `000600` / `000601` | 999400 / 999399 |
| 1000 / 1001 | `001000` / `001001` | 999000 / 998999 |
| 50000 / 50001 | `050000` / `050001` | 950000 / 949999 |
| 100000 / 100001 | `100000` / `100001` | 900000 / 899999 |

The ID prefix was `g007p31-shared-`. Admin-unassigned map boundaries were
`000600/000603`, `001800/001803`, and `003000/003003` at ranks 200/201,
600/601, and 1000/1001. Researcher-visible unassigned map boundaries were
`001200/001206` and `003600/003606` at ranks 200/201 and 600/601. Every map
boundary also had tie count one. The separate `tie_service` cohort queried all
12 members at score 200000 and never treated a partial tie as ordered evidence.

The first seed transaction correctly rejected an assignment before the required
active tenant membership existed with SQLSTATE `23514` and
`G003_ACTIVE_SAME_TENANT_ACTOR_REQUIRED`; it rolled back to zero tenants, Auth
users, and leads. The corrected retry on that fully rolled-back database added
the required active memberships and three `app_users` join rows before
reinserting the fixture.

## Exact current and control matrix

The primary audit first ran 31 helper, family, aggregate, CSV, and future-tenant
measurement shapes. That pass was internally exact but was deliberately not
used for disposition until source review corrected three live bindings:

- Kanban is admin-only and passes `includeExcluded:true`;
- Explore list/map force `assigned='unassigned'`, while researcher Explore also
  adds visible-market narrowing; and
- the live map route uses `fastOrder:true` and `includeTotal:false`.

The corrected authoritative 21-shape session matrix covered admin Kanban count
and list, researcher Leads count/list, researcher-constrained business counts,
admin and researcher Explore list pages, admin and researcher fast maps at 200
and 600, default-opportunity negative list/map forms, empty input with no
business equality, literal-empty equality, literal `local_services`, coalesced
counts, and exact NULL/empty adversary counts. Researcher Kanban redirect and
researcher export permission denial were source negatives only; no nonexistent
SQL execution was claimed. The broader 31-shape pass retained exact binding CSV
50,000/100,000, helper getLeads 1/100/200, normal maps 200/600/1000, quality,
AI, competitor fallback, business counts, all-time/bounded statistics, complete
tie, excluded, and tenant measurement controls.

The authoritative session receipt is bound by raw SHA-256
`91f5e28313021da9db3206366f35e9ab7f4f4a278066a0175edd41e19cd8178f`.
Every row below had exact I/D/R canonical results and exact I/R structure. The
digest and structure columns are the installed values; `target` records natural
selection of `idx_leads_business_type_score`.

| Shape | Limit/offset or result rows | Natural owners | Target | Result SHA-256 | Structure SHA-256 |
|---|---:|---|:---:|---|---|
| admin Kanban count, include excluded | 1 row | none | no | `c7e1d90752efdc9a6c3c3e2d3dd4074d080257b572562a7a4aadc89624798720` | `2e1785c84bf6ae3e666a55f197600a8ff6f0d8062c57049b05c5887523076325` |
| admin Kanban list, include excluded | 100/0 | score, app-user join | no | `20be4efbdea524a1b35511c34d0cf22776bba3d1786136ed32822e87935c9dd5` | `446359878bc908d02d13f6793cc7931964d8f72918f3e9c31f332070e4f8f5d1` |
| admin Explore score page one, forced unassigned | 60/0 | enrichment lease, app-user join | no | `3d0a76fc237c0adfca2ab34c4975a0184ba3f81c98153bf1a4f648aeb0201aaf` | `164315904e384f619ed29fa6beacbf5355eedc0c997bb015ab3bb0f4e793996d` |
| admin Explore score page two, forced unassigned | 60/60 | enrichment lease, app-user join | no | `a1d1894ca55424c2539012967a91524cf9ed7bc7fe969f3f97e7e1d68be6528c` | `edfb56d4960159c60607f6f7c56f1f52b49ca7234683c702cd1dfc6d72349c4c` |
| researcher Explore page one, forced unassigned/visible | 60/0 | enrichment lease, app-user join | no | `ae488b84e9d27044dbafca5fa25d97dec46e8c8e7b336dc453abfebdac3a9bca` | `758e36af33634869efeb5df2228a1891f930e62abd79f09fade103fca1886d31` |
| researcher Explore page two, forced unassigned/visible | 60/60 | enrichment lease, app-user join | no | `e04e3f0db4f6c8aec13fc195bee795e26b5d7e904f02d23ca597849230303332` | `b8834888c7c9c31096768567358c60959bbde7c7773b5ae20d7f59478bbe31f5` |
| admin fast map, forced unassigned | 200/0 | enrichment lease | no | `5ad4fa156b380261d4153befa71c002b94592358dd01a694bbbc25d45aa755e4` | `b2edd563f04c4ab145e518933b72f4c043122f86673420cdedbbec8726b6d4cd` |
| admin fast map, forced unassigned | 600/0 | enrichment lease | no | `bf63e44c5687d46f48f5c62d863db922da11505a16d210d68f6dc1660ab29c9b` | `dd8afc1287e6316e9ba39784fcd0f6dd66846f944c05aadba3c2b3a7e5fdcee7` |
| researcher fast map, forced unassigned/visible | 200/0 | enrichment lease | no | `1569035e4fc4c98cebf9f0bf83542dab689529dd45ff64bffecfb16b823c5329` | `f99b7d5139ba299aa2d0762773205f0c5e51caac20505f5ea4095c676bfbdf3d` |
| researcher fast map, forced unassigned/visible | 600/0 | enrichment lease | no | `a881228e37edd70a25239f1a86643ba73d1b5eb24edd0b32b734fe2b3f3e1173` | `99504e7131989151d4430b40ca56872fa8dfd3bfeaf4252e67f2d780b73638eb` |
| default Explore opportunity negative | 60/0 | enrichment lease, app-user join | no | `fa24022cd7ac99752df12457e63bb4ef7751d78130b277ce70906c4ecf0626ec` | `b23db45072c7163ba030cb5eb328865caa65a336cc3109336608e27cc91f7f2d` |
| default fast-map opportunity negative | 600/0 | enrichment lease | no | `1c7bfcc2d33bf1e79831178bd406e3b7aac4483246f5ba685606f8661196adfd` | `dfbca3600193972f44703edf95bdb4c5d3be09c931ea2d1a3ec2afe42fac8e5b` |
| empty business input, no equality | 100/0 | enrichment lease | no | `26f0780e93eb493a7a07d6ea4f880ba60f95d464d518d40a6293e1b0324c6a6a` | `f82b9b3ec72d348f70f45c36dc67d5b5fa9e711c8962ea1febc2019cb24fd281` |
| literal empty business equality | 100/0 | enrichment lease, target | yes | `23dfba715f1543b4569767e90053a060bfbcb4f1ceb157b3cb80e9be8abb7c29` | `32c969a1982e728de017b5751960712f7ffedd0ac83d3a2df8c52f1446b1f781` |
| literal `local_services`, NULL excluded | 100/0 | enrichment lease, target | yes | `4709d1556acdfa8fa87ca914be3153e13a72f4fdf1be621f3292d56dbd03b345` | `c9a49b6974aa65427241f64d19b6dec460b43e17e8c39875e8baf4cd68a9a252` |
| coalesced business counts | 7 rows | enrichment lease | no | `8a52a17d85c155abf713029870dc8fad95840aed6d6a7fbec03511646ea9eb18` | `9236fe68458e35b918d2a9ee1879b6f6768a8142a4663c512a922f3c5649b9ab` |
| exact SQL-NULL adversary count | 1 row | enrichment lease, target | yes | `26f84d507f72b1c9f6258c241fa822815c0ddb86fe690185015cd529370b8ba7` | `4efe0a80c2519209dc6efa7f46d82fccfde6c11fd2a9ab20125db7100b51bd09` |
| exact empty-text adversary count | 1 row | enrichment lease, target | yes | `26f84d507f72b1c9f6258c241fa822815c0ddb86fe690185015cd529370b8ba7` | `c6ee9293d5ba73e42ede5953743b2b2783d185423c9f9cc5b5a0eb9fc3dbc803` |
| researcher Leads count, self plus visible market | 1 row | enrichment lease | no | `3f458beb3fe0b344f340a2f6b4a3f65f2ccd0949d79384fdb0fe4790c4340a17` | `c565337d19103e145a59f9d99b73071fa774f3e39b0e5949e0ed11df30d635df` |
| researcher Leads list, self plus visible market | 25/0 | enrichment lease, app-user join | no | `16b2524accd07515238b31e3ec9d0fb5055dcf53e40abdbebf8472634cad0273` | `f7239586df5ec59de3e4267fb3549c05e65a4bab6ee30a50ad3c2e473e73dffe` |
| researcher business counts, self plus visible market | 3 rows | enrichment lease | no | `99291e255e2c16f88032c3bded887d769035861338dbc90f48d8382b691c344a` | `9a719f9e31fafafd624d3d286706e966b34f2a92e9696cc82e664e2dc9913638` |

Those three fields were recovered without reconstruction from the raw deleted-
artifact payload in Codex session `019fba9a-d2f2-7261-b3af-b13167e89bee`,
cleanup event line 10965. Each owner and structure was identical I/D/R, results
were exact I/D/R, and the target was absent. The broader matrix raw receipt
SHA-256
`1a53fa5a1f8089ef035b6b66fbdaf9968e37b6ef863b6bf5521dd0b9c657a6e0`
binds these 31 named shapes: `default_count`, `helper_getLeads_1`,
`live_leads_25`, `live_leads_page2_25`, `helper_getLeads_100`,
`helper_getLeads_200`, `explore_score_60`, `explore_score_page2_60`,
`kanban_100`, `export_50000`, `export_100000`, `map_count`, `map_fast_200`,
`map_fast_600`, `map_normal_200`, `map_normal_600`, `map_normal_1000`,
`ai_candidates_100`, `quality_summary`, `quality_removed_website`,
`quality_competitor_list_50`, `quality_ai_100`, `quality_action_ids_100`,
`business_type_counts`, `statistics_business_all`,
`statistics_business_bounded`, `excluded_score_control`,
`complete_tie_control`, `tenant_a_list_100`, `tenant_a_map_600`, and
`tenant_a_export_50000`. This pass had exact I/D/R results and exact I/R
structures for every named row. The raw deleted-artifact payload in Codex
session `019fba9a-d2f2-7261-b3af-b13167e89bee`, cleanup event line 10965,
preserves the complete matrix manifest below. Columns are shape, result rows,
I/D/R natural owners, I/D/R shared buffer hits, reads, rows removed, temporary
reads, temporary writes, elapsed milliseconds, exact I/D/R result SHA-256, and
I/D/R structure SHA-256. Timing remains noncausal.

```text
shape\trows\towner_I\towner_D\towner_R\tshared_buffer_hits_I_D_R\treads_I_D_R\trows_removed_I_D_R\ttemp_reads_I_D_R\ttemp_writes_I_D_R\tms_I_D_R\tresult_sha256_I_D_R\tstructure_I\tstructure_D\tstructure_R
ai_candidates_100	100	idx_leads_enrichment_lease	idx_leads_enrichment_lease	idx_leads_enrichment_lease	39930/39930/39930	0/0/0	40011/40011/40011	0/0/0	0/0/0	141.041/142.18/141.548	f27c035071e126e95d6b165683ce749951f732e210a64a356acc4bd494ef3e0d	84b9c7d1f43227e771127ecaf0dd8730b5d9b2ae22d318ceb7973ad6ad24c5a2	84b9c7d1f43227e771127ecaf0dd8730b5d9b2ae22d318ceb7973ad6ad24c5a2	84b9c7d1f43227e771127ecaf0dd8730b5d9b2ae22d318ceb7973ad6ad24c5a2
business_type_counts	7	idx_leads_enrichment_lease	idx_leads_enrichment_lease	idx_leads_enrichment_lease	26620/26620/26620	0/0/0	0/0/0	0/0/0	0/0/0	62.501/65.248/54.27	8a52a17d85c155abf713029870dc8fad95840aed6d6a7fbec03511646ea9eb18	740854a18d9a642b342ab8b463d70e0e64ef493a7621262257ca3ba99e2b244b	740854a18d9a642b342ab8b463d70e0e64ef493a7621262257ca3ba99e2b244b	740854a18d9a642b342ab8b463d70e0e64ef493a7621262257ca3ba99e2b244b
complete_tie_control	12	idx_leads_business_type_score+idx_leads_enrichment_lease	idx_leads_enrichment_lease	idx_leads_business_type_score+idx_leads_enrichment_lease	3233/39930/3233	0/0/0	0/130007/0	0/0/0	0/0/0	3.22/27.719/3.889	32058b7473a86c94acc762c65bcd03453bc5d08195502ad25dd6623b1b362787	659aadcea82f7870c8c6a4cdc6bd8a78578a44e95ce5363fea8a1a8b286658da	ea5cf9b0bfd2d29ca7ed778bea6ad6ab5ac7564130168fbc5d3a880a343653dc	659aadcea82f7870c8c6a4cdc6bd8a78578a44e95ce5363fea8a1a8b286658da
default_count	1	idx_leads_enrichment_lease	idx_leads_enrichment_lease	idx_leads_enrichment_lease	26044/26620/26620	576/0/0	10009/10009/10009	0/0/0	0/0/0	35.646/34.224/40.768	c7e1d90752efdc9a6c3c3e2d3dd4074d080257b572562a7a4aadc89624798720	499537a81e53232771fba7484dee9bce65c04dc7eca8a3257cf081f5f6eaf176	499537a81e53232771fba7484dee9bce65c04dc7eca8a3257cf081f5f6eaf176	499537a81e53232771fba7484dee9bce65c04dc7eca8a3257cf081f5f6eaf176
excluded_score_control	100	idx_leads_business_type_score		idx_leads_business_type_score	8188/42322/8188	0/0/0	4999/52781/4999	0/0/0	0/0/0	3.674/30.98/3.712	89f510b646f42392cefbe81cd107b10f9c44384410818beccd93bf19c9b9de5b	2fd272392732bd22f743efc4b280d04789f456ff1b38427bd74f551e3f97ebee	34554bf606fc0a013b3802fd85033ed31e3926d2359d0bb5fdee270c841a4e7e	2fd272392732bd22f743efc4b280d04789f456ff1b38427bd74f551e3f97ebee
explore_score_60	60	idx_leads_enrichment_lease+app_users_user_id_key	idx_leads_enrichment_lease+app_users_user_id_key	idx_leads_enrichment_lease+app_users_user_id_key	53270/53270/53270	0/0/0	10009/10009/10009	0/0/0	0/0/0	187.316/187.228/192.25	bc9280eb070b9ef2274dcd9cd1d6e441b3fabe0aca3c7997bcf046ca15a9db93	08fcbd79160ebb7a414bfefe96a508ddbb17e03eff938a087f28be68be37c1f4	08fcbd79160ebb7a414bfefe96a508ddbb17e03eff938a087f28be68be37c1f4	08fcbd79160ebb7a414bfefe96a508ddbb17e03eff938a087f28be68be37c1f4
explore_score_page2_60	60	idx_leads_enrichment_lease+app_users_user_id_key	idx_leads_enrichment_lease+app_users_user_id_key	idx_leads_enrichment_lease+app_users_user_id_key	53270/53270/53270	0/0/0	10009/10009/10009	0/0/0	0/0/0	186.072/186.113/192.223	90a4f8f2521d6d7217f4e8bc98d0dd207785a3e428d1d75668b8994935d9ecc8	7ef82af622f54efcaa7a29482038b6314b45768cb842344ff606e089b76e60ee	7ef82af622f54efcaa7a29482038b6314b45768cb842344ff606e089b76e60ee	7ef82af622f54efcaa7a29482038b6314b45768cb842344ff606e089b76e60ee
export_100000	100000	idx_leads_enrichment_lease+app_users_user_id_key	idx_leads_enrichment_lease+app_users_user_id_key	idx_leads_enrichment_lease+app_users_user_id_key	53270/53270/53270	0/0/0	10009/10009/10009	27538/27538/27538	30084/30084/30084	383.291/395.105/414.436	a31ed6d2575d2ad2dae854179f862de217440b538d2155ce4ba48addd61c883e	03e9e3e48ce7e180eac4040ac24c28a0f57397d6ad53f60a51894a88451090ff	03e9e3e48ce7e180eac4040ac24c28a0f57397d6ad53f60a51894a88451090ff	03e9e3e48ce7e180eac4040ac24c28a0f57397d6ad53f60a51894a88451090ff
export_50000	50000	idx_leads_enrichment_lease+app_users_user_id_key	idx_leads_enrichment_lease+app_users_user_id_key	idx_leads_enrichment_lease+app_users_user_id_key	53270/53270/53270	0/0/0	10009/10009/10009	21920/21920/21920	30084/30084/30084	377.95/397.129/379.547	b84f1d355a9bdc79d6232c923e35e1364e89d7b15c5819d3b75aa2f9c3f04974	03e9e3e48ce7e180eac4040ac24c28a0f57397d6ad53f60a51894a88451090ff	03e9e3e48ce7e180eac4040ac24c28a0f57397d6ad53f60a51894a88451090ff	03e9e3e48ce7e180eac4040ac24c28a0f57397d6ad53f60a51894a88451090ff
helper_getLeads_1	1	idx_leads_score+app_users_user_id_key	idx_leads_score+app_users_user_id_key	idx_leads_score+app_users_user_id_key	18/18/18	0/0/0	0/0/0	0/0/0	0/0/0	0.127/0.106/0.105	6c55d3f4c86207572639006f97d7353ec12ff8f9ee9e6682ac0cda3c79ef4859	08f84e71304ad3731f7602947f4c0678dc29f643447c6379d237ec38012dbd9a	08f84e71304ad3731f7602947f4c0678dc29f643447c6379d237ec38012dbd9a	08f84e71304ad3731f7602947f4c0678dc29f643447c6379d237ec38012dbd9a
helper_getLeads_100	100	idx_leads_enrichment_lease+app_users_user_id_key	idx_leads_enrichment_lease+app_users_user_id_key	idx_leads_enrichment_lease+app_users_user_id_key	53270/53270/53270	0/0/0	10009/10009/10009	0/0/0	0/0/0	183.862/187.194/191.441	298dabe86db1b3dfafcaf9baba36e05899eb11930e61255d8c0f621560583c92	0142d3de73e94cbbb9226d6d5796ee7e70fa13a4d33bd66eaa449b009d9b3e7c	0142d3de73e94cbbb9226d6d5796ee7e70fa13a4d33bd66eaa449b009d9b3e7c	0142d3de73e94cbbb9226d6d5796ee7e70fa13a4d33bd66eaa449b009d9b3e7c
helper_getLeads_200	200	idx_leads_enrichment_lease+app_users_user_id_key	idx_leads_enrichment_lease+app_users_user_id_key	idx_leads_enrichment_lease+app_users_user_id_key	53270/53270/53270	0/0/0	10009/10009/10009	0/0/0	0/0/0	186.762/189.927/192.552	c968a88d16fafc54d30fa0ca5c50fd3393dbbbcbc21368ebfc34fe4bf8d10229	b1d2b33bd2de1a264dd4dcc984d6e5c2618da6133e23bacf2f795cc6fcfd8653	b1d2b33bd2de1a264dd4dcc984d6e5c2618da6133e23bacf2f795cc6fcfd8653	b1d2b33bd2de1a264dd4dcc984d6e5c2618da6133e23bacf2f795cc6fcfd8653
kanban_100	100	idx_leads_enrichment_lease+app_users_user_id_key	idx_leads_enrichment_lease+app_users_user_id_key	idx_leads_enrichment_lease+app_users_user_id_key	53270/53270/53270	0/0/0	10009/10009/10009	0/0/0	0/0/0	121.72/119.496/125.26	20be4efbdea524a1b35511c34d0cf22776bba3d1786136ed32822e87935c9dd5	5b70a42d5450bdb2b8a3f015347ec36e6daa134703d4aa0b6cb7a81587f061de	5b70a42d5450bdb2b8a3f015347ec36e6daa134703d4aa0b6cb7a81587f061de	5b70a42d5450bdb2b8a3f015347ec36e6daa134703d4aa0b6cb7a81587f061de
live_leads_25	25	idx_leads_score+app_users_user_id_key	idx_leads_score+app_users_user_id_key	idx_leads_score+app_users_user_id_key	117/117/117	0/0/0	0/0/0	0/0/0	0/0/0	0.155/0.131/0.18	3f0325f6912357fd126549bf4844d7b53c123cb7ca16f573d2005cdb518d9d05	be954e5626f8b66c73becc25492a884deb17cb8acba154e0ceea8b081181b6e4	be954e5626f8b66c73becc25492a884deb17cb8acba154e0ceea8b081181b6e4	be954e5626f8b66c73becc25492a884deb17cb8acba154e0ceea8b081181b6e4
live_leads_page2_25	25	idx_leads_enrichment_lease+app_users_user_id_key	idx_leads_enrichment_lease+app_users_user_id_key	idx_leads_enrichment_lease+app_users_user_id_key	53270/53270/53270	0/0/0	10009/10009/10009	0/0/0	0/0/0	185.969/183.62/191.073	a48a44bb91926c32a571d6c1920b7780f0f32c7fab7221e3ae692135f9fa49b5	c3154237b53be1c3fbc936ed7fc62cd0fa23be3cd458388b82e3633c6c67d623	c3154237b53be1c3fbc936ed7fc62cd0fa23be3cd458388b82e3633c6c67d623	c3154237b53be1c3fbc936ed7fc62cd0fa23be3cd458388b82e3633c6c67d623
map_count	1	idx_leads_enrichment_lease	idx_leads_enrichment_lease	idx_leads_enrichment_lease	26620/26620/26620	0/0/0	128819/128819/128819	0/0/0	0/0/0	25.352/25.709/27.759	94a689f447c8754179bc4ebbd752c0b6ae3cbecd5371d3ddb529110c30df8c54	0672935964c161d2e5b0cf886616c5602bd3986d2681340310c901a06ac5a863	0672935964c161d2e5b0cf886616c5602bd3986d2681340310c901a06ac5a863	0672935964c161d2e5b0cf886616c5602bd3986d2681340310c901a06ac5a863
map_fast_200	200	idx_leads_enrichment_lease	idx_leads_enrichment_lease	idx_leads_enrichment_lease	53245/53245/53245	0/0/0	128819/128819/128819	0/0/0	0/0/0	26.241/26.414/28.321	b216d0aa7adcc8de40c78a9193109041644010a2d8f1af0957c390e3a239f20b	c35bdfed63f7b4211271159105e81995db236be683d5922bcd56ca9703c7fb35	c35bdfed63f7b4211271159105e81995db236be683d5922bcd56ca9703c7fb35	c35bdfed63f7b4211271159105e81995db236be683d5922bcd56ca9703c7fb35
map_fast_600	600	idx_leads_enrichment_lease	idx_leads_enrichment_lease	idx_leads_enrichment_lease	53245/53245/53245	0/0/0	128819/128819/128819	0/0/0	0/0/0	25.811/27.004/27.748	5e91c30fe697c4d43f8807034fb50002fd3a709ab89c54e165fbb9c4067f31f7	72bacba59150e247555eed25dfc7891f15074d4962ecdd1cccdbd619c474d1a2	72bacba59150e247555eed25dfc7891f15074d4962ecdd1cccdbd619c474d1a2	72bacba59150e247555eed25dfc7891f15074d4962ecdd1cccdbd619c474d1a2
map_normal_1000	1000	idx_leads_enrichment_lease	idx_leads_enrichment_lease	idx_leads_enrichment_lease	53245/53245/53245	0/0/0	128819/128819/128819	0/0/0	0/0/0	26.105/26.712/26.603	2845beae24865e5234f8227560123e73ec77805a7240944768913752357995f6	72bacba59150e247555eed25dfc7891f15074d4962ecdd1cccdbd619c474d1a2	72bacba59150e247555eed25dfc7891f15074d4962ecdd1cccdbd619c474d1a2	72bacba59150e247555eed25dfc7891f15074d4962ecdd1cccdbd619c474d1a2
map_normal_200	200	idx_leads_enrichment_lease	idx_leads_enrichment_lease	idx_leads_enrichment_lease	53245/53245/53245	0/0/0	128819/128819/128819	0/0/0	0/0/0	25.798/27.704/27.505	b216d0aa7adcc8de40c78a9193109041644010a2d8f1af0957c390e3a239f20b	c35bdfed63f7b4211271159105e81995db236be683d5922bcd56ca9703c7fb35	c35bdfed63f7b4211271159105e81995db236be683d5922bcd56ca9703c7fb35	c35bdfed63f7b4211271159105e81995db236be683d5922bcd56ca9703c7fb35
map_normal_600	600	idx_leads_enrichment_lease	idx_leads_enrichment_lease	idx_leads_enrichment_lease	53245/53245/53245	0/0/0	128819/128819/128819	0/0/0	0/0/0	26.005/27.146/26.505	5e91c30fe697c4d43f8807034fb50002fd3a709ab89c54e165fbb9c4067f31f7	72bacba59150e247555eed25dfc7891f15074d4962ecdd1cccdbd619c474d1a2	72bacba59150e247555eed25dfc7891f15074d4962ecdd1cccdbd619c474d1a2	72bacba59150e247555eed25dfc7891f15074d4962ecdd1cccdbd619c474d1a2
quality_action_ids_100	100	idx_leads_enrichment_lease	idx_leads_enrichment_lease	idx_leads_enrichment_lease	39930/39930/39930	0/0/0	40011/40011/40011	0/0/0	0/0/0	69.275/70.487/70.052	9843585bd35929cd7c5184cbf7500376c99c4d76147cd2d8f061a2346e3ab71b	3d64b1877bb2dca135ab158953b1df6375034050f2ae0056498a1e899fd88e9e	3d64b1877bb2dca135ab158953b1df6375034050f2ae0056498a1e899fd88e9e	3d64b1877bb2dca135ab158953b1df6375034050f2ae0056498a1e899fd88e9e
quality_ai_100	100	idx_leads_enrichment_lease	idx_leads_enrichment_lease	idx_leads_enrichment_lease	39930/39930/39930	0/0/0	100016/100016/100016	0/0/0	0/0/0	88.014/88.421/88.714	e07db847da7d009b0490ed842a0f8c4eb526000309d78a9cf2c440f9fbd3034d	f14044df1aca28d771ccd730456839a7506518532b13424e271b319decf3d7ff	f14044df1aca28d771ccd730456839a7506518532b13424e271b319decf3d7ff	f14044df1aca28d771ccd730456839a7506518532b13424e271b319decf3d7ff
quality_competitor_list_50	50	idx_leads_enrichment_lease+idx_g007p_ai_artifacts_tenant_lead_type_created	idx_leads_enrichment_lease+idx_g007p_ai_artifacts_tenant_lead_type_created	idx_leads_enrichment_lease+idx_g007p_ai_artifacts_tenant_lead_type_created	53490/53490/53490	0/0/0	40011/40011/40011	0/0/0	0/0/0	79.178/81.147/79.737	147fdbf4f70a59cd686fedc9b2323629fb10151440828f588c562ce6e955a5a6	c442214c9229e827c12af51f009a45d3e25ae9df3cdf0c4e8fd232cb7d9c5fe0	c442214c9229e827c12af51f009a45d3e25ae9df3cdf0c4e8fd232cb7d9c5fe0	c442214c9229e827c12af51f009a45d3e25ae9df3cdf0c4e8fd232cb7d9c5fe0
quality_removed_website	1	idx_leads_enrichment_lease	idx_leads_enrichment_lease	idx_leads_enrichment_lease	26620/26620/26620	0/0/0	130019/130019/130019	0/0/0	0/0/0	30.163/30.428/29.944	41d3970663c401be78246ee21a7ea202a289a4a08ad136b0e201d6df3430e8db	589affd1b3d44499463b7e629779723b5638f7e6a528899993c91b6b9f708a52	589affd1b3d44499463b7e629779723b5638f7e6a528899993c91b6b9f708a52	589affd1b3d44499463b7e629779723b5638f7e6a528899993c91b6b9f708a52
quality_summary	1	idx_leads_enrichment_lease	idx_leads_enrichment_lease	idx_leads_enrichment_lease	26620/26620/26620	0/0/0	40011/40011/40011	0/0/0	0/0/0	68.23/70.256/69.771	62b9b16b7ad7329e5374e599f9e278fcce5c11a2fe871a3ac77d77630ef4896e	63b5f02248c8c7e6869d95b824409e2163d555ea98b78a4542c38720e1385122	63b5f02248c8c7e6869d95b824409e2163d555ea98b78a4542c38720e1385122	63b5f02248c8c7e6869d95b824409e2163d555ea98b78a4542c38720e1385122
statistics_business_all	7				52673/52673/52673	0/0/0	6665/6665/6665	0/0/0	0/0/0	45.964/48.44/46.821	8f050f96009dfca3d5175a28cace7a99db938619499a66170deacef7d7338bb7	548edc263a2b9fa17193cccfd4e27ba98d403ad668101002f5ec4f042dc51763	548edc263a2b9fa17193cccfd4e27ba98d403ad668101002f5ec4f042dc51763	548edc263a2b9fa17193cccfd4e27ba98d403ad668101002f5ec4f042dc51763
statistics_business_bounded	6				52673/52673/52673	0/0/0	31199/31199/31199	0/0/0	0/0/0	36.812/37.862/36.827	58b70f39c7fdb67683213ca876bb441134aff892d76373c7c1d895df683478a6	c2fc4a2c4eb8f10fdc21d20e87569d3a314b2497f7ae513057c61f5f72ccd0a6	c2fc4a2c4eb8f10fdc21d20e87569d3a314b2497f7ae513057c61f5f72ccd0a6	c2fc4a2c4eb8f10fdc21d20e87569d3a314b2497f7ae513057c61f5f72ccd0a6
tenant_a_export_50000	50000	idx_leads_enrichment_lease+app_users_user_id_key	idx_leads_enrichment_lease+app_users_user_id_key	idx_leads_enrichment_lease+app_users_user_id_key	53260/53260/53260	0/0/0	70014/70014/70014	6230/6230/6230	7274/7274/7274	175.614/188.65/190.026	93aaa2c0ec5a23d427581b71e9d53290f745c45b3a92f6df1b7a3e59583371c5	b599d39767acc2da263b2b075df59762471c397b6e46bab7f731cb90714301ce	b599d39767acc2da263b2b075df59762471c397b6e46bab7f731cb90714301ce	b599d39767acc2da263b2b075df59762471c397b6e46bab7f731cb90714301ce
tenant_a_list_100	100	idx_leads_enrichment_lease+app_users_user_id_key	idx_leads_enrichment_lease+app_users_user_id_key	idx_leads_enrichment_lease+app_users_user_id_key	53260/53260/53260	0/0/0	70014/70014/70014	0/0/0	0/0/0	116.384/124.256/117.161	dff4c391851bbfdd0c03badd2c2c82f8e1e294d409c3b3f07e972ac3a95c6cd6	fd8ac818b443a6425246e8af21240932754a299a2d1495ab160c11eee7c55080	fd8ac818b443a6425246e8af21240932754a299a2d1495ab160c11eee7c55080	fd8ac818b443a6425246e8af21240932754a299a2d1495ab160c11eee7c55080
tenant_a_map_600	600	idx_leads_enrichment_lease	idx_leads_enrichment_lease	idx_leads_enrichment_lease	55640/55640/55640	0/0/0	129419/129419/129419	0/0/0	0/0/0	53.133/49.236/45.164	32f0c422d15c2437e7a2e0f84c5782ca37ead933890b7aff32e7dc5a087e890a	e8ddda7d269c962490b703206879d426471c01489ccb243526f5bf9dc4fc2b61	e8ddda7d269c962490b703206879d426471c01489ccb243526f5bf9dc4fc2b61	e8ddda7d269c962490b703206879d426471c01489ccb243526f5bf9dc4fc2b61
```

The shape contracts use `active_plumbing` = `archived_at IS NULL AND
COALESCE(is_excluded,0)=0 AND business_type='plumbing'`. Helper/Leads/Explore/
Kanban/CSV rows use that equality and score-descending order at the limit/offset
encoded in the shape ID; the broad Kanban row is the pre-correction source
control, not the live include-excluded binding. Map rows add non-NULL latitude
and longitude. AI candidates add website none/social/basic, no usable AI-found
site, qualified/needs-verification, new/verified/contacted, positive score, and
the recorded AI-priority order. Quality rows use the same website/no-usable-site
base plus qualified/needs-verification and non-`not_a_fit` quality; their shape
IDs distinguish summary, usable-site removal count, competitor latest-artifact
50/0, AI 100/0, and action-ID 100/0 projections. Business counts group
`COALESCE(business_type,'local_services')`; statistics do the same over all time
or the seeded discovered-time window. The excluded control is literal
`dental`, excluded, score-descending 100/0. The complete-tie control is literal
`tie_service` and returns all 12 equal-score members. Tenant-A list/map/export
controls add the explicit tenant-A equality and are measurement-only. The exact
score-ordered shared/map fixture boundaries for limits 1, 25/25, 60/60, 100,
200, 600, 1000, 50000, and 100000 are recorded above. Shape-specific result
identities absent from the raw artifacts are unavailable and are not invented;
aggregate rows have no ordered kth boundary.

All 52 distinct recorded shapes had exact installed/drop/restored canonical
row counts and multiset digests. Every installed structure was restored exactly
after rollback. Drop structures were reported honestly. Natural shared-
`plumbing` live plans did not select the target. Exact canonical
`local_services`, literal-empty catalog controls, excluded dental, and complete
tie controls did select it where their actual predicates and cardinalities made
it the natural owner. Default Explore and fast-map opportunity controls did not
mislabel score order as their default.

Equality returned literal `local_services` only and excluded SQL NULL. Empty
input emitted no business-type equality; it was not treated as `business_type
= ''`. Counts/statistics coalesced SQL NULL into `local_services`, while stable
source-state IDs kept parser-level conflation visible. The adversarial rows were
seeded after readiness and survived through all query phases.

## Fail-closed catalog states

An isolated disposable database used guard SHA-256
`ab73b9d1025f8572da530462905fbe30877af978c41dd6d3da9598fb0926c7cd`.
It accepted the canonical definition unchanged and rejected every spoof without
repair or workload execution, preserving the spoof catalog unchanged:

- reversed keys;
- ASC score direction;
- DESC with NULLS LAST;
- `text_pattern_ops`;
- wrong collation;
- partial predicate;
- expression key;
- INCLUDE column;
- non-index same-name collision;
- alternate-name semantic duplicate;
- invalid/not-ready/live unhealthy target; and
- search-path shadowing.

The drift cases rejected with SQLSTATE `P0001`; the semantic duplicate used its
dedicated duplicate message. The unhealthy-state setup deliberately failed a
concurrent unique build with SQLSTATE `23505`, leaving
valid=false/ready=false/live=true for the guard to reject. An earlier bundled
concurrent setup failed with SQLSTATE `25001` and was discarded. The spoof
database was dropped before the primary audit cleanup.

## Independent root reproduction

Root used a second implementation and a different deterministic fixture on a
fresh PostgreSQL 16.14 database. Its 100,019 leads comprised 100,001 shared core
rows plus hidden-market, valid assigned, excluded, archived, and ten semantic
rows. It had 100,005 active/nonexcluded shared `plumbing` rows, 1,005 shared
coordinate rows, two each of SQL NULL, empty text, literal `local_services`,
archive, and exclusion states, and two tenant-local literals. Score boundaries
through 100,001 were formula-derived and unique.

Eighteen representative admin Leads/Kanban/Explore/map/CSV, researcher
Leads/Explore/map, opportunity-negative, semantic, aggregate, and future-tenant
measurement shapes
had exact full results installed/drop/restored and exact installed/restored
structural fingerprints. CSV limits 50,000 and 100,000 were binding. Kanban
returned the two excluded high-score rows first. Regular and fast opportunity
controls returned independent discriminators `g007p31-root-c-000999` and
`g007p31-root-c-001000` first.

The fourth-retry root result is recoverable from raw Codex session
`019fba96-7f30-7b53-ada3-ecbadc9b5340`, tool call
`call_9RjoBsLLutaTyb7QlI3hNbJE`; the extracted tool-output SHA-256 is
`a350f650c74136b09ca23d6d4da42dbce026629296d2333a3303981e594a546d`.
Every result digest below was identical I/D/R and every installed structure was
identical after restore. `I/R` and `D` show the natural owners and structural
SHA-256 in those phases; the first-result IDs bind ordered-list boundaries.

| Root shape and exact contract | Rows / first ID | I/D/R result SHA-256 | I/R owner; structure SHA-256 | D owner; structure SHA-256 |
|---|---|---|---|---|
| admin Leads, shared plumbing, active/nonexcluded, score, 25/0 | 25; `g007p31-root-a1` | `342e5285e174fba499c5b29f8f23e99dfac43f5611ace694682f48e29c1c38dd` | app-user key + score; `eeb2f6491796101ecd2f77b0a55293f75904cb4edd96ae50eb6693cf560d91df` | same |
| admin Leads page two, same predicate, 25/25 | 25; `g007p31-root-c-000022` | `d2300827c8444e95982bb74ede91145b8b0927b6a12c4c0541f77d6d642a0fee` | app-user key + score; `eeb2f6491796101ecd2f77b0a55293f75904cb4edd96ae50eb6693cf560d91df` | same |
| admin Kanban, shared plumbing, include excluded, score, 100/0 | 100; `g007p31-root-x1` | `04733d712a262070dd6af315a7224cbc3b9159dcc6ac31bf654451f11145a706` | app-user key + score; `071c99dc910491b87072083b00b0bf9f61ad60d92c1d3f9b275c3af2023fac92` | same |
| admin Explore, shared plumbing, active/nonexcluded, forced unassigned, score, 60/0 | 60; `g007p31-root-h1` | `0a939fc5c008e75f1e228b4233ee23bd787a2d74f245c5658fada0f5edc59ec5` | enrichment lease; `d7efb5f2bdd3e354ce2fe24241051c732105cfabc3beed3a91294890b7a12b9a` | same |
| researcher Explore, same plus visible market, 60/0 | 60; `g007p31-root-c-000001` | `2593180925af5fa524fb70c26d8e6e41ce26b8be4d4384be70cd867c02546a41` | app-user key + enrichment lease + user-market user; `20c8ae8644b1ab01409941befe273e9b2c72cd6c6143246103a96545c8b3550d` | same |
| researcher Leads, self-assigned plus visible market, 25/0 | 2; `g007p31-root-a1` | `c09bc969cd963c423649c86b2a1030b677428c0f161626eebc020a246b9b1ae5` | app-user key + assigned-to-user + user-market user; `fcc6117268f7496901682dfdfb314595945ac499e5c166c935b78af4f5eb52cb` | same |
| admin map, shared plumbing, active/nonexcluded, coordinates, forced unassigned, score, 600/0 | 600; `g007p31-root-h1` | `50c5806640af6e59655d84a836f9612e4acc1a11eeaa4620817a9eade5627cac` | enrichment lease; `33161f416ca7a7d04906c207035ed48905c965a61ce8eaad68ee4fcf481897d8` | same |
| researcher map, same plus visible market, 600/0 | 600; `g007p31-root-c-000001` | `82073aec867fa5f3a440d3b16385d144d82e862e13d122b2874b1b6119853c21` | enrichment lease + user-market market; `31542d554fd8d8830985571f2f674ced9547e69693ef91840e49c1ea5b8a3890` | same |
| researcher map source control, same predicate, 1000/0 | 1000; `g007p31-root-c-000001` | `ce12cc71ef860bc33cabdd3234f9c2bc5f94c4a07f535b7cc19ca1149a59f63f` | enrichment lease + user-market market; `31542d554fd8d8830985571f2f674ced9547e69693ef91840e49c1ea5b8a3890` | same |
| CSV helper, shared plumbing, active/nonexcluded, score, 50000/0 | 50000; `g007p31-root-a1` | `3a92f53c322e2a0615f9a07ab86481928e9c9e22143115b143b65eb375c466ec` | enrichment lease; `d7d577b19aef7a5825d7e212b9c1ad2cd29c39c99802a8ffa68a658aeaab1692` | same |
| CSV helper, same predicate, 100000/0 | 100000; `g007p31-root-a1` | `447ff77d539d734669fe16ddc828cdfdd3810ed49ddd268939a36f0f41f95abc` | enrichment lease; `d7d577b19aef7a5825d7e212b9c1ad2cd29c39c99802a8ffa68a658aeaab1692` | same |
| default Explore opportunity negative, forced unassigned, 60/0 | 60; `g007p31-root-c-000999` | `0c97ed0885af2ded8628762a5470e7e94173a1120a272dffa8015ef69a70b762` | enrichment lease; `f49356c295617701bd9e59c99f79687117706e826decffb3fe1018da32512e8f` | same |
| default fast-map opportunity negative, forced unassigned, 600/0 | 600; `g007p31-root-c-001000` | `15a43cb2906cfc716bea10ba34ad8afefcb9c1014b81b3e18606cfe59c64ca14` | enrichment lease; `759085249d32c350f52a0c6ae7107399e40894b89fa777da2ed22f62129c04b2` | same |
| literal `local_services`, equality plus score, 100/0 | 2; `g007p31-root-s-1` | `5b2543254a64615426335a9575a6a02a6026ce728bdec4a58f403c71f43998ac` | target; `714922f282d35edb6a45643f10b4934cc912b033b7fb8e455ef33e10fa14b862` | enrichment lease; `600d125c8130602d1f2b66e7a32c8c972885206ee3df7bbb0ded0400eaa26b14` |
| literal empty text, equality plus score, 100/0 | 2; `g007p31-root-s-5` | `c6663c32b51224e61407fa08cc04ddf35d4c0df0ee7acb15775d2e545b86de64` | target; `d7e41f2a1626f7c540ed78bee62501cd91d8a9dc546afa197eda38483e8bc931` | enrichment lease; `6d778bcd2529db8760020a1a25ffa89b7aabbf484b78f5b458f473ffc4b332e2` |
| empty business input, no equality emitted, score, 100/0 | 100; `g007p31-root-a1` | `45ceed52cc11c3b89b5bd6a980565072eac2b8254a8d020f422ce4650f20faaa` | enrichment lease; `0811131c02694d2d86fb1abf61dedd51d89d1ee0068ebadb1a29a8fad99bc4df` | same |
| business counts with NULL coalesced to `local_services` | 6 aggregate rows | `2fc3ac6fae8ee8d970f521382b89f9636f6b5f833a25656845e76dfc8080cb74` | enrichment lease; `0b6595a8130334d7e4f7900e543dc6cc1e9bf596db08127a7426afc665c32f39` | same |
| future tenant-A measurement, active/nonexcluded shared plumbing, score, 100/0 | 100; `g007p31-root-a1` | `aa2214dc296ccc29c4ecee8ab070059cee8833652b57fb0c799e5ce348af5c8b` | enrichment lease; `efd9db12f6633b5885778e3e2892d51cb29e88804a83836bc90b73a5d5074bbd` | same |

Root's projection-local catalog was 38/37/38 indexes with installed/restored
SHA-256 `c6ab0d8633b60e9f2bd6bc36102342f2d13f1e0d3254e4bec43f437b42a373cb`
and dropped SHA-256
`873bcabf9920b2fc4db21975a2aaa2ff17dba1f163930d5e123d25a559254f24`.
Constraints remained 10/10/10 with SHA-256
`e80428b3370cea496252bf283b369b616f8e73f49cd6ee4763370fe11cfc335c`.
Healthy replay was unchanged. An independent reversed-key same-name spoof
resolved as keys `19 30`, options `3 0`, and opclasses
`{float8_ops,text_ops}`; preflight rejected it before workload and rollback
restored the exact catalog.

Root reproduced the central plan classification: ordinary shared-plumbing live
shapes used `idx_leads_score`, `idx_leads_enrichment_lease`, assignment, or
market-access siblings; literal `local_services` and literal-empty equality
selected the target. Dropping it changed `local_services` from 8 shared buffer
hits and zero filtered rows to 18,168 shared buffer hits and 100,013 filtered
rows while preserving the exact two-row result. The future tenant-A measurement
remained target-neutral,
filtered 50,012 rows through the accepted sibling plan, and is recorded only as
G-011/G-017 measurement debt—not P31 DDL authority.

Three root invocations were rejected and excluded before the authoritative
fresh retry:

- the first bound the rank array in the wrong wire format and stopped with
  SQLSTATE `22P02` after seed but before catalog/plan evidence;
- the second stopped at catalog preflight because the local harness compared a
  text-format PostgreSQL opclass array to a JavaScript array; and
- the third completed exact results but retained volatile worker fields in its
  structural hash, so it was discarded before replay/spoof acceptance.

Each database/container was removed. The fourth fresh full replay is the sole
root reproduction authority.

## Validation and cleanup

The authoritative toolchain was Node `24.13.1` and npm `11.8.0`, invoked via
mise. Root ran these exact non-database commands:

```text
mise exec node@24.13.1 -- npm test -- src/lib/__tests__/statistics.query.test.ts src/lib/__tests__/business-types.test.ts src/lib/__tests__/explore-filters.test.ts src/lib/__tests__/lead-exclusion.query.test.ts src/lib/__tests__/lead-quality.query.test.ts src/lib/__tests__/lead-intelligence.test.ts
mise exec node@24.13.1 -- npm run typecheck
mise exec node@24.13.1 -- npx eslint src/lib/db/queries.ts src/lib/__tests__/statistics.query.test.ts src/lib/__tests__/business-types.test.ts src/lib/__tests__/explore-filters.test.ts src/lib/__tests__/lead-exclusion.query.test.ts src/lib/__tests__/lead-quality.query.test.ts src/lib/__tests__/lead-intelligence.test.ts src/app/api/export/csv/route.ts
mise exec node@24.13.1 -- npm run db:verify:recovery
mise exec node@24.13.1 -- npm test -- src/lib/__tests__/sqlite-schema-coordinator.test.ts
mise exec node@24.13.1 -- npm run build
```

The PostgreSQL gates used three fresh, separate databases in the root gate
container; none reused a mutated audit database:

```text
G002_RUN_DISPOSABLE_PG_TESTS=1 G002_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55455/g002_location_crawl_rehearsal_p31root mise exec node@24.13.1 -- npm test -- src/lib/__tests__/location-crawl-tenant-scope-postgres.test.ts
G003_RUN_DISPOSABLE_PG_TESTS=1 G003_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55455/g003_lead_crm_rehearsal_p31root mise exec node@24.13.1 -- npm test -- src/lib/__tests__/lead-crm-tenant-scope-postgres.test.ts
T029_RUN_DISPOSABLE_PG_TESTS=1 T029_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55455/t029_tenant_foundation_rehearsal mise exec node@24.13.1 -- npm test -- src/lib/__tests__/data-transfer-contract.test.ts
```

Raw root session evidence confirms that exact T-029 command passed 19/19 in the
original gate. Independent rereview also passed 19/19 with PostgreSQL 16.14 on
fresh loopback port 43537 and the same required database pathname, with no
invalid retry. Its disposable `nova-p31-t029-rereview-68df67d-01` container,
listener, and test process were verified absent after cleanup.

The local URLs carried synthetic fixture data only. Before receipt edits, the
branch and baseline were `codex/nova-multitenant-integration` at
`68df67d9c7aad416e6cab1a12675a01c44da1b76`; `main` remained
`8225df619a96a088f18ff7f574a36b157d55dd2f`. The handoff tag object remained
`a3f8278f600be87962642842a3fdd7600242cffd`, peeling to
`0c48035ef4a44b64580716b04d3b629f0c3b5b47`.

Root independently passed:

- proportional business/statistics/explore/exclusion/quality/intelligence
  behavior: 42/42;
- TypeScript and focused ESLint;
- recovery verification over 37 application tables;
- Fedora-portable SQLite coordinator: 12 passed, 26 Windows-native skipped;
- production build: 11/11 static pages;
- fresh PostgreSQL G-002: 2/2;
- fresh PostgreSQL G-003: 6/6; and
- fresh PostgreSQL T-029: 19/19.

The root gate container did not stop within its requested ten-second graceful
window; Podman escalated to SIGKILL, then removed it. Absence of the container
and listener was verified. No Windows-only G006 durability test ran on Fedora;
the historical Windows 111/111 evidence remains unchanged.

The primary catalog inventory first used an invalid `name[] = text[]`
comparison and stopped with SQLSTATE `42883`; the corrected cast ran on the
otherwise untouched database. All invalid invocations above are retained as
history and excluded from authority.

Independent catalog/factual, test/evidence, and architecture/authority
rereviews accept the recovered five-file packet with no P0/P1/P2 findings. The
crosswalk becomes 41 classified and 21 unclassified; G-003 becomes 18/21 and
G-002 remains 13/0. The strict original
plan remains 58/318 accepted with 260 remaining because P31 does not close its
parent G-007 card. Migration counts remain 54/52/2, sequence
`202607310010` remains free, and parent G-007 remains open.

All P31 audit, spoof, root-reproduction, and root-gate containers, databases,
ports, scripts, processes, and temporary artifacts are removed. Only the
pending durable receipt changes remain. Main and the handoff tag are
unchanged. No hosted Supabase, remote migration, provider, deployment, push,
PR, credential, customer-data, outreach, or other external activity occurred.
