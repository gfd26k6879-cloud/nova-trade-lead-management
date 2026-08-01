# G-007P27 user-market-access index family classification

Date: 2026-08-01

Baseline: `a178f8947c156afca5a1c1d89fdff1ef9ed24ab9`

Branch: `codex/nova-multitenant-integration`

Status: retain/defer source classification; no migration

Receipt commit: pending

## Scope and provenance

G-007P27 classifies the coherent historical pair
`idx_user_market_access_user(user_id, market_id)` and
`idx_user_market_access_market(market_id, user_id)`. Both originated unchanged
at commit `fe07602ccfb47f529c8aeb62e249217c8fb1828d` in
`20260602193000_international_markets_and_territories.sql`. The current
migration LF SHA-256 is
`af73cd9d955a69266bac9140eebf981df1e289110ced3d3f1d2e41433ec28372`.

Expected source-definition SHA-256 values are:

- user-leading:
  `ff426be74981b4f9b52c4559a6a39df55d5fad032701f77af3e7a53e44ce3bfc`;
- market-leading:
  `e382d8a5014458a90a7ce1e5e57be3070b926dc6c9a840d1c5c060a230fdb71b`.

These are canonical source expectations only. No live PostgreSQL object,
definition, health, owner, selection, use, performance, necessity, duplication,
or safe-removal claim is made.

No later PostgreSQL runtime path recreates or drops either target. SQLite
startup executes `SCHEMA_SQL`, whose `IF NOT EXISTS` declarations can install or
retain them; that lifecycle behavior proves no planner selection.

## Identity and SQLite lifecycle

The origin PostgreSQL table used global primary key `(user_id, market_id)` and
also declared both ordinary nonunique indexes. G-002 deliberately drops that
legacy primary key, installs null-safe tenant/workspace identity on
`(tenant_id, workspace_id, user_id, market_id)`, and adds a separate
tenant-market-user index. The legacy user-leading index is not the final
PostgreSQL identity or uniqueness owner.

Current SQLite source retains the legacy global primary key and both indexes.
Frozen final v1 removes the global primary key, installs separate null-workspace
and named-workspace partial unique identities plus a tenant-market-user index,
and retains both legacy index names. The prepared/upgraded legacy lifecycle
still retains its global primary key. These lifecycles are not equivalent, and
this Fedora classification neither activates them nor advances the unopened
G-006C2B writer boundary.

## Current readers and authority

Current compatibility source has user-leading shapes: grant replacement/delete,
single and bulk user lists, exact user/market existence checks, lead-visibility
subqueries, user-removal cleanup, and T-028 compatibility reads. The current
replacement helper still names legacy `ON CONFLICT(user_id, market_id)` and does
not supply final PostgreSQL tenant/workspace scope, so it is not a final
PostgreSQL query or writer contract.

Source key order makes the user-leading target a plausible compatibility-query
candidate, but source alone cannot prove which index a live planner selects.
The legacy PostgreSQL/current-prepared SQLite primary key has the same key order
in those lifecycles. Therefore the target is not called an exact natural plan
owner, necessary, nonduplicate, or safely removable.

No current runtime application reader leads on `user_market_access.market_id`.
Tests contain market-filtered assertion and adversarial transfer queries, but no
test names either target, runs EXPLAIN, or proves index selection. Neither a
globally unique user ID nor a shared platform market ID authorizes a grant.
Tenant, optional workspace, and active membership remain authoritative. G-009,
G-010, G-011, G-016, and G-018 still own the future scoped helper, grant-query,
lead-visibility, user-administration, and authorized action contracts.

## Structural RI and disposition

In PostgreSQL source, `user_market_access.market_id` references the platform
market with `ON DELETE CASCADE`. The market-leading index is therefore retained
as an unmeasured, non-constraint-owned child-side cascade lookup/maintenance
candidate. No RI workload or live constraint ownership was measured.

SQLite's inline market FK omits an action and therefore uses NO ACTION. The
market-leading index is at most an enforcement-lookup candidate there, never
SQLite cascade support or PostgreSQL/SQLite behavioral equivalence. There is no
current runtime market-leading application reader in either source inventory.

Both indexes are RETAIN/DEFER for historical PostgreSQL and current/frozen
SQLite compatibility. The user-leading side retains compatibility-query
candidacy; the market-leading side retains engine-specific structural candidacy.
This does not establish identity, uniqueness, authorization, writer safety,
tenant-query sufficiency, natural plan ownership, measured RI necessity,
cross-engine equivalence, replacement, or removal authority.

Real PostgreSQL 16 evidence is mandatory before any live plan/health/use,
redundancy, exact constraint-owner, measured RI, replacement, or removal claim.
A future candidate or migration requires either an exact approved scoped grant
query with a material plan defect, or a separately authorized FK workload that
proves a material RI defect. Removal additionally requires fresh/upgraded
lifecycle evidence and transactional query/RI drop-and-rollback proof.

No test or service was required for this static classification. Independent
authority and evidence reviews accepted the source-only disposition with no
P0/P1/P2 findings. No file outside the five-document receipt set was changed.
No test, PostgreSQL service, container, listener, task-owned runtime process,
temporary artifact, extra worktree, or lock was started or left. No SQLite
activation, hosted/provider system, production environment, deployment, push,
or pull request was used.

Counts remain 54 discovered/52 applied/2 runtime-only skipped. Sequence
`202607310010` stays free. The two-name crosswalk change yields 37
classified/25 unclassified and G-002 at 12/1. Parent G-007 remains open and no
downstream card unlocks.
