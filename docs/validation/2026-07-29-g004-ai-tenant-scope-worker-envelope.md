# G-004A AI tenant scope and worker envelope

Date: 2026-07-29

Status: structural milestone implemented and locally rehearsed; no deployment, remote database, authenticated browser path, or production mutation performed

## Structural boundary

G-004A makes `tenant_id` required and parent-authoritative on `ai_lead_verifications`, `lead_ai_artifacts`, `ai_feedback_events`, and `ai_usage_events`. Verification, artifact, and feedback workspace remains nullable: null means tenant-wide and is never inferred from a lead, actor, metadata, caller-supplied scope, or worker envelope.

A nonempty legacy upgrade requires exactly one completed PostgreSQL T-028 receipt with exact counts, checksums, schema, engine, algorithm, zero orphan count, tenant, and null-safe workspace scope. Existing lead/reference and attribution relationships must resolve inside that receipt scope. Historical inactive attribution remains evidence but cannot authorize a new or changed attribution.

New linked writes accept an omitted tenant and assign it from the authoritative lead or verification. A supplied conflicting tenant fails. Lead/reference/workspace scope is immutable, with internal PostgreSQL referential actions narrowly allowed. PostgreSQL 16 column-list actions null only optional `lead_id`, `verification_id`, or `artifact_id` while preserving required `tenant_id`. New unlinked usage fails until G-004B supplies authoritative runtime correlation.

Replay requires the exact complete catalog: column shape, validated compound FKs and actions, indexes and predicates, trigger shape, function signature/body/owner/config/comment/ACL, RLS, policies, and effective table ACL. A partial or spoofed catalog fails before the install branch and is never silently repaired. All objects and catalog calls are qualified and the guard function has fixed `search_path = pg_catalog, public`.

## PostgreSQL 16 evidence

The focused harness owns a uniquely named loopback-only `--rm` container and database and uses pinned image `postgres@sha256:33f923b05f64ca54ac4401c01126a6b92afe839a0aa0a52bc5aeb5cc958e5f20`. It asserts server major 16 and removes the container in `finally`.

```text
G004A_RUN_DISPOSABLE_PG_TESTS=1 npm test -- --run src/lib/__tests__/ai-tenant-scope-worker-envelope-postgres.test.ts
result: 1/1 passed
```

The executed matrix covers fresh `44 discovered / 42 applied / 2 named scheduler skips`, real nonempty T-028 -> G-002 -> G-003 -> G-004A upgrade, receipt removal and exact replay with post-install rows, hostile search path and shadow objects, receipt tampering/duplication/partial data/scope drift, existing orphan/reference/workspace/attribution failures, rollback snapshots, cross-tenant and omitted-tenant writes, nullable workspace, inactive attribution semantics, feedback/usage immutability, column-list deletion behavior, exact catalog/RLS/ACL identity, function/index/trigger/constraint spoofing, inherited effective privileges, two-client writer serialization, equivalent inputs across two tenants, and an unchanged worker envelope.

The final-conductor repair closes the two findings from the second independent review generation. Exact replay now requires every `tenant_id` to remain `NOT NULL`, while every `workspace_id` remains nullable. Both activation and replay reject non-owner column ACLs and effective `anon` or `authenticated` column privileges; the harness proves nullable-tenant and `GRANT SELECT(id)` spoofs fail without residue and that pre-install column ACLs are not silently cleared.

Regression commands:

```text
G003_RUN_DISPOSABLE_PG_TESTS=1 G003_DATABASE_URL=[unique loopback database] npm test -- --run src/lib/__tests__/lead-crm-tenant-scope-postgres.test.ts
result: 2/2 passed; full chain 44/42/2

G002_RUN_DISPOSABLE_PG_TESTS=1 G002_DATABASE_URL=[unique loopback database] npm test -- --run src/lib/__tests__/location-crawl-tenant-scope-postgres.test.ts
result: 2/2 passed; full chain 44/42/2
```

## T029 accepted blocker

Only the stale migration inventory assertions changed from `43/41/2` to `44/42/2`. Recovery keys, order, behavior, and scripts are unchanged.

```text
T029_RUN_DISPOSABLE_PG_TESTS=1 T029_DATABASE_URL=[loopback t029_tenant_foundation_rehearsal] npm test -- --run src/lib/__tests__/data-transfer-contract.test.ts
result: exit 1; 11 passed, 1 failed after applied=42/skipped=2
blocker: user_market_access: target primary key does not match the recovery contract
```

T029 is not represented as passing. The accepted recovery-key mismatch remains deferred to the recovery-contract work.

## G-004B blocker

`worker_runs` remains platform-global. G-004A adds no tenant/workspace column or tenant FK, does not query it for authorization or selection, and preserves its data byte-for-byte. The PG16 fixture deliberately retains tenant content in `result_json`, proving that result-content redaction is not satisfied here.

Authoritative runtime worker correlation and `worker_runs.result_json` redaction are explicitly **not satisfied by G-004A**. They remain G-004B work required before G-013/G-014 can treat the worker envelope as hardened.
