# G-007P19 AI-usage reference audit blocker

Date: 2026-08-01

Baseline: `a7f2f89be5b269d85fba140c1fca84d1ca791402`

Branch: `codex/nova-multitenant-integration`

Status: P19 stopped before index disposition; G-004A-R1 forward repair required

Discovery receipt commit: `50a96cd13feb3a852e526c59815b3d3e7bd2d71a`

## Scope and stop condition

G-007P19 opened the read-only audit of
`idx_ai_usage_events_lead_id(lead_id)` and
`idx_ai_usage_events_verification_id(verification_id)`. Source inspection found
no current or approved usage read filtered by either reference. The globals
remain child lookup aids for G-004A's exact composite column-list SET NULL
constraints. The index plan work stopped before disposition because its
required integrity control exposed a defect in the accepted G-004A guard.

Deleting a lead can reach one both-linked usage row through two independent RI
paths: the usage lead constraint sets `lead_id` null, while the verification
row cascades from the lead and the usage verification constraint sets
`verification_id` null. Existing durable tests cover lead-only and
verification-only usage rows separately, but do not delete the lead of an
event holding both references.

## Clean PostgreSQL reproduction

A fresh disposable PostgreSQL 16.14 database applied 52 discovered migrations,
50 executable migrations, and skipped the two runtime-only scheduler files.
The minimal legal graph contained tenant A and tenant B, each with one lead,
one verification, and one usage event linked to both parents.

Inside a transaction, the single statement
`DELETE FROM leads WHERE tenant_id = <tenant-a> AND id = <lead-a>` failed with
`G004A_VERIFICATION_PARENT_REQUIRED`. PostgreSQL reported the failure from the
scope function during the internal statement that sets `ai_usage_events.lead_id`
to null. Catalog trigger order showed the verification cascade trigger before
the usage lead SET NULL trigger; the latter observed the still-populated
verification reference after its parent verification had become unavailable.

The statement and transaction were atomic. Before and after, the complete graph
contained the same six rows with SHA-256 digest
`d75d4ab85520fe063d6597686577bdae4cb45349e4e188b0f1d7fa8309aafdc0`.
Tenant A's three rows remained and tenant B's three-row control was untouched.
The initial and final exact usage index/constraint/noninternal-trigger/RLS
digest remained
`256529a3e257030a06be8501e8a557c9beb57782a1ed4fe6f7eca8690cb5dad5`,
and candidate residue was zero.

This is an order-dependent integrity/availability defect in
`novatrade_ai_scope_guard()`, not proof of a tenant index defect. P19 has no
RETAIN, DEFER, or migration disposition and cannot resume until the forward
repair is accepted on a new clean full-chain baseline.

## Truthful audit corrections and cleanup

Five failed or interrupted atomic fixture attempts are retained:

1. a temporary table used `ON COMMIT DROP` under autocommit;
2. a DISTINCT projection included a timestamp and duplicated a parent key;
3. the first complete 160,000-row in-transaction fixture exposed the same
   `G004A_VERIFICATION_PARENT_REQUIRED` lead-delete defect and rolled back;
4. a 58,000-parent fixture exhausted its disposable 1-GiB tmpfs and rolled
   back; and
5. a reduced-parent 160,000-row rebuild was interrupted at the conductor's
   priority stop and its open transaction rolled back.

None left parent, usage, catalog, or candidate residue. After the large-fixture
failure, the authoritative minimal reproduction above was performed on a fresh
task-owned database. Expensive P19 plan work then stopped.

The interrupted uncommitted loads extended physical index files despite
rollback, so their final sizes are not representative of the committed two-row
usage graph and are not index-decision evidence. Definitions, health flags,
catalog digest, and committed-row digests remain authoritative.

The task-owned container/database were removed, port 55449 is closed, and no
P19 process, worktree, candidate, or lock remains. The primary worktree is
clean and `git diff --check` passes. Main remains
`8225df619a96a088f18ff7f574a36b157d55dd2f`. The annotated handoff tag object
remains `a3f8278f600be87962642842a3fdd7600242cffd` and peels to
`0c48035ef4a44b64580716b04d3b629f0c3b5b47`.

## Repair boundary

Open G-004A-R1 as a serialized forward-only repair using migration sequence
`202607310008`; never edit accepted migration `202607290003`. The initial write
ceiling is one new PostgreSQL migration, the existing focused G-004A PostgreSQL
test, migration-count expectations proven to require change, and the repair
validation receipt. The repair must make legitimate internal column-list SET
NULL actions order-independent while preserving every direct mutation,
cross-tenant, attribution, catalog-spoof, replay, rollback, RLS, and ACL guard.
It must not expand into open G-004B worker correlation/redaction, runtime repair,
SQLite, provider, hosted, or external work.

Sol owns the serialized migration sequence, scope-guard, test, ledger,
registry, handoff, and acceptance surfaces. One implementer may write only
after the parallel read-only design reviews reconcile. Independent reviewers
must accept the resulting source; the implementer cannot self-accept. Counts
remain 52/50/2 until a repair migration is accepted, and sequence 008 is now
reserved, not consumed. Parent G-007 and P19 remain open.
