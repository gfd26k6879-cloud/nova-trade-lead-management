# G-004A AI tenant scope and worker envelope

Status: structural milestone implemented locally; acceptance requires the dedicated disposable PostgreSQL 16 rehearsal.

G-004A adds immutable, lead-authoritative `tenant_id` scope to `ai_lead_verifications`, `lead_ai_artifacts`, `ai_feedback_events`, and `ai_usage_events`. Workspace remains nullable for verification, artifact, and feedback rows: null means tenant-wide and is never inferred from a lead or actor. Existing lead-linked rows receive scope only from the G-003 lead parent; legacy unlinked usage can receive scope only from exactly one completed matching T-028 receipt. New unlinked usage rows fail closed.

The migration takes writer-conflicting locks, requires receipt counts/checksums and zero orphan count before nonempty upgrade, validates feedback and usage parent consistency, enforces tenant compound FKs, active same-tenant actor attribution for new or changed attribution, enables RLS, revokes client-table privileges, and creates tenant-first queue/history indexes.

`worker_runs` remains platform-global. G-004A neither adds tenant/workspace columns to it nor consults it as authorization or selection authority. Its current `result_json` may contain tenant content. Runtime worker correlation and `result_json` redaction are explicitly **not satisfied by G-004A** and remain the G-004B blocker for G-013/G-014.

The accepted T029 `user_market_access` recovery-key mismatch remains unchanged: `user_market_access: target primary key does not match the recovery contract`.
