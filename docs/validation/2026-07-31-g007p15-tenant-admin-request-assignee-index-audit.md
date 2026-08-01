# G-007P15 tenant admin-request assignee index deferred-defect audit

Date: 2026-07-31

Baseline: `5078238c19e9695a119ad70ae737eeabec4901a1`

Branch: `codex/nova-multitenant-integration`

Status: defect proven; migration deferred

Receipt commit: pending attributable local commit

## Scope and fixture

G-007P15 audits only retained global
`idx_admin_requests_assigned_created(assigned_admin_user_id,created_at DESC)`.
No current SELECT filters by assigned admin. The scoped assignee-history shape
is therefore an explicit future G-015 hypothesis, not current runtime behavior
or migration authority. The nullable assignee foreign key uses `ON DELETE SET
NULL`, and the global index remains a compatibility and auth-user cleanup owner.

The unchanged 52/50/2 chain was applied to PostgreSQL 16.14. The fixture has
160,000 physically interleaved requests, 80,000 per tenant, with tenant B
strictly newer. Per tenant it has 44,000 shared-assignee, 20,000 tenant-local
assignee, and 16,000 null-assignee rows. The nulls were produced by deleting a
retired auth user through the real foreign key. Creators are independent:
32,000 shared, 32,000 local, and 16,000 null per tenant. Workspace distribution
is 26,666 null, 26,667 workspace-one, and 26,667 workspace-two rows per tenant.
There are 40,000 leads per tenant and 160,000 distinct timestamps. Status,
request type, and priority are mixed and balanced. Recorded correlations are
0.48896602 tenant, 0.48846135 created time, 0.98468214 assignee, 0.3762531
creator, and 0.24092466 workspace.

## Plan evidence and decision

The future tenant/shared-assignee LIMIT 25, 100, and 200 baselines naturally
use the global assignee index and each remove 44,000 wrong-tenant rows. They
read 3,243, 3,248, and 3,256 buffers respectively; warm LIMIT 100 runs in
7.212 ms, with a separate recursive JSON-plan run at 14.214 ms. Its planned
Limit cost is 0.42..38.81. Exact-workspace LIMIT 100 removes 44,199 rows at
3,263 buffers/7.549 ms. The shared-assignee count uses a parallel scan at
5,358 buffers/19.361 ms.

The full candidate is:

```sql
CREATE INDEX ... ON public.admin_requests
  (tenant_id, assigned_admin_user_id, created_at DESC);
```

It is 9,175,040 bytes. It improves the shared-assignee count to an index-only
318 buffers/4.270 ms, the null-assignee count to 100 buffers/1.268 ms, null
LIMIT 100 to 976 buffers/5.887 ms, and the null half-open range to 10
buffers/0.097 ms. It still loses every natural nonnull LIMIT 25/100 and
workspace history plan to the global index, retaining all wrong-tenant work.

The nonnull candidate is:

```sql
CREATE INDEX ... ON public.admin_requests
  (tenant_id, assigned_admin_user_id, created_at DESC)
  WHERE assigned_admin_user_id IS NOT NULL;
```

It is 7,585,792 bytes and improves the shared-assignee count to 318
buffers/4.182 ms. Natural LIMIT 25/100/200 still use the global owner, remove
44,000 rows, and read 3,243/3,248/3,256 buffers. Exact-workspace LIMIT 100
still removes 44,199 at 3,263 buffers. Null count and LIMIT 100 revert to the
parallel scan/sort at 5,358 and 5,434 buffers.

No planner knob, forced path, or tenant-batched heap was used. The full
candidate's null/count gains optimize caller shapes that do not yet exist,
while both candidates fail the coherent nonnull history family. P15 cannot
silently narrow into a null-only or aggregate packet. Independent architecture
and quality reviews both pass DEFER/no migration. The unresolved family moves
to exact G-015/G-017 caller cutover, with G-018 propagating authorized scope.

## Result and compatibility evidence

Stable ordered results include:

- tenant shared-assignee LIMIT 100: first `p15-request-a-044000`, last
  `p15-request-a-043901`, SHA-256
  `226275572d2db42875d655fcbeda581065245db0178dae2e7d1020191b5b5960`
- tenant null-assignee LIMIT 100: first `p15-request-a-080000`, last
  `p15-request-a-079901`, SHA-256
  `535223ebe7da1a9def3abd0a65cc8582b3193ae331e8e834eb2679337eaeeec3`
- shared-assignee half-open range: 1,001 rows, lower included and upper
  excluded, SHA-256
  `606c6e82f835a1bad8c69c5eb8a3901f536f2b9f09b15af639b53a1176563c1f`
- null-assignee half-open range: 1,001 rows, lower included and upper excluded,
  SHA-256
  `5742b7324e6093353307001a6aafe26db328d4c4b27b3a36db1235a2ac73aeee`

Nonnull and null LIMIT-100 digests match after both candidate trials. Named
compatibility owners remain intact:

- P11 tenant-open list: P11 index, 37 buffers/0.178 ms.
- Current creator history: global creator index, 17 buffers/0.039 ms.
- Current fulfillment summary: parallel scan, 5,358 buffers/19.439 ms.
- Lead-local and tenant-lead histories: intended indexes, 5 buffers each.
- Primary-key lookup: `admin_requests_pkey`, 4 buffers/0.233 ms.
- Joined activity creator leg: global creator index, 418 buffers/1.840 ms.

The global assigned definition remains intact. All eight baseline
admin-request indexes are healthy; two are unique.

## Invalid invocation, cleanup, and next scope

One reporting-only `jq` invocation addressed a spaced JSON key incorrectly
after valid EXPLAIN output already existed. It failed without mutation and was
immediately corrected with `.["Planning Time"]` using the valid double-quoted
bracket form.
No full/upstream acceptance matrix was run because no migration, source, test,
or migration-count change survived.

Both hypotheticals were dropped and candidate residue is zero. The container,
database, listener on port 55443, and task PostgreSQL processes were removed.
The final process check matched only its transient verification shell because
the shell command contained the task name. The repository is clean and
`git diff --check` passes. Counts remain 52/50/2 and `202607310008` remains
unused.

The audit appendix initially proposed `idx_audit_logs_actor_created` next, but
that recommendation was withdrawn: audit-log tenant context belongs to T-015,
outside this explicitly bounded G-002 through G-005 lane. Independent source
and test reviews confirm G-007P16 instead classifies
`idx_demos_public_slug(slug,is_published,revoked_at)` as a deliberately global
public-identifier family, then G-007P17 separately audits
`idx_demos_lead_id(lead_id)`. No migration is assumed for either.

No hosted Supabase, remote migration, production, staging, customer data,
provider API, paid API, credential, deployment, push, PR, outreach, or other
external action occurred. Parent G-007 remains open.
