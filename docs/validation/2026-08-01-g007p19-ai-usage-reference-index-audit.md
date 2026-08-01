# G-007P19 AI-usage reference-index no-defect audit

Date: 2026-08-01

Baseline: `c15cf94c24093769a1f1648deb4d4f392474ad7b`

Branch: `codex/nova-multitenant-integration`

Status: accepted RETAIN/no tenant-query-plan defect/no migration

Receipt commit: recorded by the following lineage update

## Scope and source ownership

G-007P19 resumes after accepted G-004A-R1 and audits
`idx_ai_usage_events_lead_id(lead_id)` and
`idx_ai_usage_events_verification_id(verification_id)`. Both originated in
`202607120002_harden_database_function_access_and_fk_indexes.sql` explicitly as
child-side support for foreign-key cascade/delete checks.

Current application source inserts both references but has no read predicate or
join on either. `getAiUsageForActor` projects `verification_id` while filtering
actor, request source, and time; statistics aggregate success and time. G-014,
G-017, G-020, and G-021 require tenant-scoped usage operations, aggregates,
dispatch, and budgets but define no lead- or verification-reference history
endpoint. Parent IDs are globally unique. These targets are therefore
scope-neutral referential-maintenance indexes, not authorization surfaces or
current/approved tenant-query indexes.

G-004A owns exact composite `(tenant_id,reference_id)` constraints and runtime
tenant/reference coherence. G-004A-R1 only permits legitimate nested
referential nulling and does not supply tenant authority. Its accepted source is
`e6e72b213e840af7365fd08bd26ed4e493f97386`; the earlier bad full-hash expansion
is superseded by the append-only correction at
`c15cf94c24093769a1f1648deb4d4f392474ad7b`.

## Fresh PostgreSQL 16 evidence

A fresh pinned PostgreSQL 16.14 container and uniquely named loopback database
discovered 53 migrations, applied 51, and skipped the two runtime-only files.
The repaired minimal legal two-tenant graph first proved that deleting a
both-linked lead now succeeds, nulls both usage references, preserves tenant
and metadata, and leaves tenant B's digest
`120cf6e1...ff3` unchanged.

The representative fixture contains two tenants, 20,001 leads, 20,001
verifications, and 160,002 physically interleaved usage rows. Each reference is
non-null in 120,001 rows and 80,001 rows hold both references. Correlations are
0.50287 tenant, 0.50342 lead, and 0.50468 verification; null fractions are
approximately 0.25.

Both targets are exact unpredicated, non-expression `text_ops` btrees owned by
the table owner, valid, ready, live, nonunique, immediate, and
`indcheckxmin=false`. The lead index is 3,383,296 bytes and the verification
index 3,014,656 bytes. The identically constructed initial/final target catalog
digest is
`ab76e97432cb60340e1c1114c6fbb4d793bdc03fa306e77c9f6c3de2dd808651`;
the exact composite-constraint digest is
`25af08d0167ad4bd6072701cf3cd0794fb6ea5de8e3a6e1775808d8e708b2a16`.

Natural correct-tenant lead and verification probes each use their exact target,
return six rows, remove zero rows, and touch four shared buffers in 0.075 and
0.034 ms. Wrong-tenant guessed-parent controls return zero after removing only
the six rows attached to the globally unique other-tenant parent; they are
callerless invalid-relationship probes, not proof of a real tenant-query defect.
A tenant history control returns fifty rows through `idx_ai_usage_created`, not
either reference target.

After statistics reset, a rolled-back real DELETE of one bulk both-linked lead
completed in 6.212 ms. Each target recorded one scan and six tuples read. The
transaction removed the target lead/verification and correctly nulled the
references of eight relevant usage rows; rollback restored one lead, one
verification, and all eight usages. Final data digests were
`ca82a64e...3f14f` usage, `6eb7b6cc...c343` leads, and
`5bcf5676...1615` verifications.

## Isolated parent controls

A second fresh 53/51/2 PostgreSQL 16.14 database used two tenants, four leads,
two verifications, and four usage rows. An isolated verification-parent DELETE
completed in 0.705 ms with seven buffer hits: `verification_id` became null,
the seeded null `lead_id` remained null, and tenant, model, endpoint,
success/cache flags, token counts, cost, actor, request source, timestamp, and
metadata were exactly preserved. The symmetric lead-only DELETE completed in
1.659 ms with 28 buffer hits and preserved the other reference and every
nonreference field. Tenant B and catalog were unchanged during both.

Both rollbacks restored exact usage digest
`cfdb86702877a77b55c6de773f82a1d767c62ffcbe8b32484596bcb915508a7c`,
graph digest
`72cff4232a8a5ec443bdf025b05050bee5a6d5aaf45cb6de1bc5824b94498844`,
catalog digest
`ccd3e5df570c6f3056b9833e1d13ba95f8910af1f9f6a3cda662eabb0e064a08`,
and constraint digest
`e6c0530484aa3404c5f2a9a3d2e90355393db6bc69e983a4f09890474b79fcfd`.
The four-row scale naturally used a one-buffer sequential scan, a truthful
small-table control consistent with target use in the 160,002-row fixture.

## Disposition, crosswalk, and cleanup

Independent architecture and quality reviews pass RETAIN/no defect/no
migration with no P0/P1/P2 finding. Both indexes materially serve the exact
composite-FK maintenance paths. A tenant-prefixed duplicate cannot reduce the
valid set for a globally unique parent, and no approved reference-read caller
exists. No hypothetical was justified or created; candidate residue is zero.

The exact companion crosswalk at
`docs/validation/2026-08-01-g007-residual-index-crosswalk.md` records all 62
retained globals: G-002 13 + G-003 39 + G-004A 10 + G-005 0. The P17 split is
28 mapped/queued and 34 unclassified. P18 and P19 classify names already within
the 28. The exact next bounded work is the unnumbered read-only AI-usage
query-history family:

- `idx_ai_usage_actor_created`;
- `idx_ai_usage_created`; and
- `idx_ai_usage_model_created`.

No P20 identifier is opened by this receipt. Parent G-007 remains open.

The initial crosswalk replay omitted `auth` and failed before a usable catalog;
that entire container was destroyed. A newly named, correctly bootstrapped
container produced the authoritative crosswalk. No other invalid resumed-P19
invocation occurred; the five failed/interrupted attempts before the G-004A-R1
stop remain retained in the separate P19 blocker receipt. All main,
supplemental, and crosswalk containers, databases,
listeners, processes, candidates, and temporary worktrees were removed. Ports
42383, 44797, 41199, and 33313 are closed. The implementation/candidate tree was
clean before this documentation-only closeout and `git diff --check` passes;
final clean status is a lineage-commit gate.

Counts remain 53/51/2 and migration sequence `202607310009` remains unused.
No full upstream matrix was required because no migration, source, test, or
count change survived. Main remains
`8225df619a96a088f18ff7f574a36b157d55dd2f`; the annotated handoff tag object
remains `a3f8278f600be87962642842a3fdd7600242cffd` and peels to
`0c48035ef4a44b64580716b04d3b629f0c3b5b47`.

No hosted Supabase, remote migration, production, staging, customer-data,
provider, credential, deployment, push, pull request, outreach, or other
external action occurred. G-004B remains open and separate; the native
Windows/NTFS G-006 lane remains paused with historical 111/111 evidence, and
G-006C2B remains unopened.
