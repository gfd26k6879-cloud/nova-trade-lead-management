# G-007P5 lead enrichment-ready index audit

Date: 2026-07-31

Baseline: `b548172286e1d0dbb7cd5345dbd4f3b2d1427928`

Branch: `codex/nova-multitenant-integration`

Status: tenant-query defect proven; migration deferred at compatibility boundary

Audit receipt commit: `f2465e6c6e764f7c02712083e5b89e70f675d8be`

## Question

G-007P5 tested the tenant-scoped future form of the current lead enrichment
ready selector and atomic lease. The exact scoped contract adds required
`tenant_id` predicates to both the inner selector and outer mutation guard.
`leads` deliberately has no `workspace_id`. Recovery sweeps are a separate
family and were excluded from the final packet decision.

The current PostgreSQL and SQLite compatibility functions remain unscoped.
Therefore an eligible pre-cutover packet had to improve the tenant-scoped path
without regressing the exact current unscoped ready query.

## PostgreSQL 16.14 evidence

The full local chain discovered 48 migrations, applied 46, and skipped the two
named runtime-only migrations. The first audit used 100,000 physically
interleaved leads, 50,000 per tenant, including ready, excluded, archived,
exhausted, retry-wait, running, and enriched populations.

The natural baseline tenant-ready plan used the global partial enrichment
index, considered 25,000 candidates, and removed 15,000: 12,500 belonged to
the other tenant and 2,500 were same-tenant exhausted rows. It consumed 1,547
buffers and 18.920 ms. The exact tenant-guarded lease showed the same candidate
shape. This proves a material tenant-query plan defect.

A refined ready-only candidate was then tested on a fresh PostgreSQL 16.14
database with the same complete chain and representative 100,000-row fixture:

```sql
CREATE INDEX idx_g007p5_leads_tenant_enrichment_ready
  ON public.leads (tenant_id, score DESC, updated_at ASC)
  WHERE enrichment_status = 'pending'
    AND enrichment_attempt_count < enrichment_max_attempts
    AND score > 0
    AND archived_at IS NULL
    AND COALESCE(is_excluded, 0) = 0;
```

The 984 KiB candidate was naturally selected by the exact future tenant-ready
selector. Tenant scope appeared in `Index Cond`, no rows were filtered, and the
plan used 3 buffers in 0.023 ms. The exact tenant-guarded lease used the same
index for its inner selector and the tenant/id unique index for its outer guard,
completing in 0.440 ms.

## Compatibility stop condition

The candidate is not safe to install independently. With both existing global
enrichment indexes retained and healthy, PostgreSQL naturally selected the new
tenant-first index for the exact current unscoped `getUnenrichedLeads` shape.
It scanned all 20,000 eligible rows across both tenants and performed a top-N
sort: 2,231 buffers and 22.227 ms. Merely retaining the global definitions does
not preserve their planner ownership. Removing them would also regress the
supported unscoped compatibility path and would cross the paused SQLite/query
cutover boundary.

No migration is opened. The exact candidate remains valid evidence for the
later tenant-scoped enrichment cutover, but it must be reconsidered with the
G-011/G-012/G-014/G-019/G-020 query and worker transition or another separately
approved compatibility-preserving design. This result does not authorize a
query API, worker route, fairness, recovery, or SQLite change.

## Cleanup

Every hypothetical index was dropped. The final catalog restored all 35
baseline lead indexes as valid, ready, and live, with zero G-007P5 residue.
Both fresh audit containers and their loopback ports were removed. The
repository remained clean at the unchanged baseline. No lock, remote database,
hosted Supabase, provider, production, credential, deployment, push, PR, or
external action was used.
