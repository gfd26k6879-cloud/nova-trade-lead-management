# G-007P9 active statistics index audit

Date: 2026-07-31

Baseline: `b793ceff77811bf43f6e087d55a06ac98c3e2259`

Branch: `codex/nova-multitenant-integration`

Status: accepted deferred defect; no migration

Receipt commit: `95c2c7ab2cf726927ba43aef50ef9d816c558217`

## Scope and decision

G-007P9 audited only the active-lead statistics counts. The ranged current form
uses a half-open discovered-time window plus `COALESCE(is_excluded,0)=0` and
`archived_at IS NULL`; `range=all` omits the time window. Future ordinary forms
add required tenant identity without changing active or window semantics.

A material tenant-plan defect remains after G-007P8, but no additive candidate
both corrects the ranged and all-time tenant forms and preserves the current
unscoped planner owners. P9 therefore defers without a migration or lock.

## PostgreSQL 16.14 evidence

The audit applied the complete accepted 51/49/2 chain and seeded 160,000
physically interleaved leads under UTC, 80,000 per tenant. Per tenant there were
48,000 active, 16,000 excluded-only, 8,000 archived-only, and 8,000 both rows.
The ranged window contained 15,000 rows, 9,000 active, with explicit
from-minus-one-microsecond, from, to-minus-one-microsecond, and to boundaries.

Exact results were 18,000 current ranged, 96,000 current all-time, 9,000 tenant
ranged, and 48,000 tenant all-time. The healthy retained
`idx_leads_active_discovered_at` owned none of these COALESCE forms. After P8,
tenant ranged still used a BitmapAnd between the global active partial and P8,
reading 7,061 buffers. Tenant all-time scanned 96,000 active rows and filtered
48,000 from the wrong tenant at 8,791 buffers.

Four coherent alternatives were tested independently:

- Exact active partial `(tenant_id,discovered_at)` was the only complete fix:
  tenant ranged fell to 11 buffers and tenant all-time to 45 with no residual
  filter. It also captured both exact current unscoped queries, triggering the
  mandatory compatibility stop.
- The expression-full index preserved current owners but used 9,011 buffers for
  tenant ranged and 48,045 for tenant all-time, materially worse than baseline.
- The structural mirror was never selected because its raw `is_excluded` key
  did not match the COALESCE query.
- The tenant-only active partial improved only all-time, left ranged unchanged,
  and also captured current unscoped paths.

All candidates returned identical counts. Independent architecture and quality
reviews passed the DEFER classification.

## Transfer boundary

The defect transfers explicitly to the tenant statistics caller cutover. Under
the strict plan, G-017 must scope every statistics source aggregate and the
direct page caller; G-018 must thread server-derived scope through the dashboard
summary action. Candidate one must be rerun after the current unscoped path is
explicitly retired or split.

The ownership map cites G-020 for dashboard/statistics platform separation,
while strict G-020 is the fair worker dispatcher. That durable discrepancy must
be reconciled before functional changes. Parent G-007 cannot represent P9 or
the previously deferred P5 as corrected; closure requires explicit non-cyclic
transferred-obligation records.

## Invalid attempt, cleanup, and authority

The first fixture attempted NULL `is_excluded`; the accepted non-null schema
rejected the INSERT atomically. That disposable database/container was
destroyed, and all accepted evidence came from a fresh valid replay using stored
zero while retaining the exact COALESCE query.

All four hypothetical indexes were removed, P9 prefix residue is zero, and all
38 baseline lead indexes are valid, ready, and live. The container, port, and
task process were removed; the repository stayed clean. No hosted Supabase,
remote migration, production, staging, customer data, provider API, credential,
deployment, push, PR, outreach, or other external action occurred.
