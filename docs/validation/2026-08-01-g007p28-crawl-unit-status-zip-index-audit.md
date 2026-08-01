# G-007P28 crawl-unit status-ZIP index audit

Date: 2026-08-01

Branch: `codex/nova-multitenant-integration`

Opening baseline: `db8f3940fbb8255e39cd775ffc314573c43498d4`

Audit opening commit: `2dccf7dff2efbda557d1cd14d9082a6ce37c02e5`

Status: accepted RETAIN/DEFER classification; no migration

Receipt commit: `9a01e888a5d90c4133e182c5998f723de1ffc6e4`

## Scope and decision

G-007P28 audits only the sole remaining G-002 residual:

```sql
CREATE INDEX idx_crawl_units_status_zip
  ON public.crawl_units USING btree (status, zip);
```

The target originated at
`supabase/migrations/202605110001_full_schema.sql:310` in commit
`0c80c1e831b0e95e0007fdb5ee0bd1bfce87da6c`. The current migration LF digest
is `1bf0c081317077e52cf313a5d59fb4ef68bd7442318e0ff452b3c778c1a84033`.
Current and frozen SQLite compatibility schemas retain the same index.

Decision: **RETAIN/DEFER** for historical PostgreSQL/SQLite compatibility and
measured mode-filtered status-ZIP or structural-control access only. The exact
current failed-error reader, complete reset/lease flow, all-time and bounded
failure statistics, ZIP ledgers, and full `getRunGeographyProgress` query do
not use the target. No exact tenant-query plan defect, candidate, migration,
replacement, necessity, duplication, or removal claim is proved.

ZIP is compatibility location data, never tenant or workspace authority.
Persisted `location_mode` governs location shape; unit scope derives from its
run and inherited tenant/workspace fields. Current mode-agnostic ZIP joins
admit platform-cell and generalized token collisions. That is a separate
G-010/G-013 query-semantics defect and a G-017 validation boundary, not a G-007
index defect. No correction packet opens here.

## Authoritative PostgreSQL evidence

The authoritative evidence is the combined r3k audit and fresh exact-geography
supplement. Both used PostgreSQL 16.14 (`160014`), Node 24.13.1, npm 11.8.0,
loopback-only disposable services, and the complete chain of 54 discovered,
52 portable applied, and two runtime-only skipped migrations. No planner method
was disabled or forced.

The r3k fixture contained 124,416 crawl units across two tenants, eight globally
unique runs, named and NULL workspaces, six statuses, six categories, and all
three location modes. Four runs were in July and four in June. Exactly 62,208
units inherited NULL workspace; each mode contributed 41,472 rows. Legacy rows
used exact active ZIP cells and tokens. Platform-cell and generalized modes
each contributed 20,736 active-ZIP-colliding and 20,736 noncolliding tokens;
generalized cells were NULL. All 1,440 contingency buckets had their expected
144-row legacy or 72-row split-mode count, and scope mismatches were zero.

The selected run's mode-agnostic ZIP join contained 10,368 rows:

- 5,184 valid legacy-ZIP rows;
- 2,592 platform-cell compatibility-token collisions;
- 2,592 generalized token collisions.

ZIP `90000` reported 1,296 units although only 432 were valid legacy-ZIP rows.
Both the selector and atomic lease chose generalized NULL-cell unit
`r3-0-24-0-0-1` and inherited ZIP city/county data. Target removal did not
cause or repair this semantic defect.

### Catalog

The r3k catalog found 12 installed crawl-unit indexes, 11 after target-only
drop, 12 after rollback, and 11 constraints. The target was an ordinary
nonunique btree with no predicate, valid/ready/live, zero constraint owners,
and 1,130,496 bytes. Semantic catalog SHA-256 was
`c08e61515c898b2eedae36bb261875fc53ad66bef0691001a9f5438857921b70`
installed and restored and
`9c8e4d30cce37f6d82d693989ba4f4c34cf937651d4856906e00f43b4c890b1b`
dropped. Byte telemetry was also exact installed/restored at
`6b1196112a23e81b860b1bb53bb82f0008065daac7d84486060df0bf5194cdfb`.

Across 18 read shapes, installed/drop/restored application results were equal,
and installed/restored structural plan fingerprints were exact. The exact
failed-error reader returned 2,592 rows for both workspace forms, zero for wrong
workspace/tenant controls, and canonical result SHA-256
`6493ccf99e0a42cb025705a18246085203174329ea9eec9b997bb2e23503eb9e`.
Unscoped forms used accepted `idx_crawl_units_budget_pages`; scoped measurement
forms used accepted `idx_crawl_units_tenant_run_status`. The target owned none.

The durable r3k read matrix follows. Result SHA-256 was identical in installed,
dropped, and restored phases for every row. `Plan I/R` is the exact shared
installed/restored structural plan SHA-256; `Plan D` is the dropped phase.
Owner R equals owner I. `none` means no index owned the crawl-unit relation.

| Shape | Result SHA-256 | Plan I/R SHA-256 | Plan D SHA-256 | Owner I/R | Owner D |
|---|---|---|---|---|---|
| `primary_workspace` | `6493ccf99e0a42cb025705a18246085203174329ea9eec9b997bb2e23503eb9e` | `5e57ce1908899d56fc5ed496916d362a166eabe40dea24cc0361cd1589ceb8b7` | `5e57ce1908899d56fc5ed496916d362a166eabe40dea24cc0361cd1589ceb8b7` | `idx_crawl_units_budget_pages` | `idx_crawl_units_budget_pages` |
| `primary_null_workspace` | `6493ccf99e0a42cb025705a18246085203174329ea9eec9b997bb2e23503eb9e` | `d85cb2bf84b85a188acc9b2592b6c4069feb0b80fbdbd801e4e5aa6f8f34e5e6` | `d85cb2bf84b85a188acc9b2592b6c4069feb0b80fbdbd801e4e5aa6f8f34e5e6` | `idx_crawl_units_budget_pages` | `idx_crawl_units_budget_pages` |
| `primary_workspace_scoped` | `6493ccf99e0a42cb025705a18246085203174329ea9eec9b997bb2e23503eb9e` | `399c78202878d8b28e0f852d6e66ce22001e038f9ad3fd119872f21e4d8d7609` | `9f26a464b8b4a3f2a7f14733abeb6bafc220142db7b630448799769d90ce2532` | `idx_crawl_units_tenant_run_status` | `idx_crawl_units_run`, `idx_crawl_units_tenant_workspace_market_status` |
| `primary_null_scoped` | `6493ccf99e0a42cb025705a18246085203174329ea9eec9b997bb2e23503eb9e` | `3763e0b7698c79c6fc599a01667bb536f42f0c6fcf1227af450b335df4c21f99` | `5295603e835eb5dfa427d03de8f019d7066603787bc32da30d81080c2ff1149e` | `idx_crawl_units_tenant_run_status` | `idx_crawl_units_run`, `idx_crawl_units_tenant_workspace_market_status` |
| `zip_status_current_collision` | `dd74593320db040ba9c711116259975febc37573b8cef37ba3b6378644a0da75` | `b315b0351dac76f198c08e0878085a97e7afe8f0a0ac38c1cff5b1965cc21621` | `b315b0351dac76f198c08e0878085a97e7afe8f0a0ac38c1cff5b1965cc21621` | none | none |
| `zip_status_legacy_only` | `dd74593320db040ba9c711116259975febc37573b8cef37ba3b6378644a0da75` | `33b660a89ca2e3a1336be6b12eb823bba5feba7b601d3612608fd484df1b912c` | `03dddfed00429db1961ec9b7f56c6efcd18205ec0f662ecab492fb7fdc07e1b0` | `idx_crawl_units_status_zip` | none |
| `zip_status_platform_collision` | `dd74593320db040ba9c711116259975febc37573b8cef37ba3b6378644a0da75` | `dc434840c107e343621603ad3385d10b9b969ebd5827ffef09daf90d394cef52` | `8baf5e563e844f77e7d4ae21732f5f7fff33e73ac184fc9f183694a05dbcd8f6` | `idx_crawl_units_status_zip` | none |
| `zip_status_generalized_collision` | `dd74593320db040ba9c711116259975febc37573b8cef37ba3b6378644a0da75` | `d7fb91a8686dc40708f585658370f83e82c8a762a0f1b1d957d08cbd973bd89c` | `5ed5a5bc74ce263f7e2983abe1bfd2b5c9dd86cde7e2c4461f4877a2ea68884f` | `idx_crawl_units_status_zip` | none |
| `zip_ledger_selected_run` | `57af6954952ed44c3f704b4118891ef94ef71629eeed2204b91469bb603421ab` | `cfdbfe20a82ab4874186a8b65bcf585ddef56a4f967bfa4b404ce5deadf48dae` | `cfdbfe20a82ab4874186a8b65bcf585ddef56a4f967bfa4b404ce5deadf48dae` | `idx_crawl_units_run` | `idx_crawl_units_run` |
| `county_selected_run` | `27a613010c92c08698909e58f233dd03840988dca29b183a8039bb1584f3104c` | `4e20e0e9d0475ae81ab41a3032c3308c70ae8e5dca470dd138dc1246dd8812fd` | `4e20e0e9d0475ae81ab41a3032c3308c70ae8e5dca470dd138dc1246dd8812fd` | `idx_crawl_units_run` | `idx_crawl_units_run` |
| `state_selected_run` | `54720baf2ecbed5db19590e7aeb4852c5b07155315cb6bad70786dedf22c045b` | `b788ccfd8d6e666d943dab8cee29eef538bdc49a614002baf33970c551fe0d4a` | `b788ccfd8d6e666d943dab8cee29eef538bdc49a614002baf33970c551fe0d4a` | `idx_crawl_units_run` | `idx_crawl_units_run` |
| `pending_selector` | `5ad67c350f41d1667cc104008690618f67c88339f47ad1f201da39eec19b686b` | `db11e921edf7216c9253d2399a57ccc94acdddffcfe3a64de70b7bb73c9742a7` | `db11e921edf7216c9253d2399a57ccc94acdddffcfe3a64de70b7bb73c9742a7` | `idx_crawl_units_budget_pages` | `idx_crawl_units_budget_pages` |
| `p4_progress` | `718da5f63227c86506796fb622ea8723e2155f1c589f634905348eca3808c12d` | `10fe33baa33ddb4cb6640b0ff1f0e8aa011f0e8b2f482cfa4b5ee5fafe730c4c` | `10fe33baa33ddb4cb6640b0ff1f0e8aa011f0e8b2f482cfa4b5ee5fafe730c4c` | `idx_crawl_units_budget_pages` | `idx_crawl_units_budget_pages` |
| `p24_remaining` | `a07674673cbddfb3ca9d9354e137c3231ae112c35844c728eb121e15f9d1899a` | `e4203b9268b82c7c0574450ce8859ad970bc7c0e7fa1aeaf2056fc35b7947d66` | `e4203b9268b82c7c0574450ce8859ad970bc7c0e7fa1aeaf2056fc35b7947d66` | `idx_crawl_units_budget_pages` | `idx_crawl_units_budget_pages` |
| `p25_cell` | `3af52042d4de0c8595a12cf33b61a477caeace744c5155fa2ef804291b307d75` | `fb47f8b525364ee879e7333ac689a35b7d0870a1d6deb73e54d01c8255e81cc5` | `fb47f8b525364ee879e7333ac689a35b7d0870a1d6deb73e54d01c8255e81cc5` | `idx_crawl_units_cell_status` | `idx_crawl_units_cell_status` |
| `statistics_failed_all_time` | `527525cc72b390cba9efc10f9da8c34762532330f4b5557d0bc2079dc85050b8` | `d3ef34f85601f9ceb8d4631af1d3c9f193942d495af431f0e83a4f39f7b20428` | `d3ef34f85601f9ceb8d4631af1d3c9f193942d495af431f0e83a4f39f7b20428` | none | none |
| `statistics_failed_bounded` | `36602a6d16f4ffec044aa9c1133db3b6ad59e2eb7c31f60b700e7e0630eeb7d8` | `018b3fad324a96d5ebf5b4b33bc0a3f6495570d23c3a824f4a45ccf581ab77d5` | `018b3fad324a96d5ebf5b4b33bc0a3f6495570d23c3a824f4a45ccf581ab77d5` | `idx_crawl_runs_created_desc`, `idx_crawl_units_run` | `idx_crawl_runs_created_desc`, `idx_crawl_units_run` |
| `structural_status_zip` | `d96941fa3d0e629db31de91f3fe4f6cce51e1d7f51e3ab040a8094221857fe68` | `198e073a9d1cc0633530df88fcf747494f3244b210d7c4e0c0951ebfca97df75` | `52cff84968fa311e90b1baed89fdcab635c1f6eb65d7dcc79a2050b968f46b4a` | `idx_crawl_units_status_zip` | none |

Result mismatches were 0/18 and installed-versus-restored structural-plan
mismatches were 0/18.

All-time statistics returned 124,416 total and 20,736 failed with result digest
`527525cc72b390cba9efc10f9da8c34762532330f4b5557d0bc2079dc85050b8`.
The July window returned 62,208 total and 10,368 failed with digest
`36602a6d16f4ffec044aa9c1133db3b6ad59e2eb7c31f60b700e7e0630eeb7d8`.
Their natural plans used run/history controls, not the target.

Only mode-filtered status-ZIP and audit-only structural controls naturally used
the target. Their target-only drops regressed from about 2-6 ms to 13-19 ms,
but these shapes are not exact protected tenant-query owners and do not prove a
tenant-query defect or authorize removal.

### Complete reset and lease family

Mutation evidence ran installed, dropped, and drop-rolled-back phases on three
physically identical clean fixture clones. Results, state, and structural plans
were exact across phases:

| Exact statement | Result | Natural owner | Result/plan SHA-256 |
|---|---:|---|---|
| stale-running reset | 432 IDs | `idx_crawl_units_budget_pages` | `59e59a9cabc1ef2a22efa34d531ff724c24e3d817c6aa162417f049b5f9057c9` / `4ccd7783b3be4041a4465c61f85b6ed4b2ffcc276fa982bfba11f982cedff488` |
| due-retry reset | 648 IDs | `idx_crawl_units_retry_ready` | `ae7645df7e9bb30023952bcd46267ca8dca48da3ed208e4c320f68b5a655047f` / `b395df01207bc70b03c836d4f0b73eeff81bd5db5506b3bd0907955a1bd802cd` |
| atomic lease | `r3-0-24-0-0-1` | primary key plus `idx_crawl_units_budget_pages` | `d2c0cd91e47fd77ad74a51c13a77ba0875605530bd4ee5c54dac0f6ebd31bf1e` / `ce9624f1257c497b90aad0e3c4bf636509b2d440cc1e6e0e1095868acdf9149f` |

The exact final state digest was
`eb4658e0e29f916434c252cdde5eee8cf78fd6ea2f2258e95d4d25224201f8c2`;
the selected-row state digest was
`47d534cb691a657478ae29055bb25abe0b162c242d28c1e6051301fbc9e1bf7e`.
The deleted r3k audit script and result artifact digests were
`6967d9dd6734f536fb70e6a57ed724a98e6c316bd6edd239c018dbf52e19f92a`
and `bc7318a195ae6e47c286e1fddb669092ce24cf13f349dbd239a0aa5dbb9e5552`.

### Exact geography supplement

A separate fresh service replayed the same 54/52/2 chain and equivalent
124,416-row fixture, then executed the exact full source
`getRunGeographyProgress` CTE as one statement. Its source excerpt digest was
`5a906817338a085866d48c2986fb4971ad6c43c33090ec22e4e0a8514204f2ce`.

Installed, dropped, and restored phases returned the identical normalized
object: 12 active ZIPs, 12 selected, zero completed, 12 started, zero not
started/canceled/not selected, six counties selected, and zero counties
completed. Result SHA-256 was
`e0c9befa5a581cf54120c326b6533e9c927351b000b32ce9d99b6b5c2c72cbda`
in every phase. Natural plan SHA-256 was
`7bc45caf2fa2cc8aa9a601fa7da53ca79dfe682082a7e972c739b7aa0a633db5`
in every phase; `idx_crawl_units_run` was the sole crawl-unit owner. Target
removal changed neither plan nor result.

Supplement catalog SHA-256 was
`417212f841a23c2ddd265cd7e0fe04cff780845d4f78de8f2c5db928707b1526`
installed/restored and
`e60661b72fedec9bcad1e280fc355e55f489b577a333c5e117a30cb296c92982`
dropped, with 12/11/12 indexes and 11 constraints. The scalar saturation does
not erase the underlying 5,184 nonlegacy collision rows.
The deleted supplement script and result artifact digests were
`92b653b83fcf50e0d1209956307c8cc7d949a3a60489d9eb250bc7aeae67f086`
and `883c53fb8e38e6700b9a6a6949ff466cbbc2d678c78cc1eb58fac75c9a4668b1`.

## Invalid and superseded evidence

Only r3k plus the exact-geography supplement is authoritative. Earlier evidence
was rejected or superseded truthfully:

- r1 used a LIMIT with unresolved equal-ZIP ties;
- r2 omitted platform active-ZIP collisions, reset/lease mutations, distinct
  all-time statistics, and the exact geography CTE;
- host `psql` was absent, one inspect field was misspelled, and one recursive
  cleanup command was rejected before execution; corrected alternatives ran;
- r3a had incorrect grouping arithmetic; r3b-r3d mixed physical-byte or cost
  telemetry into stable hashes; r3e accumulated rejected databases in an old
  container until its tmpfs reached capacity; r3f-r3i retained parallel,
  heap-block, heap-fetch, or visibility-map physical effects that changed
  restored plan identity;
- r3j passed its audit checks but serialized its Date receipt as `{}` and was
  superseded by the clean r3k rerun;
- r3k was initially P1-withheld because the exact geography CTE was absent;
  the fresh supplement closed that gap with no invalid invocation.

No rejected run supports the final disposition independently.

## Root validation and cleanup

Root passed:

- focused planner, scheduler, worker, statistics, crawl-action, and coverage UI
  behavior: 81/81;
- TypeScript and focused ESLint;
- recovery verification over 37 application tables;
- Fedora-portable SQLite coordinator: 12 passed, 26 Windows-native skipped;
- production build: 11/11 pages;
- fresh PostgreSQL G-002: 2/2;
- fresh PostgreSQL T-029: 19/19;
- JSONL parsing and `git diff --check`.

The first root G-002 service readiness check observed the PostgreSQL entrypoint's
temporary shutdown and was discarded. A later G-002 invocation used a database
without the harness-required prefix and failed before connecting; the newly
created correctly prefixed database passed 2/2. T-029 passed on a separate fresh
service. An immediate cleanup check saw transient port teardown; its retry
confirmed closure.

No Windows-only durability test ran on Fedora, and historical Windows 111/111
evidence is unchanged. All audit, supplement, G-002, and T-029 containers,
databases, ports, scripts, results, processes, and temporary paths are gone.
There is one repository worktree, no task lock or candidate residue, and main
and the handoff tag remain unchanged. No remote, hosted, provider, deployment,
production, or customer-data action occurred.

Independent test/evidence and architecture/authority reviewers ACCEPT the
combined r3k plus supplement evidence with no remaining P0/P1/P2 finding. The
crosswalk becomes 38 classified and 24 unclassified, with G-002 complete at
13/0. Migration inventory remains 54/52/2, sequence `202607310010` remains
free, and parent G-007 remains open.
