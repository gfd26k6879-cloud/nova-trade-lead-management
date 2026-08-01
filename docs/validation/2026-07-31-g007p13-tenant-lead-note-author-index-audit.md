# G-007P13 tenant lead-note author index deferred-defect audit

Date: 2026-07-31

Baseline: `a88d87a20a3b9687f206b0c10190d7af6b6a4736`

Branch: `codex/nova-multitenant-integration`

Status: defect proven; migration deferred

Receipt commit: pending attributable local commit

## Scope and fixture

G-007P13 audits only retained global
`idx_lead_notes_author_created(author_user_id,created_at DESC)`. One auth
identity is a valid active author in both tenants, so author identity is not
scope. `author_user_id` is UUID `NOT NULL`; an author-nonnull partial would be
definitionally redundant and was not used.

The PostgreSQL 16.14 fixture applies the unchanged 52/50/2 chain and contains
160,000 physically interleaved notes, 80,000 per tenant. Each tenant has 48,000
shared-author and 32,000 tenant-local-author rows, 60,000 active and 20,000
soft-deleted rows, mixed null/two non-null workspace states, 600 leads, and
160,000 distinct timestamps. Tenant and created-time correlations are about
0.499. Three app-user projections exercise the joined activity form.

## Plan evidence and decision

The representative tenant/all-author LIMIT 100 baseline uses the global index,
removes 48,000 wrong-tenant rows, reads 2,719 buffers, and runs in 6.279 ms.
The tenant/active-author form removes 48,034 rows at 2,720 buffers/5.681 ms;
the tenant/workspace/active form removes 48,299 at 2,735/5.696 ms.

The full candidate is:

```sql
CREATE INDEX ... ON public.lead_notes
  (tenant_id, author_user_id, created_at DESC);
```

It is 9,469,952 bytes. It improves the tenant all-count to 346 buffers/6.292 ms
and an exact half-open bounded range to 12 buffers/0.089 ms. Natural LIMIT 25
and 100 plans still use the global index and retain wrong-tenant filtering.

The active candidate is:

```sql
CREATE INDEX ... ON public.lead_notes
  (tenant_id, author_user_id, created_at DESC)
  WHERE deleted_at IS NULL;
```

It is 7,110,656 bytes. It improves the tenant active count to 261 buffers/4.102
ms and the bounded active range to 9/0.073, but both ordered limits still use
the global. It also captures the exact current unscoped active-author count,
changing its owner from a 3,810-buffer parallel sequential plan to an 861-buffer
candidate index-only plan. That violates the current-owner non-capture gate.

Neither candidate fixes the complete approved author count/history family while
preserving compatibility. A count-only index would be a different separately
justified packet; P13 cannot silently narrow itself to that partial result. No
migration is accepted. The obligation transfers to strict G-015/G-017 cutover,
with G-018 owning server-derived scope propagation. G-020 is unrelated worker
dispatch.

## Compatibility and result evidence

- Current active author history retains the global actor index at 10 buffers.
- The joined current activity note arm retains it at 311 buffers/0.400 ms.
- The admin no-author arm remains parallel scan/top-N sort at 4,201 buffers.
- Lead-local history retains `idx_lead_notes_lead_created` at 137 buffers.
- Future tenant-lead retains `idx_lead_notes_tenant_lead_created` at 137.
- PK lookup retains `lead_notes_pkey` at 4 buffers.
- Future joined tenant-author still filters 48,034 rows through the global.

Ordered SHA-256 digests remain stable:

- tenant all LIMIT 100: `9d936c8a0a00b3d50726d3d5c14ea84febfdbe80ffd09ada123c81a541ef597c`
- tenant active LIMIT 100: `9b1860bfb9c8703d6249b943f0a7c44596bf8fdba597a0c45c0132c7037a4d54`
- current global active LIMIT 100: `3811a4040cafcc9ae480f9338f2d00dbad655d7cb74c6952601bdaf45fb90590`
- joined note arm: `713a0e2295eb056416356cbdf23faeaf1295d9e9478c9e8145f463da6f71d302`

The exact half-open boundary returns 1,001 total and 750 active notes; the lower
boundary is included and the upper boundary excluded.

Fresh independent architecture and quality reviews both pass DEFER.

## Invalid invocation and cleanup

The first baseline EXPLAIN heredoc omitted `podman exec -i`; it executed no SQL
and made no mutation. The corrected invocation supplies the evidence above.
No full/upstream acceptance matrix was run because no migration/source/test
change survived.

Both hypotheticals were dropped; candidate-prefix residue is zero. The primary
key and three baseline note indexes remain exact, valid, ready, and live. The
container, database, listener on port 55441, and task processes were removed.
The repository stayed clean. Counts remain 52/50/2 and sequence
`202607310008` remains unused.

No hosted Supabase, remote migration, production, staging, customer data,
provider API, paid API, credential, deployment, push, PR, outreach, or other
external action occurred. Parent G-007 remains open. G-007P14 is the next
separate read-only audit of `idx_admin_requests_creator_created`; no migration
is assumed.
