# G-007P18 AI-feedback reference-index no-defect audit

Date: 2026-08-01

Baseline: `d715de4828f9e67aa5b811f094ebd907e3195ecc`

Branch: `codex/nova-multitenant-integration`

Status: no tenant-query-plan defect; retained with no migration

Receipt commit: pending attributable local commit

## Scope and source ownership

G-007P18 audits the PostgreSQL indexes
`idx_ai_feedback_events_verification_id(verification_id)` and
`idx_ai_feedback_events_artifact_id(artifact_id)`. They originated as scalar
foreign-key advisor indexes. G-004A removed those scalar constraints and
installed exact validated composite constraints from
`(tenant_id,reference_id)` to `(tenant_id,id)` with column-list `ON DELETE SET
NULL (reference_id)`. The retained indexes now serve as scope-neutral child
lookup aids for those composite-FK maintenance actions and any global reference
lookup; they are not authorization surfaces or owners of the removed scalar
constraints.

Verification and artifact IDs remain globally unique primary keys. The
composite constraints and G-004A guard bind every non-null reference to the
same tenant and lead. Current application source inserts references but has no
feedback read filtered by either reference. Current lead history uses
`idx_ai_feedback_events_lead_created`; its future scoped form uses
`idx_ai_feedback_tenant_lead_created`. No approved future reference-read caller
was found.

## PostgreSQL fixture and catalog

A fresh disposable PostgreSQL 16.14 database applied the unchanged chain: 52
migrations discovered, 50 applied, and two runtime-only files skipped. The
physically interleaved fixture contains two tenants, 40,002 leads, 40,002
verifications, 40,002 artifacts, and 160,000 feedback rows (80,000 per tenant).
Each reference column has 120,000 non-null values. Recorded correlations are
0.4964 for tenant, 0.4193 for verification, and 0.4209 for artifact.

All seven feedback indexes are owned by `postgres`, valid, ready, live, and
have `indcheckxmin=false`. Both targets remain exact non-unique, unpredicated,
non-expression single-column btrees. Both tenant reference constraints are
validated, nondeferrable `ON UPDATE RESTRICT / ON DELETE SET NULL` constraints
whose SET NULL list contains only its reference column. The final exact catalog
reread passed with index digest
`0ec0c773bc1cb20ec85ed42d42110c73` and constraint digest
`6d96189e8fbe40e1a08c38701941c4bb`; these digests used a different
construction from the pre-audit snapshot and are not claimed equal. No DDL ran
and candidate residue is zero.

RLS and table privilege isolation remain the accepted, unchanged G-004A
surface and source still revokes PUBLIC, anon, and authenticated access. P18
did not independently repeat that live ACL/RLS gate, so this receipt does not
claim a fresh privacy measurement.

## Natural plans and integrity behavior

The valid hot tenant+verification path naturally uses
`idx_ai_feedback_events_verification_id`, returns 20,000 rows, filters zero,
and reads 1,018 cached buffers in 6.276 ms. The artifact equivalent uses
`idx_ai_feedback_events_artifact_id`, returns 20,000, filters zero, and reads
1,018 cached buffers in 7.040 ms. Unique references return two rows with zero
filtering in five buffers and 0.114/0.147 ms. Global hot paths use index-only
scans for 20,000 rows in nineteen buffers and 2.138/1.916 ms.

An executable tenant-A predicate combined with a tenant-B hot reference
removes 20,000 rows in 7.399/7.679 ms. What cannot exist in a valid catalog is
a matching wrong-tenant child/reference relationship: parent IDs are globally
unique, the composite FK and guard reject it, and no current or approved caller
issues this guessed-ID query. This negative probe is therefore not proof of a
real tenant-query defect.

The current lead-history control uses
`idx_ai_feedback_events_lead_created`; the scoped control uses
`idx_ai_feedback_tenant_lead_created`. Both return fifty rows in six buffers,
confirming that tenant history belongs to a separate index family.

A real verification-parent DELETE invoked SET NULL for exactly 20,000 child
verification references while preserving all 20,000 artifact references. Its
FK trigger took 1,792.284 ms and the statement 1,794.847 ms. A real artifact
DELETE symmetrically nulled exactly 20,000 artifact references while preserving
verification references; its trigger/statement took 1,668.815/1,669.119 ms.
Each transaction rolled back to the same 160,000-row digest
`64837a852481f9d2a39ee7194d07be39` and restored the hot count. These are
adversarial fanout timings, not an SLO acceptance claim. Adding tenant to the
index cannot reduce the 20,000 valid children of a globally unique reference.

A cross-tenant insert failed with
`G004A_FEEDBACK_REFERENCE_SCOPE_INVALID`, leaving zero residue. A cross-tenant
reference update failed with `G004A_FEEDBACK_SCOPE_IMMUTABLE` and retained the
original reference. The final fixture digest and row count were unchanged.

## Disposition, corrections, and cleanup

Independent architecture and evidence-quality reviews pass RETAIN/no defect/no
migration. A tenant-prefixed duplicate adds width and write cost without
reducing any valid candidate set. A partial global index with `WHERE
reference_id IS NOT NULL` is also speculation: 120,000 of 160,000 fixture
values are non-null and no size, write, caller, or approved-SLO defect was
measured. Re-audit a partial replacement only if observed fanout and an
approved maintenance SLO later prove a material problem, or if global parent-ID
uniqueness changes.

Three invalid audit invocations are retained truthfully. A VACUUM named the
nonexistent `ai_generated_artifacts` table and was corrected to
`lead_ai_artifacts`; earlier VACUUM statements had succeeded. An `rg` command
included nonexistent test paths and was rerun against `src/lib/__tests__`.
Eight EXPLAIN statements completed but their jq presentation quoting failed;
the same read-only plans were presented again with the corrected filter. None
changed data or catalog state.

The disposable container and database were removed, loopback port 55448 is
closed, and no P18 process, candidate, worktree, or lock remains. The primary
worktree is clean and `git diff --check` passes. Main remains
`8225df619a96a088f18ff7f574a36b157d55dd2f`. The annotated handoff tag object
is `a3f8278f600be87962642842a3fdd7600242cffd` and still peels to
`0c48035ef4a44b64580716b04d3b629f0c3b5b47`; the program starting HEAD
`d4a1a538e1d6f381954393e28036aeb857b2df6f` is a later descendant, not the
tag target.

Counts remain 52/50/2 and migration sequence `202607310008` remains unused. No
full upstream matrix ran because no migration, source, test, or count change
survived. Parent G-007 remains open. G-007P19 is next for the AI-usage reference
family. The 62-name crosswalk remains fully accounted as 28 mapped/queued and
34 unclassified G-002/G-003 names; P18 is now classified within those 28. No
hosted Supabase, remote migration, production, staging, provider, credential,
deployment, push, PR, or outreach action occurred.
