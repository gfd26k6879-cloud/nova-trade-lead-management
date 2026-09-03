# D-005 Migration Baseline and Rehearsal Target

Source task: `D-005 - Verify migration baseline and choose rehearsal target`
Plan: `docs/plans/2026-07-27-multi-tenant-lead-intelligence-platform-implementation-plan.md`
Task status: **Accepted local D-005 baseline; rehearsal instantiation and linked-remote reconciliation remain blocked.**

## Evidence capture metadata

- Repository: `C:\Users\Masih\OneDrive\Documents\Nova Trade\nova-trade-lead-management`
- Branch: `main`
- SHA: `8225df6`
- Capture started: `2026-07-27`
- Working-tree status at capture: dirty (expected, pre-existing)
  - Untracked: `docs/architecture/`, `docs/decisions/`, `docs/plans/2026-07-27-multi-tenant-lead-intelligence-platform-implementation-plan-implementation-ledger.jsonl`, `docs/plans/2026-07-27-multi-tenant-lead-intelligence-platform-implementation-plan.md`, `docs/product-requirements-multi-tenant-lead-intelligence-platform.md`, `docs/product/`, `docs/validation/`

## Command evidence run during D-005

All commands below were executed locally only and completed with explicit exit status.

1. `git rev-parse --short HEAD`
   - Exit: 0
   - Output: `8225df6`
2. `git rev-parse --abbrev-ref HEAD`
   - Exit: 0
   - Output: `main`
3. `git status --short`
   - Exit: 0
   - Output: working tree unchanged except untracked entries listed above.
4. `supabase --version`
   - Exit: 127
   - Output: command not found in environment.
5. `node scripts/verify-data-recovery.mjs`
   - Exit: 0
   - Output: `Recovery contract: 23 application tables match SQLite schema and tracked migrations.`
6. `powershell -Command` migration hash inventory and uniqueness check
   - Exit: 0
   - Output (verified):
     - `MIGRATION_COUNT=31`
     - `UNIQUE_HASH_COUNT=31`
   - Deterministic first: `202605110001_full_schema.sql`
   - Deterministic last: `202607120002_harden_database_function_access_and_fk_indexes.sql`
7. `powershell -Command` trailing-whitespace scan on this file
   - Exit: 0
   - Output: `TRAILING_WS_COUNT=0`
8. Untracked-file-aware whitespace diagnostics check
   - Exit: 1 (expected new-file difference; no whitespace diagnostics)
   - Command used:
     `git diff --no-index --check -- NUL docs/architecture/migration-baseline.md`
   - Output: no whitespace diagnostics; the only warning concerns Git's future LF-to-CRLF conversion.

## Local migration baseline (verified, ordered)

This environment has 31 local migration files in `supabase/migrations`, ordered lexicographically (equivalent to migration timestamp ordering by filename).

| # | File | SHA-256 |
|---|---|---|
|1|`202605110001_full_schema.sql`|`a69dabd06a2655ea6b063f7538d42343c46c2098f2ca475ad44bda64716f0b57`|
|2|`202605120002_supabase_auth_roles.sql`|`917d5f1cdfe16c46ca748a1acd860e810616648904a32fc9d1439abfcc77a5e4`|
|3|`202605130001_lead_quality_command_center.sql`|`a2866ecbb5e7e71fee6be44f768a7979b46fbc4e76df5edbbac5f019b71a7483`|
|4|`202605130002_ai_verified_quality_pipeline.sql`|`d00a68f7eb42a864baf5a4edb98bd14e3396aeb93d5b5c07cce1777d3b2e41df`|
|5|`202605130003_cancelable_discovery_runs.sql`|`cd1ea4bce4617b9aba9aa712e11fd1e87a20c673fd5d69b983c0076ebec098a5`|
|6|`202605130004_lead_ai_artifacts.sql`|`b3f242286481764891a12cfafd8b43c47344556cd724631010d27ab10c393566`|
|7|`20260514161714_supabase_ai_verification_cron.sql`|`3d6393bfea96fad5c2a6b7b6fd9998695654421a5dc94725bd66a803e7bb7d2d`|
|8|`20260514163203_scheduler_v2_sales_ready_pipeline.sql`|`dab9b7bc56defd482a9a28112dd42f3638043c7d36fe877eabf53d4893cf84bb`|
|9|`20260514224341_sync_ai_site_findings.sql`|`7d848cb3783e9b50e43dd1752a4e79faaef09b6a721013cedbf0b8561da69f18`|
|10|`20260515044151_remediation_worker_retries.sql`|`9ed355594db07f0623a6b1505fc47cedc5822ced2b8218697482f222110b7a7a`|
|11|`20260515123000_researcher_workbench_outreach.sql`|`14d3eb3bdbec0db96764fcb3d1db09fb7dd8f45c2ae95270420974bcc51e87cd`|
|12|`20260520114232_admin_fulfillment_queue.sql`|`4fe6cfdafa567677f6ed114b254f06bf5ade983bf8fa425bacaac2d70c59687f`|
|13|`20260525162116_add_google_maps_browser_key_setting.sql`|`78e72850910e886fca4cc42719e0db97d1654516e3d68264081a57de1a7b299a`|
|14|`20260602033000_score_recompute_stale_index.sql`|`9e084d24944f2e5d0c4f0c28879e956fe4b2fbe922728b2c56af6e7b3c47d79c`|
|15|`20260602061959_add_lead_archive_fields.sql`|`dbe580a9b2ea037741f03d010bc88721a26d11bba041026f004368237c030986`|
|16|`20260602070000_workbench_candidate_index.sql`|`97eacbe8f3ce98fbe4cec63c5eeefd5fdfdb7078234887ab3b7b9fd6916da3e2`|
|17|`20260602180000_worker_runs_stale_cleanup_index.sql`|`cb8cc8d5d26446de771c04a36c260421c94c2da351055e3b8919a17acf9fb4de`|
|18|`20260602193000_international_markets_and_territories.sql`|`7603023febb2f208e31d397e0824e37ffa9b9daa47ef65dfd5d638ab09ee7a17`|
|19|`20260603103649_dashboard_count_indexes.sql`|`2627ee06cc7c6caae34376e15a42bbe3b655cff541d4e7ad43fb56e9bd2baf6f`|
|20|`20260603110615_discovery_items.sql`|`4906acb3e8e929c0cdbdbc2a12891f37d2611ffe2b174399ee174cc24cdc86a5`|
|21|`20260603130558_discovery_items_latest_index.sql`|`6547f210606afc003cecede8b2daa8fe44133f9e6bb319b254434f3c4f2601a5`|
|22|`20260603143000_google_places_budget_planner.sql`|`e31eaec2c1b7a0d3e232418cd6ff3786ccd00003cd55df627e34088a6f63f44a`|
|23|`20260606193626_harden_location_access_grants.sql`|`0dd2cf8fd0cd40b3ad74b631ee6961e55429c63aded5adbd7a47e70ec74bd242`|
|24|`20260606195238_target_table_creator_default_privileges.sql`|`7387d569513e36d2958b293d7cac16e1226767ed248df90c0d9e3e1fdd3b5a0f`|
|25|`20260606203000_add_london_ontario_discovery_cell.sql`|`08f44cc0ae0e2cb5353cd098f92d3997fb0f3fc2683b94e0b39e688c00711874`|
|26|`20260610082000_add_london_nw9_discovery_cell.sql`|`9f338ecbed18039ec3b72feef8c9f67ede26b28e31ad13c34f4fb7573dd07deb`|
|27|`20260611010000_agile_discovery_blocked_retry.sql`|`ee85da50e18716699cdc6110f4be2b747811e24a99bf56de5b64a1362f110608`|
|28|`202606160001_launch_readiness_reliability.sql`|`09d31e60bb2d2dcbca8b1836310aa5ea095d414efa4eee7f24e468ea0d27e1fb`|
|29|`202607100001_remove_stored_google_reviews.sql`|`7ae095f1f6b4d8e169f577e28774e1a53579708d279ec47dd3036c286b8610bb`|
|30|`202607120001_reconcile_researcher_ai_feedback_schema.sql`|`b96cd797710375f2353cf5b56639e2c5a30352213500624c3a9f3134243b5390`|
|31|`202607120002_harden_database_function_access_and_fk_indexes.sql`|`e4a5173c70813e16ced1f605e7cfd6c3a21b3d12bc0d84a1a2510e78932aae9d`|

- Migration count: `31`
- First file: `202605110001_full_schema.sql`
- Last file: `202607120002_harden_database_function_access_and_fk_indexes.sql`
- SHA count validated: `31` rows, `31` unique SHA-256 hashes.
- Duplicate checksum check: **none**.

## Migration history drift evidence

### Repository-confirmed historical (past) drift
- `docs/DATA_RECOVERY.md` records a historical remote-only migration `20260610045957` (`researcher_ai_quality_feedback`) not present in local migrations.
- It also records prior reconciliation context for:
  - `202607100001_remove_stored_google_reviews.sql`
  - `202607120001_reconcile_researcher_ai_feedback_schema.sql`
- `docs/CODEX_HANDOFF.md` documents past remote repair and drift handling events.

### Current remote verification state (this task slice)
- `supabase migration list --linked` and `supabase db pull` were not run because:
  - no approved linked read authorization for D-018/A15 in this slice
- Local machine had no `supabase` CLI (`supabase --version` returned not found).
- Therefore, current remote migration state is **unverified** and remains blocked until approval and tooling are in place.

## Recovery contract (current repo-confirmed)

- `scripts/data-transfer-contract.mjs` defines `TABLE_NAMES` with `23` application tables and primary-key contracts.
- `scripts/verify-data-recovery.mjs` verifies:
  - SQLite schema includes all contract tables
  - schema/migration contracts are aligned
- Verified output: `23 application tables match SQLite schema and tracked migrations.`

The contract table order is:

- `zip_codes`
- `location_markets`
- `location_cells`
- `settings`
- `app_users`
- `user_market_access`
- `crawl_runs`
- `crawl_units`
- `leads`
- `lead_notes`
- `outreach_events`
- `admin_requests`
- `demos`
- `place_cache`
- `places_master`
- `place_observations`
- `api_usage_events`
- `ai_lead_verifications`
- `ai_usage_events`
- `lead_ai_artifacts`
- `ai_feedback_events`
- `worker_runs`
- `audit_logs`

## Selected target specification / not yet instantiated

This task did not create, connect to, or verify a rehearsal database/project. The target remains **selected but not instantiated / not verified**.

- Status: pending.
- Provisional target identity: `nova-trade-rehearsal-d005`.
- Target allowlist requirement (strict before activation):
  - Explicit allowlist must reference an approved project/ref and be signed by owner in the ledger.
  - Owner approval receipt for non-production use must be present in this task slice.
  - Must include non-production-only identifiers and disallow production aliases/URLs.
- Allowed credentials:
  - No production alias or production credentials may be used.
  - No live production data may be loaded.
  - Rehearsal baseline must be empty or fixture-only.
- Evidence pending:
  - Connection string/ref
  - Role mapping
  - Snapshot artifact id
  - Replay confirmation

### Migration/admin role and application role contract (must be implemented in follow-up rehearsal task)

- Migration/admin role:
  - Used only for DDL/rehearsal bootstrap and snapshot restore.
  - Not used for normal authenticated application runtime checks.
- Application runtime role:
  - Dedicated non-owner and non-superuser role with `rolbypassrls = false`, verified from `pg_roles` for `current_user`.
  - The role must not own tenant tables; table ownership and any `FORCE ROW LEVEL SECURITY` requirements must be inspected separately because a non-`BYPASSRLS` role can still bypass ordinary RLS on tables it owns.
  - Must not rely on service-role/Data API credentials as tenancy/RLS evidence.
- Transaction-local tenant context requirement:
  - Tenant context must be set through transaction-local session GUCs (for example `set_config('app.tenant_id', ...)`) and validated in transaction scope.
  - After each release of the pooled connection, a context-clear check must confirm tenant GUC values are not retained.
- Snapshot/restore role policy:
  - Snapshot/restore belongs to migration/admin role path only.
  - Runtime role can access only intended app schema, with RLS enforced.

### Local reset and replay notes

- In this worker, local disposable reset was **not executed**.
- Reset operations are allowed only after exact target verification and via a separate execution task.

## Checks and failure behavior for this task

### Migration ordering & checksum checks

- Deterministic ordering rule: filename sorted ascending (timestamp order).
- This task validates 31 rows and 31 unique SHA-256 hashes.
- Any mismatch in count, first file, last file, order, or duplicate hashes is a hard failure requiring rework before next task.
- Drift/repair policy for this slice:
  - Any hash/order mismatch or duplicate is a hard-stop condition.
  - This worker does not attempt auto-repair; it only reports the mismatch.
  - Forward-fix/replay is deferred to a follow-up slice after rehearsal target verification.

### Transaction / rehearsal evidence expectations

- Rehearsal transaction evidence is pending because target has not been instantiated.
- Required future rehearsal outputs:
  - pre-check output from recovery validation
  - import dry-run/output result
  - migration execution transcript

## Prohibited commands for this task slice

- `supabase migration list --linked` (requires approved remote-read path)
- `supabase db pull`
- `supabase migration repair --linked`
- `supabase db push`
- `supabase db reset`
- any migration apply against linked/staging/prod targets
- any task that starts mutable remote service execution

## Unverified/blocked items to clear before next slice

1. Obtain explicit non-production approval and allowlist evidence per the plan/authority matrix.
2. Instantiate and verify the rehearsal target with allowed/non-production identity.
3. Verify role split:
   - migration/admin role
   - non-owner/non-superuser/non-bypassrls app runtime role
4. Capture pooled-connection reset proof (`tenant` context resets after lease return).
5. Run snapshot + replay proof and record command output/transcript.

## Done claim (reworked output)

- Exact file written: `docs/architecture/migration-baseline.md`
- Commands executed with exit status:
  - `git rev-parse --short HEAD` (0)
  - `git rev-parse --abbrev-ref HEAD` (0)
  - `git status --short` (0)
  - `supabase --version` (127)
  - `node scripts/verify-data-recovery.mjs` (0)
  - migration hash inventory command (0)
  - trailing-whitespace command (0)
  - untracked-aware no-index whitespace check (1 for the expected new-file difference, with no whitespace diagnostics)
- Migration inventory validation:
  - Rows: `31`
  - First: `202605110001_full_schema.sql`
  - Last: `202607120002_harden_database_function_access_and_fk_indexes.sql`
  - Unique hashes: `31`
  - Duplicate hash check: none
- Local/remote status:
  - **Local baseline:** verified and documented.
  - **Remote state:** unverified in this task; blocked.
- Adversarial probes:
  - dirty_worktree captured
  - stale_state controlled via separate historical vs current-state sections
  - trailing whitespace probe (0)
  - misleading_success_output handled with explicit command/exit mapping
  - hung_or_long_command avoided in this slice
- Cleanup:
  - none required by this task
- Residual risks:
  - Target project/rehearsal role/context evidence remains pending
  - remote drift may differ from historical notes
  - local reset/replay not executed in this worker
