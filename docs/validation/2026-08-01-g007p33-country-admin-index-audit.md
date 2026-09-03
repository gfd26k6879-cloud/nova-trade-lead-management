# G-007P33 country/admin index audit

Date: 2026-08-01

Source baseline: `3dcbe7f6cfdbae0e2c3543a336180f6bdc411046`

Reservation commit: `a024cf5f11c1f328cfd97c75026b16006754a947`

Status: accepted RETAIN; future tenant analogue DEFERRED; documentation-only;
independent receipt reviews accepted

## Decision

Sol accepts RETAIN for the exact healthy historical PostgreSQL definition and
frozen SQLite compatibility definition of
`idx_leads_country_admin(country_code, admin_area1, locality)`. The leading
country key has independently reproduced current plan owners on selective
country-filtered Explore, Quality, and map queries. Target-only drop preserved
results but materially increased scan, filter, sort, and buffer work. Common
low-selectivity US queries correctly preferred other plans.

No current reader owns the country/admin prefix, the full three-key order, or
trailing admin/locality keys as an authorization basis. Current Quality city
filtering is `locality LIKE ... OR address LIKE ...`, and no current lead reader
has an exact admin-area predicate. Any tenant-prefixed analogue remains a
measurement until G-009/G-010/G-011 establish the exact scoped caller.
Geography selectors never grant tenant or workspace authority.

The exact disposition is
`retain_healthy_historical_postgres_country_admin_index_with_independently_reproduced_current_selective_country_filter_plan_ownership_and_frozen_sqlite_compatibility_definition_defer_tenant_prefix_to_G009_G010_G011_no_current_tenant_defect_no_migration_or_removal_basis`.
P33 creates no candidate, migration, replacement, test edit, or removal.

## Source, reachability, and semantics

- PostgreSQL origin:
  `supabase/migrations/20260602193000_international_markets_and_territories.sql`,
  origin commit `fe07602ccfb47f529c8aeb62e249217c8fb1828d`, current
  file SHA-256
  `af73cd9d955a69266bac9140eebf981df1e289110ced3d3f1d2e41433ec28372`.
- The target is an ordinary nonunique, nonprimary, nonconstraint `btree` on
  three `text_ops` keys, all ASC/default NULLS LAST, with no predicate,
  expression, INCLUDE column, or tracked semantic duplicate. It is valid,
  ready, and live. SQLite mirrors the definition in `src/lib/db/schema.ts` as
  frozen compatibility evidence only.
- `/explore` requires `view:workspace`, exposes US/CA/GB country filtering,
  and passes the normalized equality predicate through `getLeads` and
  `getBusinessTypeCounts`. The map API uses the same filter and permission.
  `/quality` requires `crawl:manage` and passes the country predicate through
  its summary, list, candidate, and action-ID readers.
- The live CSV route does not bind country, market, cell, admin, or locality.
  A country-filtered export helper is a capability control, not a live route
  owner. Leads/Kanban likewise have no live country binding.
- Lowercase nonempty inputs normalize to an approved uppercase country. An
  unsupported nonempty input normalizes to US, while an empty input emits no
  country predicate. Stored NULL, empty, lowercase, and unsupported values are
  adversarial storage controls and are not described as live filter identities.
- Country/admin/locality are nullable denormalized selectors. They can be
  inconsistent with market/cell reference data and cannot replace mandatory
  lead `tenant_id` authority.

## Formal PostgreSQL 16 producer audit

Faraday used PostgreSQL 16.14 from local image ID
`de3a4eab8fdfa507ea92aac488b916b08089e515db49b055fe71dfa271ba3a28`
and digest
`sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777`.
The full local chain was 54 discovered, 52 applied, and two runtime-only
migrations skipped.

The authoritative fixture had 200,000 physically interleaved rows, 100,000 per
tenant, and 200,000 distinct discovery times. Country distribution was US
116,000; CA 32,000; GB 16,000; DE/IN 8,000 each; AU/BR 6,000 each; and 2,000
each for SQL NULL, empty, stored lowercase `ca`, and unsupported `ZZ`. CA
included ON/BC/QC and Toronto/London/Ottawa/Vancouver cohorts. Active,
nonexcluded counts included CA 29,554, GB 14,776, and US 107,131.

All 24 canonical result identities were exact installed/drop/restored, and all
24 normalized structures were exact installed/restored. Ordered shapes compared
exact ordered identities at tie-safe boundaries; scalar and set-semantic shapes
used canonical scalar/identity results. Natural target owners were:

- CA count; CA Explore page; researcher-visible GB Explore;
- CA Quality summary/page and CA/Toronto Quality page;
- CA map, default CA opportunity page, and default fast CA map;
- GB export helper capability control;
- exact country/admin and country/admin/locality structural controls; and
- future tenant country/triplet measurements, which remain nonauthorizing.

Target-neutral controls were common US Explore/map, city-only Toronto,
admin-only and locality-only suffixes, stored anomaly cohorts, and the actual
country-neutral CSV route. The locality OR-address shape used the country
prefix but retained locality as a residual filter.

Representative installed/drop results were:

| Shape | Time ms I/D | Recursive plan-node buffer counters I/D | Rows removed I/D |
| --- | --- | --- | --- |
| CA count | 2.267/36.027 | 65/47,619 | 0/56,000 |
| CA Explore score page | 22.176/48.885 | 19,774/41,076 | 0/155,154 |
| Researcher-visible GB Explore | 16.089/50.029 | 23,610/54,778 | 0/169,932 |
| CA Quality summary | 17.186/60.293 | 14,295/27,385 | 0/155,154 |
| CA/Toronto Quality | 39.865/63.611 | 19,774/41,076 | 18,471/173,625 |
| CA map | 11.302/42.256 | 19,774/41,076 | 24,013/179,167 |
| GB export helper | 18.508/49.310 | 18,527/41,076 | 0/169,932 |

These buffer figures sum recursive plan-node counters and are not deduplicated
physical-buffer totals. Timings are warm-cache corroboration only.

Distinct lead-index catalogs were 38/37/38 with final 38. I/R/final SHA-256
was `7fcf68f67cba747cbd6509d75c57e9f0519c092afa3b8ade8cf17f38c4e995db`;
D was `b16abdd06c30acd360effee07eb742f1c2a836121c698a0a290b27c770c9b6cc`.
The separate broader constraint-provenance join was 48/47/48 with I/R SHA-256
`98090f70ccba583ed21ad2d1d2ab927fcb7f03a14e5f5a2bf6336e46660ff72f`
and D SHA-256
`a45b3eca891049dd5ac1c4650322a78f4ff2bb3801e29866d7d5ac304f6f480c`.
Ten lead constraints stayed invariant at SHA-256
`ba1c43292e4619aec554731df17825294e306d13fbb846f9ebf7a71d88e5acc9`.

Healthy statement replay was a no-op and missing-target replay recreated the
exact definition. Name-only `IF NOT EXISTS` did not repair reversed-key,
same-name table, or invalid-index spoofs. The definition-aware audit rejected
each before workload; every spoof/missing probe was transactional and final
catalog state was exact.

Faraday did not preserve a full per-shape digest manifest or harness/raw/summary
artifact after required cleanup; this receipt does not invent one. Root's
separate full 13-shape digest manifest below is the durable exact-hash evidence.

## Root independent reproduction

Root used a separate PostgreSQL 16.14 container and a fresh 120,000-row,
two-tenant fixture. The sole authoritative retry disabled client prepared
statements so installed/restored plan structures used the same planning mode.
It produced 13/13 exact result sets I/D/R and 13/13 exact normalized structures
I/R. Natural target owners were selective CA/GB count, page, Quality, map,
country/admin, full-triplet, and country-plus-locality shapes. Common US,
admin/locality suffix-only, and the root future-tenant distribution were
target-neutral.

| Shape | Result SHA-256 | Plan I/R SHA-256 | Plan D SHA-256 | I/R target owner |
| --- | --- | --- | --- | --- |
| Explore CA count | `1b6cfb0bce01091ec9120040e924cfd89c1335713d1e4a781ad9baa981b35f90` | `bfff808967fbdf6c1947a3939020f5e07e2233b356ca7ad45dfc575abed7c78a` | `5aab23d1b81febdb8941d681253b3e5b0fbe05f66e3de322a8dfa4597d8b2f38` | yes |
| Explore CA page | `141486f1ea689ddec6db1a83a39f2adf8ecf62b40da5561ed84c30223a842fcd` | `c644eec54aa2776f7f671ed5b00fa30f31253245f8fdf21d695dc424b303d55a` | `30448f6bca90bddfdfe8befed456a0d180b17ba4d09737a801102746b07cfeef` | yes |
| Explore GB page | `e94e806dd6c829f9215d02a1d988dec7abbdcebdf1e68986c65e52075367d9c4` | `5febdafaebcb1adff1cfe8e93eb790e58b70d5a11fe4826c23e3ba829ed5a1a2` | `9dd37b773986335ea9b0fc68f15b566800d56ec5feb4ab833ead9b67ac20589e` | yes |
| Explore common US | `d2eb8fb82b2b75ee5998302aea7290be629d8ec606e7bd29bfe5223d712f7d9e` | `09572e3ec44ce5846bca743e36fec9e4ee8d8e54d8e1475fd43509f2f57ab33f` | `8aca465a61ed6f88343bc2d24f7709109500bdd71153ecc2ed2f566c82fe3fb6` | no |
| Quality CA summary | `971025f1db538b9493cf6cfbde5568d0c001f5b4663036c1298a1f9dee9802e6` | `c834cb8ecd35c284bc8910ad4f428ce7ea9501cfb0cd28e44c66103339711705` | `9bf43be86e7103801d8b29ff28730194e238309206c85792bf32b2c9a9b95202` | yes |
| Quality CA page | `3e821675a458345466555356adad186e8ee205a6860581c108cd0c175329a4da` | `e65cba40557f96f3e74704d90de9657aa7ee708bdb8c825417c77d89622793bb` | `35d21e9646a4899d2cfb14ecc8013b209933595ef04ca87f7190938b16b5f623` | yes |
| Map CA | `f73c9ececf1052b764fb3fcde43e816526aec43e36f4bcdb63f0a073c74cd175` | `c5ec7de259caa3d5ba8f66958d6b1e466511814c2e00d7cf84f2ea8b8a32515b` | `21c3d3f5f99378273634bc7e874777175dede553dafc938e78dce0e1257b6318` | yes |
| Country/admin | `1cecda96c9bb66f9428bf43aeb4875fff42cc89ef5a337fed63c2079d9e6365a` | `4a5ae8b29180eb2b25ea29aa0e41e77673faaf00ae36bfb9273dfbac8e004a82` | `e6a13c6df263f98989adccb040e5409d05c0453e1bdd0d34529850bfa1b7aab2` | yes |
| Country/full triplet | `7804c235e803ce255b6cf92a2d54bf37ea724f4f0039553f440da7500c432808` | `f97a234d584465f45d31cc8377eaca4e43a97a5f8499d26cf2b4aa6bf89d2deb` | `589a1a073522a0c395c48dba395cfa7f2f6b9fa7e541857f4f04ea22943566ff` | yes |
| Admin suffix | `1cecda96c9bb66f9428bf43aeb4875fff42cc89ef5a337fed63c2079d9e6365a` | `2f8814eaae9473dd036fa56930263ab336a779e9efe32a93099a0395960b5a9b` | `f313297592dc610c5bf431b6d7de80572c621d020cf281ea6d8e06728b9fc871` | no |
| Locality suffix | `7804c235e803ce255b6cf92a2d54bf37ea724f4f0039553f440da7500c432808` | `be8a5943258508d7bac1cd7dc370e9d11e71bdf3199cec0f3db6c373c3d45bdb` | `8fd4109207c0dd962ddc9e0bb2573c6685c0bd9e5f26220a38f5a960750640f5` | no |
| Country plus locality OR | `77e89a209fbdff18f98b6d0155f30b7a18dbdd43602a4292198ddb3140c8cad1` | `8ca7c26547d4af3800241a77eb29b327cfbd149938b0163f24c74d42ad33b72a` | `721a95aa046c98f6eef0734b4d6cb51cdd8cf8bb5c0524e3101236c3cdd4ee39` | yes |
| Future tenant/country measurement | `47846cf99520c59315911b12fb6054a373744f408295d87e7ae586b44477a373` | `09c7054e46b306316acd4d202bb56e84fbed8ac9fe00278beb6b3a844619e3cc` | `3faf5b110a0f09f45f4bec15030fe6bf7223b7315adbf4553e6adc9680a8ba1d` | no |

Root distinct-index catalogs were 38/37/38 and restored exactly. I/R/final
SHA-256 was
`49f373e026474fb2131dd55ccb9703254cfc59546c4ac81b734cbd99b7efa8af`;
D was `7a03361a026ee7443c48134fa11e960259c9e46d589ac2ba1b175082d4b78aee`.
Ten constraints were invariant at SHA-256
`4c82208cbc105a1b716b6cd02c12b2de3987d9a8b0b93dccb9e9204237bfd7d4`.
Healthy statement replay was a no-op. A reversed-key same-name spoof persisted
under name-only replay and was rejected by the definition check before
workload; rollback restored the final catalog exactly.

## Invalid attempts and cleanup

Faraday excluded seven setup/fixture invocations: identifier-helper syntax
before database creation; missing auth bootstrap; missing active memberships;
noncanonical Quality ties; normalized market-ID collision; a parse-only
`THEN25` typo; and a corrected nonexistent source-file probe. Each is recorded
truthfully and none contributes authority.

Root excluded two database attempts. The first wrapper invocation returned a
session handle without surfacing it; a retry overlapped the still-running exact
task process on the same database. Root detected and terminated only the two
task-owned PIDs, discarded that database, and used none of its output. The
second fresh run had 13/13 exact results but only 9/13 restored structures
because the client crossed its generic prepared-plan threshold. That database
was discarded. The third fresh database, with prepared statements disabled,
is the sole root authority above.

All producer and root containers, databases, ports 39513/38963, listeners,
processes, scripts, and temporary artifacts are removed. No hosted Supabase,
provider, Windows-only, deployment, push, PR, credential, customer-data, or
external activity occurred.

## Validation and adjacent security finding

Root gates pass under Node 24.13.1 and npm 11.8.0:

- exact proportional behavior 67/67 across 11 files, plus corrected CSV export
  2/2; an earlier command named one nonexistent export-route test and truthfully
  ran only its ten discovered files at 59/59;
- TypeScript and focused ESLint;
- recovery over 37 tables;
- Fedora-portable coordinator 12 passed/26 Windows-native skipped;
- production build 11/11 pages;
- fresh PostgreSQL G-002 2/2, G-003 6/6, G-004A 2/2, G-005 1/1, and T-029
  19/19 at 54/52/2.

During a later-family read-only preflight, Huygens found a separate P1 current-
compatibility authorization defect: researchers can preserve `archived=all` or
`archived=archived`, craft `status=excluded`, read same-market retained lead
detail, and claim lifecycle-ineligible rows because server-side constraints do
not clamp archive/exclusion state. Boole and Faraday independently reproduced
the defect. It is not an index defect and is not folded into P33. A bounded
security repair must open and complete before P34; G-011/G-012/G-018/G-019/
G-024 must later carry the repaired invariants into strict tenant cutover.

Independent architecture/authority review found one P2 wording error: common
US was incorrectly called high-selectivity. Sol corrected it to low-selectivity.
The architecture rereview and independent test/evidence review accept the exact
repaired five-file packet with no remaining P0/P1/P2. Faraday's producer
factual cross-check confirms closure without exercising acceptance authority.

## Closeout

Migration inventory remains 54/52/2 and sequence `202607310010` stays free.
After independent P33 acceptance, the residual crosswalk becomes 43/19,
G-003 becomes 20/19, G-002 remains 13/0, original-plan arithmetic remains
58/318 accepted with 260 remaining, and parent G-007 remains open. The next
source-order residual is `idx_leads_enrichment(enrichment_status, score DESC)`,
but the P1 security repair takes precedence and this receipt does not open or
number either packet.

Acceptance commit `3b069a418b2b144bf39f84709aedd0d82de4fd2c` records this
reviewed RETAIN disposition locally. The following lineage-only commit records
that immutable receipt hash and releases the P33 durable-document reservation.
