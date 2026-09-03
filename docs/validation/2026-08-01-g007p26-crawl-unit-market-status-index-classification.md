# G-007P26 crawl-unit market-status index classification

Date: 2026-08-01

Baseline: `a8b45cd58aeb65c64d0da0ae6f394362c99820b6`

Branch: `codex/nova-multitenant-integration`

Status: retain/defer source classification; no migration

Receipt commit: `18e6e7a92bde686ea7e45850e030710a75b68074`

## Scope and provenance

G-007P26 classifies exactly
`idx_crawl_units_market_status(market_id, status, category)` from tracked source.
It originated unchanged at commit
`fe07602ccfb47f529c8aeb62e249217c8fb1828d` in
`20260602193000_international_markets_and_territories.sql`. The current
migration LF SHA-256 is
`af73cd9d955a69266bac9140eebf981df1e289110ced3d3f1d2e41433ec28372`.

The expected canonical definition is an ordinary nonunique btree on
`(market_id, status, category)`, with source-definition SHA-256
`638a8add1f0c1e59ac7e4be8cf0da2607d830554a56edf3e7d89c0b80c093677`.
This is a source expectation only. No live PostgreSQL object, health,
definition, owner, use, selection, or performance is claimed.

Current SQLite declares the equivalent index. Frozen v1 derives from the same
schema source and does not list this name among replaced legacy indexes, so the
compatibility definition remains. This Fedora classification does not activate
SQLite, advance G-006, or provide Windows/NTFS acceptance evidence.

## Current source and authority

Current market and location-cell coverage reads join `crawl_units` through
`location_cell_id`, with optional run filtering. They do not lead on
`crawl_units.market_id`, and no exact `(market_id, status, category)` reader was
found. Actions and the Coverage UI consume the cell-join results; planner tests
exercise behavior but never name or prove the target index.

`ensureGeographyBackfill` is a real compatibility writer. It fills missing
market/cell/geography fields and is SQLite-default with opt-in PostgreSQL use.
The tracked migration contains a related historical backfill. These writers do
not constitute exact target-index readers or prove plan ownership.

`location_markets` is shared platform reference data. A market ID never
authorizes tenant-owned crawl units; their tenant and optional workspace scope
derives from the parent run. G-010 and G-013 have not defined an exact
tenant/workspace/null-workspace market-unit query. G-021 owns future provider
usage/budget work and is not a current owner.

## Structural RI and disposition

G-002 accepts `crawl_units_market_id_fkey(market_id)`. The target's leading
`market_id` is structurally suitable as a scope-neutral child-side support
candidate for that single-column FK, but the index was separately created and
is not constraint-owned. No RI workload was measured.

G-002 also accepts
`crawl_units_market_cell_fkey(market_id, location_cell_id)`. The target's second
key is `status`, so it does not cover the full compound child key and cannot be
claimed as that constraint's support owner.

The target is retained/deferred as historical PostgreSQL and current/frozen
SQLite compatibility plus unmeasured single-market-FK support candidacy. This
classification makes no claim of exact current query ownership, live catalog
or plan state, health, selection, use, performance, necessity, duplication,
tenant-query sufficiency, replacement, or safe removal.

Real PostgreSQL 16 evidence becomes mandatory before any of those live claims,
before measured RI necessity, or before removal/replacement. Candidate DDL or a
migration additionally requires either an exact approved G-010/G-013 tenant
query plus a proven material plan defect, or a separately authorized RI workload
that proves a material RI defect. A removal packet also requires fresh/upgraded
compatibility and transactional RI/drop/rollback evidence.

No test or service was required for this static classification. Independent
authority and evidence reviews accepted the source-only disposition with no
P0/P1/P2 findings. No file outside the five-document receipt set was changed.
No test, PostgreSQL service, container, listener, task-owned runtime process,
temporary artifact, extra worktree, or lock was started or left. No
hosted/provider system, production environment, deployment, push, or pull
request was used.

Counts remain 54 discovered/52 applied/2 runtime-only skipped. Sequence
`202607310010` stays free. The crosswalk becomes 35 classified/27 unclassified,
with G-002 at 10/3. Parent G-007 remains open and no downstream card unlocks.
