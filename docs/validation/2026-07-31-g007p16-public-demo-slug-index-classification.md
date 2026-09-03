# G-007P16 public demo slug index classification

Date: 2026-07-31

Baseline: `5d93704b2a893e5230b32c0a68312d050bf0adb9`

Branch: `codex/nova-multitenant-integration`

Status: deliberately global/public; retained with no migration

Receipt commit: `dfac6a1b5716e2bfab716a54c4ba2fbf8e01dac5`

## Scope and catalog

G-007P16 classifies
`idx_demos_public_slug(slug,is_published,revoked_at)`. Public demo resolution
accepts only a globally unique slug and deliberately has no tenant input. A
tenant-leading public-slug index would not serve that contract.

A fresh PostgreSQL 16.14 database applied the unchanged 52/50/2 chain. The
four relevant indexes are owned by `postgres`, valid, ready, live, and have
`indcheckxmin=false`:

- constraint-backed `demos_slug_key`, unique btree on `slug`, 5,709,824 bytes
- `idx_demos_public_slug`, btree on `slug,is_published,revoked_at`, 8,249,344
  bytes
- `idx_demos_tenant_lead`, btree on `tenant_id,lead_id`, 671,744 bytes
- `idx_demos_lead_id`, btree on `lead_id`, 671,744 bytes

`demos` has RLS enabled and FORCE disabled. Its ACL is
`{postgres=arwdDxt/postgres}`. Anon and authenticated retain schema usage but
have no base-table read/write, truncate, reference, or trigger privilege.

`novatrade_published_demo_public(text)` is stable SECURITY DEFINER, owned by
`postgres`, uses fixed `search_path=pg_catalog, public`, carries comment
`novatrade:g003:published-demo-public:v1`, and has ACL
`{postgres=X/postgres,anon=X/postgres}`. Anon may execute it; authenticated may
not. Its exact definition SHA-256 is
`dcff6bb8b051171b75ff5276e549d32a06a70e668a61f730a581eeda679ea65e`.

## Fixture and natural plan

The fixture contains 100,008 demos, 50,004 in each distinct tenant/workspace,
and 100,008 distinct global slugs. Each tenant has 12,501 published/unrevoked,
12,501 draft, 12,501 unpublished, and 12,501 revoked rows. The eight named
tenant/state cases have digest
`3646744642a041776d6e9b6f001b248241dbfc57eea946cb16c28cbb3f0ce2db`.

No hypothetical or planner knob was used. The approved function has exactly
one text argument and the exact published/non-revoked predicate, with no tenant
predicate. Its natural underlying query chooses global `demos_slug_key`, not
the tenant-lead family: the demo index scan reads 4 buffers, the complete
nested loop reads 5, and execution is 0.044 ms. Planning reads 20 buffers in
0.503 ms. The cold function scan reads 1,440 buffers/8.870 ms; the warmed anon
scan reads 25/0.599 ms.

Natural negative underlying queries also use the global slug owner: draft and
revoked each read 4 buffers, while missing reads 3. Warm function negatives
return no row for draft, unpublished, revoked, and missing. The larger
`idx_demos_public_slug` is not selected because global uniqueness already
resolves at most one heap row. This is not a tenant-plan defect. Dropping a
possibly redundant compatibility index would be a separate cleanup decision,
not an authorized result of this audit.

## Privacy and result evidence

Anon receives exactly one row for each named published/unrevoked tenant A/B
slug and zero for both tenants' draft, unpublished, revoked, plus a missing
slug. The nine-case matrix digest is
`15fd00bd975431948c340eef4de8524307bc9e291b8aa4e249cb71c366c3b7fc`.

The published-A result has exactly ten bounded top-level keys:
`address`, `config_json`, `maps_uri`, `name`, `phone`, `rating`,
`review_count`, `selling_niche`, `slug`, and `template_id`. Its config output
has only the seven allowlisted keys `headline`, `primaryCta`, `secondaryCta`,
`services`, `subheadline`, `trustSignals`, and `websiteGap`; all four injected
private keys are absent. The result digest is
`46bf1244957d0a666b470b71dd4e1201df53b67f08582b9487acf997b6b3e43c`.

Executed role probes deny anon reads of demos/leads, authenticated demo reads,
and authenticated function execution. A tenant-B insert using tenant A's slug
is rejected by exact `demos_slug_key`, with zero residue.

The current application `getPublishedDemoBySlug` still reads broad demo and
lead rows directly. P16 does not accept that route as privacy-cut over. Strict
G-015/G-024 must replace it with, or prove parity to, the approved bounded
projection.

## Invalid invocations and cleanup

Three invalid invocations are retained truthfully:

1. The first readiness loop encountered the standard image initialization
   restart after `pg_isready`; a version probe saw shutdown. No migration or
   fixture ran, and the same fresh container stabilized before full replay.
2. A metrics-only call to nonexistent `jsonb_object_length(jsonb)` failed and
   was corrected with `jsonb_object_keys` counting.
3. Schema-qualifying special `position(... in ...)` syntax failed and was
   corrected with `pg_catalog.strpos`.

None mutated state. Expected role-denial exits are acceptance evidence, not
invalid runs.

Initial and final complete demo-index/function/RLS/ACL catalog digests are both
`4eaccc0eb308607c0bbcc7a52adb6f98e5d51290f859f29231d1a8356ef401b4`.
There is zero `idx_g007p16%` residue. The database, container, port 55446
listener, and task processes were removed; a transient port helper closed on
poll after container removal. The repository is clean and `git diff --check`
passes. Counts remain 52/50/2 and sequence `202607310008` remains unused.

Independent architecture and quality reviews pass RETAIN/no migration. Parent
G-007 remains open. G-007P17 is the next read-only audit of
`idx_demos_lead_id`; it is not a terminal packet because residual G-004 and
G-002/G-005 global families still require explicit classification. No hosted
Supabase, remote migration, production, staging, provider, credential,
deployment, push, PR, or outreach action occurred.
