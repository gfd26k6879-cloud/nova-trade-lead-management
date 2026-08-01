# G-007P12 tenant outreach actor index deferred-defect audit

Date: 2026-07-31

Baseline: `e354ffc620ad46476ce808845f1b7d52687c8307`

Branch: `codex/nova-multitenant-integration`

Status: defect proven; migration deferred

Receipt commit: `7fe3eb2e62dbdfec8f65128571de5331e85c7e16`

## Scope and decision

G-007P12 audited only the retained global
`idx_outreach_events_actor_created(actor_user_id,created_at DESC)` family.
One auth identity can be an active member and valid outreach actor in multiple
tenants, so actor identity alone is not tenant authority. The future ordinary
shape requires tenant plus actor and optional time/order predicates.

The material wrong-tenant defect is real, but no candidate is accepted now.
The proposed partial index was:

```sql
CREATE INDEX idx_g007p12_outreach_tenant_actor_created
  ON public.outreach_events (tenant_id, actor_user_id, created_at DESC)
  WHERE actor_user_id IS NOT NULL;
```

It is 7,110,656 bytes versus 9,101,312 bytes for the equivalent full candidate
and 11,010,048 bytes for the retained global. A separate workspace candidate
was rejected as 8,937,472 additional bytes for only a 26-to-24-buffer change.

## PostgreSQL 16.14 evidence and contradiction

The final representative fixture contains 160,000 events, 80,000 per tenant.
Each tenant has 48,000 rows for the same cross-tenant actor, 12,000 for a local
actor, and 20,000 null-actor rows, with mixed null/non-null workspaces and
physically interleaved tenant rows. Tenant B timestamps are newer than tenant A.

The tenant-A actor LIMIT 100 baseline uses the retained global index and
filters 48,000 wrong-tenant rows. The initial audit reported 3,678 buffers and
11.287 ms. Its hypothetical candidate returned identical ordered IDs with an
exact tenant/actor/time `Index Cond` and 11 buffers; current global actor,
lead-local, tenant-lead, joined activity, and tenant/workspace-wide owners were
unchanged.

The implementation acceptance harness did not reproduce that natural-plan
selection on the representative interleaved heap. PostgreSQL chose the global
index at estimated LIMIT cost 29.58 rather than the candidate-only estimated
cost 35.10, actually filtering the same 48,000 rows and reading 3,029 buffers.
Column statistics showed tenant correlation about 0.507 and actor correlation
about 0.996. The planner optimistically expected to find 100 tenant rows early
through the globally ordered index and did not account for the adversarial
tenant/time ordering.

The candidate naturally won only after changing the heap to perfectly
tenant-batched insertion order, producing tenant correlation 1.0, estimated
cost 21.98, 7 buffers, and 0.035 ms. That is physical-order-dependent overfit,
not reliable repair evidence. Planner switches, removal of the compatibility
global, or an overfit covering index were not used. Because the intended index
cannot be shown to serve the complete representative list family while the
current global remains, the required corrected-plan gate fails and no migration
is accepted.

The initial 11-buffer hypothetical is superseded evidence and is not a final
plan claim. Migration inventory remains 52 discovered, 50 applied, and 2
runtime-only skips; sequence `202607310008` remains unused and available.

## Compatibility and dependency disposition

Current unscoped actor counts/history must retain the global index. Current
lead-local list/count remains owned by `idx_outreach_events_lead`; the future
tenant-lead path already has `idx_outreach_events_tenant_lead_created`. P12
does not claim workspace authority or fix the four-table activity UNION,
tenant-wide statistics, actions, sessions, SQLite, UI, or provider behavior.

The index obligation transfers to strict G-015/G-017 functional cutover, after
G-009/G-011/G-016 as applicable. At that boundary current actor-only ownership
can be retired or redesigned and the candidate must be rerun on representative
heaps. G-018 owns server-derived scope propagation. Strict G-020 is worker
dispatch and does not own this family. The legacy ownership map's G-012 and
G-020 citations conflict with those strict cards and must be reconciled before
caller edits; they do not justify DDL now.

## Invalid, rejected, and superseded evidence

- The audit readiness loop exited before migration execution; the pristine
  retry then applied the valid 52/50/2 chain.
- An initial 120,000-row fixture was superseded by the final 160,000-row fixture
  with null actors; it is not final evidence.
- One typoed lead ID returned zero rows and was corrected to a seeded ID.
- The focused implementation run truthfully failed at the candidate-plan
  assertion after its catalog/adversarial checks passed.
- One diagnostic retry used `SAVEPOINT` outside a transaction and is invalid.
- The tenant-batched retry selected the candidate but was rejected as
  non-representative physical-order overfit.

No full G-003 or upstream acceptance matrix was run after the decisive plan
failure because there is no source or migration to accept.

Fresh independent architecture and quality reviews both pass DEFER after the
durable documents were repaired to supersede the initial migration authority.

## Cleanup and authority

The draft migration, harness, runtime non-ownership assertion, and count edits
were all removed. Both candidates were dropped; the four baseline outreach
indexes remain valid, ready, live, and definitionally unchanged. All disposable
containers, listeners, databases, and task processes were removed. No hosted
Supabase, remote migration, production, staging, customer data, provider API,
paid API, credential, deployment, push, PR, outreach, or other external action
occurred. Parent G-007 remains open. The next action is a separate read-only
G-007P13 audit of `idx_lead_notes_author_created`; no migration is assumed. If
that later audit proves a migration, it would use sequence `202607310008` and
produce 53/51/2, not the superseded P12-implementation counts.
