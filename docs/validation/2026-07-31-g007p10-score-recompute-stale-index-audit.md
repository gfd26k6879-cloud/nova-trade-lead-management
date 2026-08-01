# G-007P10 score-recompute stale index audit

Date: 2026-07-31

Baseline: `d0be97dda153df1555116816a678df5a7b737e07`

Status: accepted deferred defect; no migration

## Decision and evidence

G-007P10 audited the ordered stale score-recompute selector at limits 1, 100,
500, and 100000 plus its stale/fresh scheduler counts. Future forms add tenant
identity while preserving archived-only exclusion, included excluded leads,
text timestamp casts, ordering, and limits.

On PostgreSQL 16.14 with the accepted 51/49/2 chain, 180,000 alternating rows
made tenant B strictly newer than tenant A. Tenant A had 45,000 active stale
rows. The global baseline removed 90,000 newer wrong-tenant rows even at limit
1 (10,683 buffers); limit 100000 used a sequential scan and external sort.

Four structural candidates were tested. The tenant mirror safely improved only
limits 1/100/500 and left limit 100000 and the tenant count defective. The
tenant/archive full candidate did not fix selectors and captured current counts.
The archive-partial mirror left limit 100000 defective and captured current
counts. The covering archive-partial candidate was the sole complete correction:
tenant limits used 4/5/13/819 buffers and the tenant count 819, with identical
IDs/order/counts. It also captured the exact current limit-100000 selector and
both current stale/fresh count owners, triggering the compatibility stop.

Independent architecture and quality reviews pass DEFER. No migration or lock
opened. The obligation transfers to G-009/G-011/G-012/G-014/G-019/G-020; any
ordinary dashboard projection also follows G-017/G-018. Runtime global-index
repair and the legacy-unscoped route remain unchanged until that cutover.

All four candidates were dropped, P10 residue is zero, and 38/38 baseline lead
indexes are healthy. The container, port 55492, and task processes were removed.
There were no invalid attempts and the repository remained clean. No remote,
hosted, production, provider, credential, deployment, push, or PR action
occurred.
