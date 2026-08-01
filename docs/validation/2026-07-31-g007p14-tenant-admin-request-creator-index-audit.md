# G-007P14 tenant admin-request creator index deferred-defect audit

Date: 2026-07-31

Baseline: `3b79cf51d8fa8081eeda36f37768e7ec571847bc`

Branch: `codex/nova-multitenant-integration`

Status: defect proven; migration deferred

Receipt commit: `d4fad818b301d25934bddf760c641dd6cf47ec8e`

## Scope and fixture

G-007P14 audits only retained global
`idx_admin_requests_creator_created(created_by_user_id,created_at DESC)`.
Creator identity is not tenant scope: the same auth identity can have active
memberships in both tenants. The creator column is nullable and its real auth
foreign key uses `ON DELETE SET NULL`.

The unchanged 52/50/2 migration chain was applied to PostgreSQL 16.14. The
fixture contains 160,000 physically interleaved requests, 80,000 per tenant.
Each tenant has 44,000 requests from the shared creator, 4,000 from the shared
team lead, 20,000 from a tenant-local creator, and 12,000 null-creator rows
produced through the real foreign-key delete action. It has 53,334 open rows
per tenant, balanced request types, all six statuses, three workspace states,
40,000 leads per tenant, and 160,000 unique timestamps. Correlations are
0.49996 for tenant, 0.49971 for created time, and 0.98727 for creator.

## Plan evidence and decision

The tenant/shared-creator LIMIT 25 baseline uses the global creator index,
removes 44,000 wrong-tenant rows, reads 3,252 buffers, and runs in 7.965 ms.
LIMIT 100 removes the same 44,000 rows at 3,257 buffers/6.676 ms. The
workspace LIMIT 100 removes 44,200 at 3,271/6.928 ms. The tenant creator count
uses a parallel scan at 5,636 buffers/18.521 ms.

The full candidate is:

```sql
CREATE INDEX ... ON public.admin_requests
  (tenant_id, created_by_user_id, created_at DESC);
```

It is 9,240,576 bytes. It improves the tenant creator count to 318
buffers/4.911 ms and the exact half-open range to 11 buffers/0.098 ms, but the
natural LIMIT 25/100 and workspace history plans still use the global index and
retain the complete wrong-tenant work.

The creator-nonnull candidate is:

```sql
CREATE INDEX ... ON public.admin_requests
  (tenant_id, created_by_user_id, created_at DESC)
  WHERE created_by_user_id IS NOT NULL;
```

It is 8,052,736 bytes and its healthy three-key partial definition was verified
from the catalog. It improves the count to 318 buffers/4.099 ms and range to
11/0.088, but the same natural LIMIT and workspace paths still select the
global index. A representative joined tenant/creator history also continues to
remove 44,000 rows through the global index.

The count/range improvements do not repair the complete creator activity
workflow. A two-key count-only index would abandon the approved time-range
shape, and a count/range-only optimization is a separately justified G-017
packet after caller scoping. P14 cannot silently narrow to that partial result.
Independent architecture and quality reviews both pass DEFER/no migration.
The unresolved family transfers to strict G-015/G-017 cutover, with G-018
owning server-derived scope propagation.

## Compatibility and result evidence

- Current unscoped creator count/history retain the global creator index at
  782 and 10 buffers respectively.
- The P11 tenant-wide open list retains the P11 index at 39 buffers/0.181 ms.
- The team-lead OR form retains its parallel hash/scan shape at 5,765
  buffers/17.745 ms.
- Null-creator history remains a parallel scan/sort at 5,712 buffers.
- Lead-local and tenant-lead forms retain their intended indexes at 5 buffers.
- Primary-key lookup retains `admin_requests_pkey` at 4 buffers.

Ordered SHA-256 digests remain stable:

- tenant creator LIMIT 25: `1a2fe8705059bbc6e622c540792a1814380eb09aa4caeb54c68c3d2c0392f7ee`
- tenant creator LIMIT 100: `aaad992e9837599bf100508e9ee86a777eb5ccf67dd5e7dd04e90da129eed351`
- current creator LIMIT 100: `3dc2257a8369d5e0758898843fa73ff886174eb8add7c68356b00de74aed2c11`
- P11 list: `1577739e6fb896fe42e9cfdfd8d1b1fb4735b4da3d2fab144eeee4639ea19871`
- null creator: `ec058599793c97e4e83279593feab6c7024b1fad0740193c1ec804ea2348b5b5`
- half-open range: `3ee0064fe41ac9699084688ed406d311ae4c03c5fdb5a368db8a35e6c1dbe634`

The half-open range returns 1,001 rows with the lower boundary included and
the upper boundary excluded.

## Cleanup and disposition

No invalid/retried invocation or planner switch occurred. No full/upstream
acceptance matrix was run because no migration, source, test, or count change
survived.

Both hypotheticals were dropped and candidate residue is zero. All eight
baseline admin-request indexes remain valid, ready, and live. The
container, database, listener on port 55442, and task processes were removed.
The repository is clean and `git diff --check` passes. Counts remain 52/50/2
and `202607310008` remains unused.

No hosted Supabase, remote migration, production, staging, customer data,
provider API, paid API, credential, deployment, push, PR, outreach, or other
external action occurred. Parent G-007 remains open. After this receipt is
committed, G-007P15 is the next separate read-only audit of
`idx_admin_requests_assigned_created(assigned_admin_user_id,created_at DESC)`;
no migration is assumed.
