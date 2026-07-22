# Data Backup, Restore, and Rollback

This runbook covers application-owned SQLite/Postgres data only. It does not
back up Supabase Auth users, Supabase Vault secrets, environment variables,
Storage objects, Vercel configuration, or database migrations.

> **Migrations are never applied automatically.** Export, offline verification,
> and import will not run `supabase db push`, execute migration SQL, repair
> migration history, or change scheduler configuration. Reconcile and apply the
> target schema separately before importing data.

## Recovery contract

The shared contract in `scripts/data-transfer-contract.mjs` is used by export,
import, and verification. It covers all 23 application tables in foreign-key-safe
restore order:

```text
zip_codes
location_markets
location_cells
settings
app_users
user_market_access
crawl_runs
crawl_units
leads
lead_notes
outreach_events
admin_requests
demos
place_cache
places_master
place_observations
api_usage_events
ai_lead_verifications
ai_usage_events
lead_ai_artifacts
ai_feedback_events
worker_runs
audit_logs
```

The exporter always excludes these `settings` columns rather than writing their
encrypted values or replacing them with `null`:

- `openai_api_key_encrypted`
- `google_places_api_key_encrypted`
- `google_maps_browser_api_key_encrypted`

Restore API/browser keys through the Settings UI or environment/Vault setup.
`MIGRATE_ENCRYPTED_KEYS=1` is intentionally rejected.

Export schema version 2 also rewrites `place_cache.raw_json` and
`place_observations.raw_json` while the snapshot is being created. Every
Google `reviews` collection is removed recursively, including review text and
reviewer attribution left by a legacy SQLite build. Safe Place Details fields
and NoSite's derived review-insight metadata are retained. The manifest records
both transformations, and offline verification rejects an archive that still
contains a raw review collection.

## Create and verify an SQLite backup

1. Pause application writers or copy a stopped SQLite database. The exporter
   uses one read transaction for a consistent snapshot, but quiescing writes
   makes the recovery point unambiguous.
2. Export to an ignored, access-controlled directory:

   ```bash
   npm run db:export:sqlite -- --db nosite-leads.db --out data-export
   ```

3. Run the read-only recovery checks:

   ```bash
   npm run db:verify:recovery -- --db nosite-leads.db --dir data-export
   npm run db:import:supabase -- --dir data-export --dry-run
   ```

The manifest records format/schema versions, exact table order, columns,
redaction transformations, primary keys, row counts, byte counts, and SHA-256 checksums. Verification
rejects missing tables/files, count or checksum mismatches, duplicate/empty
primary keys, unexpected columns, and any protected settings column.

The JSON archive still contains business/contact and operational data. Keep it
encrypted at rest, restrict access, and remove working copies after the backup
has been transferred to its approved destination.

## Restore to Supabase

1. Take a Supabase backup/snapshot of the target before any successful import.
2. Reconcile migration history and apply the intended migrations separately.
   Do not use a blanket `supabase db push` while linked history is drifted.
3. Restore Supabase Auth first, preserving user UUIDs referenced by `app_users`,
   notes, assignments, requests, and AI/audit actor fields. The application data
   archive does not contain `auth.users` credentials.
4. Validate the archive offline with the commands above.
5. Import with the Supabase transaction-pooler connection string:

   ```bash
   DATABASE_URL='postgresql://...' npm run db:import:supabase -- --dir data-export
   ```

Before writing, import validates every target table, exported column, primary
key, JSONB type, protected settings column, and referenced Supabase Auth user.
All 23 table upserts then run in one transaction and in dependency order. A
failure rolls back that transaction. Import never deletes target-only rows and
does not overwrite the three protected settings columns.

After commit, compare target row counts to `manifest.json`, exercise a read-only
authenticated smoke test, and configure API/browser keys separately.

## Rollback

- A failed import is transactionally rolled back; do not retry until the
  reported manifest/schema/Auth error is resolved.
- A successful upsert has no automatic inverse because existing rows may have
  been updated. Roll back using the pre-import Supabase backup/PITR snapshot, or
  restore that snapshot into a separate project and cut over after validation.
- Do not attempt a destructive down-migration as a data rollback. Restore the
  database snapshot first, then deploy the matching application revision.
- Code rollback and data rollback are separate operations. Record the Git SHA,
  migration list, export manifest checksum, and recovery timestamp together.

## Known migration-history drift

The July 2026 audit found a remote-only migration version `20260610045957`
(`researcher_ai_quality_feedback`) whose SQL is absent from this repository.
`202607120001_reconcile_researcher_ai_feedback_schema.sql` is a forward-only,
idempotent schema reconciliation for fresh tracked environments; it does not
rewrite or mark the missing historical version.

Before the next linked migration operation, verify current state live:

```bash
supabase migration list --linked
supabase db pull
```

Also remember that pending local migrations
`202607100001_remove_stored_google_reviews.sql` and
`202607120001_reconcile_researcher_ai_feedback_schema.sql` remain unapplied
until an operator explicitly reviews and applies them. The review cleanup
migration removes `reviews` keys recursively from the historical JSONB payloads;
it does not alter the derived aggregate insight metadata.
