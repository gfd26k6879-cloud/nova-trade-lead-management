# G-007P7 tenant AI website-repair index validation

Date: 2026-07-31

Baseline: `9d38b66f4e1d2187be84b10ecab1a85410216d2f`

Branch: `codex/nova-multitenant-integration`

Status: accepted locally

Source commit: `8eccf9108211c0a45878f50214bd6fff19fbec9d`

## Scope and decision

G-007P7 is one PostgreSQL-only additive index packet for the future
tenant-scoped form of `getAiWebsiteViabilityRepairLeads`. The exact current
eligibility contract is `site_found`, a non-null and nonempty found URL, and a
viability status other than `usable`, ordered by `ai_checked_at DESC`.

The installed index is:

```sql
CREATE INDEX idx_g007p7_leads_tenant_ai_viability_repair
  ON public.leads (tenant_id, ai_checked_at DESC)
  WHERE ai_verification_status = 'site_found'
    AND ai_found_website_url IS NOT NULL
    AND ai_found_website_url <> ''
    AND COALESCE(ai_website_viability_status, '') <> 'usable';
```

The retained global `idx_leads_ai_status_checked` remains installed for the
current unscoped compatibility query. No application query, caller, worker,
provider, route, batch mutation, runtime repair source, SQLite schema,
consistency repair, score recomputation, dependency, or external behavior
changed.

## PostgreSQL 16.14 plan evidence

The audit applied the complete 49/47/2 pre-P7 migration chain and seeded
100,000 physically interleaved leads, 50,000 per tenant and 20,000 exact
eligible candidates per tenant. The tenant-scoped baseline used
`idx_leads_ai_status_checked`, removed 35,036 rows including 35,000 newer rows
from the wrong tenant, read 5,883 buffers, and completed in 22.322 ms.

The accepted 1,616 KiB candidate reduced the same scoped read to 17 buffers and
0.070 ms, with tenant identity in `Index Cond`, no residual tenant filter, no
sort, and identical ordered IDs. A separate transactional nullable
`ai_checked_at` case preserves PostgreSQL's `DESC NULLS FIRST` behavior.

Exact current unscoped reads at limits 1, 50, and 200 retain
`idx_leads_ai_status_checked`, never select P7, and return identical ordered IDs
before and after installation. The audit's representative limit-200 plan used
18 buffers both before and after.

## Catalog, replay, and runtime evidence

The migration fails closed unless all five eligibility/order columns have exact
types and nullability, the validated non-inherited AI verification status
constraint is exact, and the G-003 `UNIQUE (tenant_id,id)` constraint has a
unique, valid, ready, live backing index. Initial installation additionally
requires the retained global index to have its exact PostgreSQL 16 definition
and health and requires no literal-prefix P7 relation.

Final replay accepts exactly one healthy index with the canonical key order,
direction, and partial predicate. Missing, direction, predicate, status,
same-name non-index, unhealthy, and reserved-sibling spoofs reject before DDL.
A wildcard lookalike is correctly outside the literal protected prefix.
Transactional rollback restores the exact baseline without partial
installation. Replay is forward-compatible with later authorized global-index
removal and G-007P5 installation while preserving G-007P6.

Live `ensureDbReady` preserves the complete P6/P7 index catalog. The unit
harness proves runtime repair emits no P7 DDL. Independent architecture and
quality reviews both passed without a repair round.

## Root validation results

All accepted commands used Node 24.13.1 and npm 11.8.0.

- G-003/G-007P6/G-007P7: 4/4 in 109.63 seconds on a fresh root PostgreSQL 16
  database; P6 took 22.781 seconds, P7 15.999 seconds, and upstream G-003
  70.657 seconds.
- G-002: 2/2 in 14.30 seconds.
- G-004A: 1/1 in 105.56 seconds.
- G-005: 1/1 in 105.17 seconds.
- T-029: 19/19 in 5.95 seconds with 50 discovered, 48 applied, and 2 named
  runtime-only migrations skipped.
- Q-002: 1/1 in 10.28 seconds on an isolated sequential run.
- Focused runtime ownership and SQLite AI verification: 15/15.
- TypeScript and focused ESLint: pass with zero warnings.
- Recovery verifier: all 37 application tables match SQLite/tracked migrations.
- Fedora-portable SQLite coordinator: 12 passed and 26 Windows-native cases
  skipped. The historical Windows 111/111 evidence is unchanged.
- Production build: pass; 11/11 static pages generated.
- `git diff --check` and full JSONL `jq -s` validation: pass.

## Invalid invocations retained

- The first root shell command exited successfully from its readiness loop
  before Vitest was invoked. PostgreSQL was ready, but no test ran and the
  command is not acceptance evidence.
- The next root G-003 invocation used a loopback database name outside the
  suite's required `g003_lead_crm_rehearsal_` prefix. All three disposable
  cases rejected before schema work. The invocation is not acceptance evidence
  and was rerun against a fresh correctly named database.

## Cleanup and authority

All hypothetical indexes, disposable databases, containers, listeners, and
task processes were removed. No hosted Supabase, remote migration, production,
staging, customer data, provider API, paid API, credential, deployment, push,
PR, outreach, or other external action occurred. `main` and the handoff tag
remain unchanged. Parent G-007 remains open, G-007P5 remains deferred, and the
next safe action after local commit and lock release is a new read-only
G-007P8 audit of the dashboard `idx_leads_discovered_at` family. No migration
is assumed.
