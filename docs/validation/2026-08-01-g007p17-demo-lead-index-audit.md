# G-007P17 demo lead-index no-defect audit

Date: 2026-08-01

Baseline: `0f22e44c6ac5cd0bc4f6d7cd44edc9eabf1f4608`

Branch: `codex/nova-multitenant-integration`

Status: no tenant-plan defect; retained with no migration

Receipt commit: pending attributable local commit

## Scope and fixture

G-007P17 audits retained PostgreSQL
`idx_demos_lead_id(lead_id)`. G-003 removed the legacy single-column lead
foreign key and installed exact
`demos_tenant_lead_fkey(tenant_id,lead_id)` with
`idx_demos_tenant_lead(tenant_id,lead_id)`. The global index is therefore a
current unscoped-query compatibility owner, not a foreign-key owner or public
identifier.

A fresh PostgreSQL 16.14 database applied the unchanged 52/50/2 chain. The
fixture has 100,000 globally unique leads and 100,000 demos, mirrored 50,000
per tenant. Per tenant, 5,650 leads have no demo, 40,000 have one, 4,000 have
two, 300 have four, and 50 have sixteen. This models the row-reusing lifecycle
with a bounded high-churn tail; sixteen is representative, not a schema cap.

Each tenant has 16,666 null-workspace, 16,667 workspace-one, and 16,667
workspace-two demos. It has 5,650 older revoked rows; newest rows are 14,784
published, 14,783 unpublished, and 14,783 draft. All 100,000 timestamps and
slugs are unique. Tenants are physically interleaved in chronological lifecycle
waves with permuted lead ordinals. Recorded correlations are 0.5027753 tenant,
0.14285493 lead, 0.24691133 workspace, and 1.0 created time. Created-time
correlation reflects the application's append chronology; tenant and lead are
not batched.

## Catalog and natural plans

All five demo indexes are owned by `postgres`, valid, ready, live, and have
`indcheckxmin=false`:

- `idx_demos_lead_id`: 5,062,656 bytes
- `idx_demos_tenant_lead`: 7,389,184 bytes
- `demos_pkey`: 5,529,600 bytes
- `demos_slug_key`: 5,480,448 bytes
- `idx_demos_public_slug`: 5,513,216 bytes

No legacy single-column lead FK remains. The operative validated definition is
`FOREIGN KEY (tenant_id, lead_id) REFERENCES leads(tenant_id, id) ON UPDATE
RESTRICT ON DELETE CASCADE`; tenant and tenant/workspace constraints are also
exact. Initial and final complete demo index/constraint digests are identical:
`8afa284fd19bdc0528f3972f49f80c0e305662855b8fdfd45381d202372a5d6c`.

Current lead-only latest queries for 0/1/2/4/16 histories naturally use
`idx_demos_lead_id`, reading 6/4/5/7/19 buffers. Future tenant+lead latest
queries naturally use `idx_demos_tenant_lead` with both keys in `Index Cond`,
read 3/4/5/7/19 buffers, and perform no residual filtering. A repeat after a
second ANALYZE retains the composite owner at 19 buffers and 25 KiB top-N sort.

Tenant-A queries using tenant-B lead IDs at one- and sixteen-row cardinalities
return zero directly through the composite index in 3 buffers, with no
wrong-tenant scan/filter. Sixteen-history LIMIT 1/4/16/25 forms all use the
composite index, read 19 warmed buffers, sort at most sixteen rows in 25–26
KiB, and execute in 0.049–0.165 ms. Counts for zero/sixteen are 3/4-buffer
index-only scans with zero heap fetches.

The exact interior half-open range returns eight rows, includes its lower
boundary, and excludes its upper boundary. It scans only the sixteen-row lead
history. Workspace-one returns six and filters ten; null workspace returns five
and filters eleven. Each reads 19 buffers. The joined lead form retains the
demo composite and `leads_tenant_id_id_unique`, touching only the target's
sixteen rows.

There is no broad or wrong-scope work. Eliminating an at-most-sixteen-row,
26-KiB in-memory sort is not a structural defect. No
`(tenant_id,lead_id,created_at DESC)` hypothetical was justified or created.

## Results and ownership controls

Current and future latest results match. Per-cardinality SHA-256 digests are:

- zero: `1c747c0468a8f71e6e8a2fcbed579dce61f28f0db2a317ebc4dd1e2ce2c98878`
- one: `0cd73f44409f5b9385104aa6f242f643b40f65d933b685f1f291b6cfb57d1b35`
- two: `bfb2bb74a1d8132f5bf459ac811089d6774c3ace21cd5b0668e44f9f5f7d784a`
- four: `324744fa289a17f4c4a72d28ebd9e6f5994ea4730afefb669e5980d5188e30a9`
- sixteen: `125cd29c23a9b4e937429cae1bed97a52f46c2da351d1a7ec2b6b9ebb7478c3a`

History LIMIT digests are
`6544a8ba9244ad7bc2299e078bda2dcc909187041d2459dcc53621b30ebf7336`
for one,
`980ddb855ab8ec78b2a5e813d7f10fac67d703a028439d9a7f496a6ad7a5f8f7`
for four, and
`60cfb0416de80b71802a17782815389324058b156e37be1bc1a77e55b3f1c714`
for sixteen/twenty-five. The half-open eight-row digest is
`14f13508f10adb5279cb242ee8ed1f8f8b09a13e1c0e7a3378bee861b52bbc5b`.
Null/W1/W2 workspace digests are respectively
`12269f85b09f320059ff505f26e6c2d433c933324a3f79865bba518c2d0325c1`,
`4a5abea9a3df9b591fe98f4b8458fe0805fe19476450e3f3b706f730c85acc54`,
and `2b66ac02e88ae188dabc82e00d895c535db572996ed79bb7ee58d963db7026fa`.

Primary-key lookup retains `demos_pkey` at 4 buffers. The P16 anonymous public
projection returns one bounded row. Exact composite key-share lookup uses
`idx_demos_tenant_lead`, scans only sixteen rows, and reads 19 index buffers.
A lead DELETE inside a transaction invokes the composite FK trigger, removes
the target sixteen demos, and ROLLBACK restores all sixteen. This confirms the
composite index owns cascade traversal while the global lead index remains only
for current unscoped lookup compatibility.

## Disposition and cleanup

Independent architecture and quality reviews pass RETAIN/no defect/no
migration. Retain `idx_demos_lead_id` until G-015 scopes the query family and
G-018 propagates authorized tenant/workspace context. Global lead uniqueness
and efficient lookup do not confer authorization. If future callers introduce
unbounded history/pagination or observed per-lead churn materially exceeds the
representative sixteen-row tail, re-audit the three-key history index.

No invalid/retried P17 invocation occurred. No candidate exists and residue is
zero. The final fixture remains 100,000 leads/100,000 demos, including the
sixteen-row cascade target. The database, container, port 55447 listener, and
task processes were removed. The repository is clean and `git diff --check`
passes. Counts remain 52/50/2 and `202607310008` remains unused. No full
upstream matrix was run because no migration/source/test/count change survived.

Parent G-007 remains open. G-007P18 is next for the AI-feedback reference
family. A source-derived crosswalk identifies 62 retained non-tenant-leading,
non-constraint secondary indexes: 28 are mapped/queued and 34 still require
explicit G-002/G-003 classification; G-005 has zero residual globals. P17 is
not terminal. No hosted Supabase, remote migration, production, staging,
provider, credential, deployment, push, PR, or outreach action occurred.
