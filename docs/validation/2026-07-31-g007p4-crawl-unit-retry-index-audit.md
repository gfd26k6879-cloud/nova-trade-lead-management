# G-007P4 crawl-unit retry-ready index audit

Date: 2026-07-31

Baseline: `ad2ada5744e32dec864aeec4b04dbf8d7254ddd2`

Branch: `codex/nova-multitenant-integration`

Status: read-only audit complete; no defect and no migration

Audit receipt commit: `b44896a0a23293341d2d44df411337f8eca7b752`

## Question

G-007P4 tested whether the existing global run-first `crawl_units` retry index
causes a real tenant-query plan defect once G-013 adds mandatory tenant and
explicit nullable-workspace predicates to the current due-retry reset.

The accepted query contract is not a direct retry lease. It first resets due
`retry_wait` rows to `pending`, then leases from the pending family. The exact
audit proxy therefore used tenant, explicit workspace equality or `IS NULL`,
globally unique crawl run, retry status, and due time. The global run index and
current global retry index were preserved because they still support the
current run-only compatibility path and retained single-column parent FK.

## PostgreSQL 16.14 evidence

The corrective acceptance run applied 48 migrations, skipped the same 2
runtime-only migrations, and seeded 120,000 physically interleaved units:

- 2 tenants and 8 runs;
- 2 exact-workspace and 2 tenant-wide runs per tenant;
- 15,000 rows per run: 7,500 retry-wait, 3,750 pending, and 3,750 done;
- retry-wait split evenly between due and future; and
- zero inherited tenant/workspace mismatches.

Natural baseline plans for the exact non-null-workspace UPDATE used a BitmapAnd
of current run and tenant/workspace indexes. The tenant-wide `workspace_id IS
NULL` plan used the current global run/status-capable index. Both inspected only
the target globally unique run's 7,500 retry rows, updated the 3,750 due rows,
and removed only the 3,750 future rows. Wrong-tenant and wrong-workspace
candidates were zero.

A hypothetical
`(tenant_id, crawl_run_id, status, next_retry_at, created_at) WHERE
status='retry_wait'` index occupied 5,088 KiB. PostgreSQL did not select it
naturally for either read or UPDATE workspace form. Current plans remained in
use and showed no material plan improvement. The candidate therefore adds
storage/write maintenance without correcting tenant leakage or a query-plan
defect.

## Disposition and cleanup

No migration, test-count change, runtime repair, or application edit is
justified. Explicit tenant/workspace predicates remain mandatory in G-013 even
though globally unique run identity prevents cross-scope candidates in this
family.

The hypothetical index was dropped. All 12 baseline `crawl_units` indexes were
healthy with zero hypothetical residue. Both audit containers, ports, and
processes were removed. The earlier pre-clarification fixture omitted explicit
workspace semantics and is not acceptance evidence. No repository edit, lock,
remote database, hosted Supabase, provider, production, credential, deployment,
push, PR, or external action occurred during the audit.
