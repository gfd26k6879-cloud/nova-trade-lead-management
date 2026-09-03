# G-007P20 AI-usage query-history index audit

Date: 2026-08-01

Baseline: `b7b66b58d5d4c0470b006932450dfb15d6f13339`

Branch: `codex/nova-multitenant-integration`

Status: actor defect proven; migration deferred to one bounded write packet

Receipt commit: `ef6d4154d86cbe0e71aac56a55484424db32d77d`

## Scope and dispositions

G-007P20 audits:

- `idx_ai_usage_actor_created(actor_user_id,created_at DESC)`;
- `idx_ai_usage_created(created_at DESC)`; and
- `idx_ai_usage_model_created(model,created_at DESC)`.

The actor index is retained for the current unscoped compatibility query. The
exact production researcher-cap form, with mandatory tenant added, has a
material plan defect. One narrowly named researcher-cap/budget write packet is
justified; generic alternate-source G-014 actor usage remains open.
The created index is retained: it owns the current bounded global statistics
aggregate, while existing
`idx_ai_usage_tenant_created(tenant_id,created_at DESC)` owns the future tenant
time aggregate. The model index is RETAIN/DEFER because P20 establishes neither
a removal basis nor a current/approved tenant or platform query owner.

Current source reads actor usage by actor equality, a nonempty request-source
`IN` set, and a created-at lower bound, then performs verification/artifact
deduplication and fallback accounting in JavaScript. One auth identity may have
active memberships in multiple tenants, so actor identity is not tenant
authority. G-014 owns the caller scope cutover and G-021 owns tenant budgets;
strict G-020 owns fair dispatch, not model aggregation. The tenant contract
requires platform model-health metrics to use a separate named and permissioned
platform resource. The residual crosswalk owner annotations are corrected by
this receipt accordingly.

## Fresh PostgreSQL 16 fixture and catalog

A fresh uniquely named loopback PostgreSQL 16.14 database used the pinned image
digest
`sha256:33f923b05f64ca54ac4401c01126a6b92afe839a0aa0a52bc5aeb5cc958e5f20`.
The chain discovered 53 migrations, applied 51, and skipped the same two
runtime-only files.

The authoritative corrective actor fixture contains 300,000 physically
interleaved usage rows, 150,000 per tenant, from `2026-04-03T00:01:00Z`
through `2026-08-01T00:00:00Z`:

- shared-actor rows: 155,845; null-actor rows: 27,272; three distinct non-null
  actors;
- four models at 75,000 rows each and exactly 37,500 per tenant;
- `researcher_ai_check`: 110,770; `researcher_pitch_pack`: 55,385;
  `platform_batch`: 55,384; `worker_verification`: 55,385; and null source:
  23,076, including 20,979 rows with a non-null actor;
- successful: 270,000; cached: 42,857; null lead: 75,000; null verification:
  75,000.

Recorded correlations are 0.41242 actor, -0.30306 created time, 0.24465 model,
0.28120 source, 0.49659 tenant, 0.81966 success, and 0.75334 cache. Actor/source
null fractions are 0.0912/0.0794; all other listed null fractions are zero.
Initial and final fixture digest is
`c125acd9bfd415cb8652ff989b05a8011adef890cad6557e769f4f9262d7cbb6`.

All four inspected indexes are postgres-owned, valid, ready, live, nonunique,
immediate btrees with `indcheckxmin=false`, exact native opclasses, and no
expression or predicate:

- actor: 12,705,792 bytes;
- created: 6,766,592 bytes;
- model: 11,149,312 bytes;
- tenant-created: 12,427,264 bytes.

The identically constructed initial/final target catalog digest is
`6406fb043694f6d93ee9139143873370a41af306b9e222f91b0f54b704d29126`.
The nine-object G-004A/R1 function/trigger/constraint foundation digest is
`06fe2a3ba9a072725e996596843487baa60f218d8624307fe3e9d5c7fff6208d`.
The invalid cross-tenant actor control rejects with
`G004A_ACTIVE_SAME_TENANT_ATTRIBUTION_REQUIRED`; a combined R1 lead delete
nulls both references, preserves metadata, and rolls back exactly.

## Natural baseline plans and result truth

Actor-cap, tenant-time, and global-model rows below use their exact lower-bound-
only shapes. The seven-day global-time control uses its exact half-open window.
Ordered/aggregate result truth is:

| Query | Rows | Cost | Cached | SHA-256 digest |
|---|---:|---:|---:|---|
| current actor/source lower-only | 25,688 | 63.970030 | 6,421 | `b89243abcbfddb9388aacfa20d0768f0ee44f4dc8a46f3a54cdb496c2e4e015b` |
| tenant actor/source lower-only | 12,845 | 31.880940 | 3,212 | `9231a84f1d20417ca8bb345cfb677d7eb3d3e589715bd6469e648dfd50861f6a` |
| global time 7d | 18,144 | 45.273600 | 2,592 | `4a1889be2101b1bf8e0c4177618172e5bcb09601353e20e689bbfe77a939e266` |
| global model lower-only | 20,088 | 50.088800 | 2,871 | `77765801ef7941caf0ab628b74a80f02bc5caa49198b29e48aaf577f58595cbe` |
| tenant time lower-only | 35,712 | 89.246400 | 5,102 | `c36342fb1189e1efb9ec46317b8b1c3d23962e09bfc69b592026224b46115613` |

Natural exact current actor planning uses `idx_ai_usage_actor_created`, reads
46,380 index rows, returns 25,688, removes 20,692 null/other-source rows, touches
3,184 buffers, and executes in 19.647 ms. The exact tenant-added cap plan uses
`idx_ai_usage_tenant_created`, reads 44,641, returns 12,845, and removes 31,796
rows: 21,451 other actors, 1,783 null-source owner rows, and 8,562 other-source
owner rows. It touches 3,177 buffers and executes in 9.752 ms. Wrong-tenant
rows are zero; the current actor result splits tenant A/B 12,845/12,843.

The bounded global time aggregate uses `idx_ai_usage_created` for 18,144 rows,
730 buffers, and 3.567 ms. The tenant time control uses
`idx_ai_usage_tenant_created` for 35,712 rows, 3,177 buffers, and 8.399 ms. The
global model plan uses `idx_ai_usage_model_created` for 20,088 rows, 3,078
buffers, and 4.907 ms. Corrective all-time and exploratory tenant-model cases
were not rerun and are not part of authoritative result truth. The earlier
exploratory tenant/model filtering cannot authorize DDL because no approved
caller exists.

## Actor candidate comparison

Each candidate was installed with ordinary transactional CREATE INDEX and
rolled back:

| Candidate | Size | Returned / residual-filtered | Buffers | Time |
|---|---:|---:|---:|---:|
| full `(tenant_id,actor_user_id,created_at DESC)` | 15,622,144 | 12,845 / 10,345 | 3,118 | 7.210 ms |
| same three keys, `WHERE actor_user_id IS NOT NULL` | 14,270,464 | 12,845 / 10,345 | 3,118 | 7.803 ms |
| four keys, `WHERE actor_user_id IS NOT NULL` | 20,250,624 | 12,845 / 0 | 3,095 | 4.760 ms |
| four keys, `WHERE actor_user_id IS NOT NULL AND request_source IS NOT NULL` | 18,825,216 | 12,845 / 0 | 3,095 | 4.592 ms |
| cap-specific `(tenant_id,actor_user_id,created_at DESC)` with non-null actor and exact two-source predicate | 7,995,392 | 12,845 / 0 | 3,057 | 4.623 ms |

The smallest exact production-cap candidate is naturally selected through the
real parameterized lower-bound-only query, eliminates residual filtering,
preserves digest `9231a84f...50861f6a`, and is 52.6% faster than baseline. Its
exact predicate is `actor_user_id IS NOT NULL AND request_source IN
('researcher_ai_check','researcher_pitch_pack')`. At 7,995,392 bytes it is
10,829,824 bytes smaller than the general source-nonnull four-key alternative.

With it present, the current cap remains on the global actor index and returns
the same 25,688 rows. An alternate `worker_verification` current query remains
on global actor and returns 8,564 rows with digest
`2976a08ba543c94f00c3554cf5eff4f130702d42fe896815d905e161ec95b358`;
its tenant proxy remains on tenant-created and returns 4,281 with digest
`be1f172e729d8ebc1d92b660bb34c773d1ab5ed12cd0b2069fa812fc239617d7`.
Thus alternate-source correctness is preserved but not optimized. Tenant-time,
global-created, and global-model retain their owners. Rollback restores exact
fixture, target-catalog, and foundation digests; candidate residue is zero.

This candidate is cap/budget-specific. The exported helper accepts arbitrary
nonempty sources, so broader generic G-014 actor optimization remains open. A
write packet choosing this definition must pin its two-value predicate, name
the researcher-cap owner, and test that production source constants still match.
Tenant/null-source/alternate-source history remains outside that packet.

## Disposition, corrections, and cleanup

Independent architecture and quality review pass DEFECT PROVEN / migration
deferred with no remaining P0/P1/P2 finding. The next write packet is the
researcher actor-cap/budget path only, additive, and must preserve the global
actor and generic alternate-source owners. Broader G-014 actor optimization,
created, and model remain outside it. Counts remain 53/51/2 and migration
sequence `202607310009` remains free until a guarded migration is accepted.
Parent G-007 remains open.

Truthful rejected/corrected audit work is retained. The initial fixture formula
correlated model with tenant parity; its model plan was rejected. A corrective
UPDATE could bloat indexes, so the table was truncated and rebuilt before all
authoritative evidence. Catalog queries corrected an ambiguous `oid` and a
`text || char` expression. A final unlabeled UNION was rerun with labels. The
quality reviewer disclosed two read-only row-count probes; statistics were
reset before any counter claim. A cleanup command containing a broad shell
removal form was rejected before execution and replaced by validated-container
removal plus exact unlink.

The initial half-open actor dataset is retained as rejected exact-caller
evidence: the source uses only a lower bound and one boundary row differed.
Two additional fresh corrective databases supplied the lower-only and final
fixed-source comparisons; neither had an invalid invocation or reviewer probe.

All containers/databases and temporary ID files were removed; ports 49321,
49217, and 49219 are closed. Candidate residue is zero and no task process,
worktree, or listener remains. The implementation/candidate worktree is clean
and `git diff --check`
passes before this documentation-only closeout. Main and the handoff tag remain
unchanged. No hosted Supabase, remote migration, production, staging,
customer-data, provider, credential, deployment, push, pull request, outreach,
or other external action occurred.
