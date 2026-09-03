export const MIGRATION_COLUMNS: Array<{ table: string; column: string; type: string }> = [
  { table: "zip_codes", column: "county", type: "TEXT NOT NULL DEFAULT ''" },
  { table: "leads", column: "photo_count", type: "INTEGER DEFAULT 0" },
  { table: "leads", column: "has_opening_hours", type: "INTEGER DEFAULT 0" },
  { table: "leads", column: "primary_type", type: "TEXT" },
  { table: "leads", column: "lat", type: "REAL" },
  { table: "leads", column: "lng", type: "REAL" },
  { table: "leads", column: "enrichment_status", type: "TEXT NOT NULL DEFAULT 'pending'" },
  { table: "leads", column: "enrichment_attempt_count", type: "INTEGER NOT NULL DEFAULT 0" },
  { table: "leads", column: "enrichment_started_at", type: "TEXT" },
  { table: "leads", column: "enrichment_finished_at", type: "TEXT" },
  { table: "leads", column: "enrichment_next_retry_at", type: "TEXT" },
  { table: "leads", column: "enrichment_last_error", type: "TEXT" },
  { table: "leads", column: "enrichment_last_error_code", type: "TEXT" },
  { table: "leads", column: "enrichment_max_attempts", type: "INTEGER NOT NULL DEFAULT 3" },
  { table: "leads", column: "enriched_at", type: "TEXT" },
  { table: "leads", column: "review_highlights", type: "TEXT" },
  { table: "leads", column: "editorial_summary", type: "TEXT" },
  { table: "leads", column: "website_health", type: "TEXT" },
  { table: "leads", column: "website_checked_at", type: "TEXT" },
  { table: "settings", column: "search_radius_km", type: "REAL NOT NULL DEFAULT 8.0" },
  { table: "settings", column: "enrichment_enabled", type: "INTEGER NOT NULL DEFAULT 1" },
  { table: "settings", column: "max_enrichment_per_run", type: "INTEGER NOT NULL DEFAULT 50" },
  { table: "settings", column: "website_health_enabled", type: "INTEGER NOT NULL DEFAULT 1" },
  { table: "settings", column: "cache_ttl_days", type: "INTEGER NOT NULL DEFAULT 30" },
  { table: "settings", column: "enrichment_stage_b_min_score", type: "REAL NOT NULL DEFAULT 9.0" },
  { table: "settings", column: "max_atmosphere_enrichment_per_run", type: "INTEGER NOT NULL DEFAULT 25" },
  { table: "settings", column: "cost_engine_v2_enabled", type: "INTEGER NOT NULL DEFAULT 1" },
  { table: "leads", column: "verification", type: "TEXT NOT NULL DEFAULT '{}'" },
  { table: "leads", column: "is_excluded", type: "INTEGER NOT NULL DEFAULT 0" },
  { table: "leads", column: "exclusion_reason", type: "TEXT" },
  { table: "leads", column: "excluded_at", type: "TEXT" },
  { table: "leads", column: "archived_at", type: "TEXT" },
  { table: "leads", column: "archived_by_user_id", type: "TEXT" },
  { table: "leads", column: "archive_reason", type: "TEXT" },
  { table: "leads", column: "selling_niche", type: "TEXT" },
  { table: "leads", column: "qualification_status", type: "TEXT NOT NULL DEFAULT 'needs_verification'" },
  { table: "leads", column: "disqualification_reason", type: "TEXT" },
  { table: "leads", column: "website_verified_at", type: "TEXT" },
  { table: "leads", column: "contactability_score", type: "REAL NOT NULL DEFAULT 0" },
  { table: "leads", column: "estimated_deal_value", type: "REAL NOT NULL DEFAULT 0" },
  { table: "leads", column: "business_type", type: "TEXT" },
  { table: "leads", column: "win_probability_score", type: "REAL NOT NULL DEFAULT 0" },
  { table: "leads", column: "lead_quality_score", type: "REAL NOT NULL DEFAULT 0" },
  { table: "leads", column: "quality_bucket", type: "TEXT NOT NULL DEFAULT 'needs_ai_verify'" },
  { table: "leads", column: "easy_build_score", type: "REAL NOT NULL DEFAULT 0" },
  { table: "leads", column: "cash_speed_score", type: "REAL NOT NULL DEFAULT 0" },
  { table: "leads", column: "need_score", type: "REAL NOT NULL DEFAULT 0" },
  { table: "leads", column: "quality_reason", type: "TEXT" },
  { table: "leads", column: "recommended_offer", type: "TEXT NOT NULL DEFAULT 'starter_site'" },
  { table: "leads", column: "next_best_action", type: "TEXT" },
  { table: "leads", column: "phone_verification_status", type: "TEXT NOT NULL DEFAULT 'unknown'" },
  { table: "leads", column: "last_quality_scored_at", type: "TEXT" },
  { table: "leads", column: "quality_checked_by_user_id", type: "TEXT" },
  { table: "leads", column: "ai_verification_status", type: "TEXT NOT NULL DEFAULT 'not_checked'" },
  { table: "leads", column: "ai_confidence", type: "REAL NOT NULL DEFAULT 0" },
  { table: "leads", column: "ai_found_website_url", type: "TEXT" },
  { table: "leads", column: "ai_recommendation", type: "TEXT" },
  { table: "leads", column: "ai_summary", type: "TEXT" },
  { table: "leads", column: "ai_checked_at", type: "TEXT" },
  { table: "leads", column: "ai_website_viability_status", type: "TEXT" },
  { table: "leads", column: "ai_website_health", type: "TEXT" },
  { table: "leads", column: "ai_queue_status", type: "TEXT NOT NULL DEFAULT 'not_checked'" },
  { table: "leads", column: "ai_attempt_count", type: "INTEGER NOT NULL DEFAULT 0" },
  { table: "leads", column: "ai_last_error", type: "TEXT" },
  { table: "leads", column: "ai_next_retry_at", type: "TEXT" },
  { table: "leads", column: "ai_input_hash", type: "TEXT" },
  { table: "leads", column: "raw_opportunity_score", type: "REAL NOT NULL DEFAULT 0" },
  { table: "leads", column: "verification_score", type: "REAL NOT NULL DEFAULT 0" },
  { table: "leads", column: "sales_priority_score", type: "REAL NOT NULL DEFAULT 0" },
  { table: "leads", column: "pitch_outcome", type: "TEXT" },
  { table: "leads", column: "objection_reason", type: "TEXT" },
  { table: "leads", column: "decision_maker_reached", type: "INTEGER NOT NULL DEFAULT 0" },
  { table: "leads", column: "quoted_amount", type: "REAL NOT NULL DEFAULT 0" },
  { table: "leads", column: "close_value", type: "REAL NOT NULL DEFAULT 0" },
  { table: "leads", column: "demo_sent_at", type: "TEXT" },
  { table: "leads", column: "assigned_to_user_id", type: "TEXT" },
  { table: "settings", column: "ai_enabled", type: "INTEGER NOT NULL DEFAULT 0" },
  { table: "settings", column: "ai_model", type: "TEXT NOT NULL DEFAULT 'gpt-5.4-mini'" },
  { table: "settings", column: "ai_daily_budget_usd", type: "REAL NOT NULL DEFAULT 2.0" },
  { table: "settings", column: "ai_monthly_budget_usd", type: "REAL NOT NULL DEFAULT 25.0" },
  { table: "settings", column: "ai_batch_limit", type: "INTEGER NOT NULL DEFAULT 25" },
  { table: "settings", column: "researcher_ai_daily_run_cap", type: "INTEGER NOT NULL DEFAULT 10" },
  { table: "settings", column: "researcher_ai_daily_budget_usd", type: "REAL NOT NULL DEFAULT 2.0" },
  { table: "settings", column: "researcher_ai_monthly_budget_usd", type: "REAL NOT NULL DEFAULT 25.0" },
  { table: "settings", column: "ai_cache_ttl_days", type: "INTEGER NOT NULL DEFAULT 30" },
  { table: "settings", column: "ai_manual_apply_required", type: "INTEGER NOT NULL DEFAULT 1" },
  { table: "settings", column: "ai_auto_verify_enabled", type: "INTEGER NOT NULL DEFAULT 1" },
  { table: "settings", column: "ai_verify_after_discovery", type: "INTEGER NOT NULL DEFAULT 1" },
  { table: "settings", column: "ai_reverify_after_enrichment", type: "INTEGER NOT NULL DEFAULT 1" },
  { table: "settings", column: "ai_verification_concurrency", type: "INTEGER NOT NULL DEFAULT 1" },
  { table: "settings", column: "ai_max_attempts", type: "INTEGER NOT NULL DEFAULT 3" },
  { table: "settings", column: "scheduler_ai_verification_enabled", type: "INTEGER NOT NULL DEFAULT 1" },
  { table: "settings", column: "scheduler_crawl_enabled", type: "INTEGER NOT NULL DEFAULT 1" },
  { table: "settings", column: "scheduler_enrichment_enabled", type: "INTEGER NOT NULL DEFAULT 1" },
  { table: "settings", column: "scheduler_artifact_enabled", type: "INTEGER NOT NULL DEFAULT 1" },
  { table: "settings", column: "scheduler_score_recompute_enabled", type: "INTEGER NOT NULL DEFAULT 1" },
  { table: "settings", column: "openai_api_key_encrypted", type: "TEXT" },
  { table: "settings", column: "google_places_api_key_encrypted", type: "TEXT" },
  { table: "settings", column: "google_maps_browser_api_key_encrypted", type: "TEXT" },
  { table: "settings", column: "google_text_search_monthly_cap", type: "INTEGER NOT NULL DEFAULT 4900" },
  { table: "settings", column: "google_enterprise_monthly_cap", type: "INTEGER NOT NULL DEFAULT 900" },
  { table: "settings", column: "google_test_run_call_cap", type: "INTEGER NOT NULL DEFAULT 50" },
  { table: "settings", column: "google_auto_pagination_enabled", type: "INTEGER NOT NULL DEFAULT 1" },
  { table: "settings", column: "google_auto_pagination_min_new_candidates", type: "INTEGER NOT NULL DEFAULT 6" },
  { table: "settings", column: "google_auto_pagination_max_duplicate_rate", type: "REAL NOT NULL DEFAULT 0.6" },
  { table: "settings", column: "google_default_discovery_mode", type: "TEXT NOT NULL DEFAULT 'coverage_probe'" },
  { table: "settings", column: "google_default_pagination_policy", type: "TEXT NOT NULL DEFAULT 'auto_yield_based'" },
  { table: "crawl_runs", column: "blocked_reason", type: "TEXT" },
  { table: "crawl_runs", column: "blocked_at", type: "TEXT" },
  { table: "crawl_runs", column: "blocked_error_code", type: "TEXT" },
  { table: "crawl_units", column: "next_retry_at", type: "TEXT" },
  { table: "crawl_units", column: "max_attempts", type: "INTEGER NOT NULL DEFAULT 3" },
  { table: "crawl_units", column: "last_error_code", type: "TEXT" },
  { table: "leads", column: "ai_website_feedback_status", type: "TEXT" },
  { table: "leads", column: "ai_corrected_website_url", type: "TEXT" },
  { table: "leads", column: "ai_false_positive_reason", type: "TEXT" },
  { table: "leads", column: "ai_reviewer_notes", type: "TEXT" },
  { table: "leads", column: "ai_feedback_at", type: "TEXT" },
  { table: "ai_lead_verifications", column: "website_viability_status", type: "TEXT" },
  { table: "ai_lead_verifications", column: "website_health_json", type: "TEXT" },
  { table: "ai_lead_verifications", column: "website_viability_reason", type: "TEXT" },
  { table: "ai_lead_verifications", column: "requested_by_user_id", type: "TEXT" },
  { table: "ai_lead_verifications", column: "request_source", type: "TEXT" },
  { table: "ai_usage_events", column: "actor_user_id", type: "TEXT" },
  { table: "ai_usage_events", column: "request_source", type: "TEXT" },
  { table: "lead_ai_artifacts", column: "updated_at", type: "TEXT" },
  { table: "lead_ai_artifacts", column: "attempt_count", type: "INTEGER NOT NULL DEFAULT 0" },
  { table: "lead_ai_artifacts", column: "last_error", type: "TEXT" },
  { table: "lead_ai_artifacts", column: "next_retry_at", type: "TEXT" },
  { table: "lead_ai_artifacts", column: "max_attempts", type: "INTEGER NOT NULL DEFAULT 3" },
  { table: "lead_ai_artifacts", column: "requested_by_user_id", type: "TEXT" },
  { table: "lead_ai_artifacts", column: "request_source", type: "TEXT" },
  { table: "outreach_events", column: "actor_user_id", type: "TEXT" },
  { table: "outreach_events", column: "actor_email", type: "TEXT" },
  { table: "outreach_events", column: "contact_person_name", type: "TEXT" },
  { table: "outreach_events", column: "contact_person_role", type: "TEXT" },
  { table: "outreach_events", column: "decision_maker_reached", type: "INTEGER NOT NULL DEFAULT 0" },
  { table: "outreach_events", column: "outcome", type: "TEXT NOT NULL DEFAULT 'contacted'" },
  { table: "outreach_events", column: "objection_reason", type: "TEXT" },
  { table: "outreach_events", column: "quoted_amount", type: "REAL NOT NULL DEFAULT 0" },
  { table: "outreach_events", column: "close_value", type: "REAL NOT NULL DEFAULT 0" },
  { table: "outreach_events", column: "follow_up_at", type: "TEXT" },
  { table: "outreach_events", column: "next_step", type: "TEXT" },
  { table: "audit_logs", column: "actor_user_id", type: "TEXT" },
  { table: "audit_logs", column: "actor_email", type: "TEXT" },
  { table: "audit_logs", column: "actor_role", type: "TEXT" },
  { table: "audit_logs", column: "scope_kind", type: "TEXT NOT NULL DEFAULT 'legacy_unscoped'" },
  { table: "audit_logs", column: "tenant_id", type: "TEXT" },
  { table: "audit_logs", column: "workspace_id", type: "TEXT" },
  { table: "audit_logs", column: "correlation_id", type: "TEXT" },
  { table: "audit_logs", column: "actor_auth_identity_id", type: "TEXT" },
  { table: "audit_logs", column: "actor_membership_id", type: "TEXT" },
  { table: "audit_logs", column: "actor_launch_role", type: "TEXT" },
  { table: "audit_logs", column: "actor_role_binding_id", type: "TEXT" },
  { table: "audit_logs", column: "actor_layer", type: "TEXT" },
  { table: "app_users", column: "is_team_lead", type: "INTEGER NOT NULL DEFAULT 0" },
  { table: "app_users", column: "team_lead_user_id", type: "TEXT" },
  { table: "app_users", column: "team_label", type: "TEXT" },
  { table: "leads", column: "market_id", type: "TEXT" },
  { table: "leads", column: "location_cell_id", type: "TEXT" },
  { table: "leads", column: "country_code", type: "TEXT" },
  { table: "leads", column: "admin_area1", type: "TEXT" },
  { table: "leads", column: "admin_area2", type: "TEXT" },
  { table: "leads", column: "locality", type: "TEXT" },
  { table: "leads", column: "postal_code", type: "TEXT" },
  { table: "crawl_units", column: "market_id", type: "TEXT" },
  { table: "crawl_units", column: "location_cell_id", type: "TEXT" },
  { table: "crawl_units", column: "country_code", type: "TEXT" },
  { table: "crawl_units", column: "query_location_label", type: "TEXT" },
  { table: "crawl_runs", column: "market_id", type: "TEXT" },
  { table: "crawl_runs", column: "selection_json", type: "TEXT" },
  { table: "crawl_runs", column: "name", type: "TEXT" },
  { table: "crawl_runs", column: "scope_label", type: "TEXT" },
  { table: "crawl_runs", column: "created_by_user_id", type: "TEXT" },
  { table: "crawl_runs", column: "updated_at", type: "TEXT NOT NULL DEFAULT (datetime('now'))" },
  { table: "crawl_units", column: "max_pages", type: "INTEGER NOT NULL DEFAULT 1" },
  { table: "crawl_units", column: "pages_fetched", type: "INTEGER NOT NULL DEFAULT 0" },
  { table: "crawl_units", column: "raw_places_seen", type: "INTEGER NOT NULL DEFAULT 0" },
  { table: "crawl_units", column: "new_places_seen", type: "INTEGER NOT NULL DEFAULT 0" },
  { table: "crawl_units", column: "duplicate_places_seen", type: "INTEGER NOT NULL DEFAULT 0" },
  { table: "crawl_units", column: "budget_blocked_at", type: "TEXT" },
  { table: "demos", column: "published_at", type: "TEXT" },
  { table: "demos", column: "published_by_user_id", type: "TEXT" },
  { table: "demos", column: "unpublished_at", type: "TEXT" },
  { table: "demos", column: "unpublished_by_user_id", type: "TEXT" },
  { table: "demos", column: "revoked_at", type: "TEXT" },
  { table: "demos", column: "revoked_by_user_id", type: "TEXT" },
  { table: "demos", column: "revoke_reason", type: "TEXT" },
  { table: "demos", column: "view_count", type: "INTEGER NOT NULL DEFAULT 0" },
  { table: "demos", column: "last_viewed_at", type: "TEXT" },
];

export const TENANT_MEMBERSHIP_MUTATION_JOURNAL_SQL = `CREATE TABLE IF NOT EXISTS tenant_membership_mutation_journal (
  idempotency_key_hash TEXT PRIMARY KEY NOT NULL
    CHECK (length(idempotency_key_hash) = 64 AND idempotency_key_hash NOT GLOB '*[^0-9a-f]*'),
  input_hash TEXT NOT NULL
    CHECK (length(input_hash) = 64 AND input_hash NOT GLOB '*[^0-9a-f]*'),
  tenant_id TEXT NOT NULL,
  actor_membership_id TEXT NOT NULL,
  actor_role_binding_id TEXT NOT NULL,
  operation TEXT NOT NULL
    CHECK (operation IN ('invite', 'assign_role', 'assign_workspace', 'disable', 'reactivate', 'revoke', 'remove')),
  target_membership_id TEXT,
  replacement_membership_id TEXT,
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'completed')),
  result_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  completed_at TEXT,
  CONSTRAINT tenant_membership_mutation_journal_actor_membership_fkey
    FOREIGN KEY (tenant_id, actor_membership_id)
    REFERENCES tenant_memberships (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT tenant_membership_mutation_journal_actor_binding_fkey
    FOREIGN KEY (tenant_id, actor_role_binding_id)
    REFERENCES tenant_role_bindings (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT tenant_membership_mutation_journal_state_chk CHECK (
    (status = 'reserved' AND result_json IS NULL AND completed_at IS NULL)
    OR
    (status = 'completed' AND target_membership_id IS NOT NULL AND result_json IS NOT NULL
      AND json_valid(result_json) AND completed_at IS NOT NULL)
  ),
  CONSTRAINT tenant_membership_mutation_journal_timestamps_chk CHECK (
    length(created_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', created_at) = created_at
    AND (completed_at IS NULL OR (
      length(completed_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', completed_at) = completed_at
      AND completed_at >= created_at
    ))
  )
);

CREATE INDEX IF NOT EXISTS idx_tenant_membership_mutation_journal_tenant_created
  ON tenant_membership_mutation_journal (tenant_id, created_at DESC, idempotency_key_hash);

CREATE TRIGGER IF NOT EXISTS trg_novatrade_membership_mutation_journal_update_guard
BEFORE UPDATE ON tenant_membership_mutation_journal
FOR EACH ROW
BEGIN
  SELECT CASE WHEN OLD.status <> 'reserved' OR NEW.status <> 'completed'
    OR NEW.idempotency_key_hash IS NOT OLD.idempotency_key_hash
    OR NEW.input_hash IS NOT OLD.input_hash
    OR NEW.tenant_id IS NOT OLD.tenant_id
    OR NEW.actor_membership_id IS NOT OLD.actor_membership_id
    OR NEW.actor_role_binding_id IS NOT OLD.actor_role_binding_id
    OR NEW.operation IS NOT OLD.operation
    OR NEW.replacement_membership_id IS NOT OLD.replacement_membership_id
    OR (OLD.target_membership_id IS NOT NULL AND NEW.target_membership_id IS NOT OLD.target_membership_id)
    OR NEW.target_membership_id IS NULL OR NEW.result_json IS NULL OR NEW.completed_at IS NULL
    THEN RAISE(ABORT, 'membership mutation journal permits only reserved-to-completed transition') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM tenant_memberships AS membership
    WHERE membership.tenant_id = NEW.tenant_id AND membership.id = NEW.target_membership_id
  ) THEN RAISE(ABORT, 'membership mutation journal target is not tenant-owned') END;
  SELECT CASE WHEN NEW.replacement_membership_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM tenant_memberships AS membership
    WHERE membership.tenant_id = NEW.tenant_id AND membership.id = NEW.replacement_membership_id
  ) THEN RAISE(ABORT, 'membership mutation journal replacement is not tenant-owned') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_novatrade_membership_mutation_journal_delete_guard
BEFORE DELETE ON tenant_membership_mutation_journal
FOR EACH ROW BEGIN
  SELECT RAISE(ABORT, 'membership mutation journal is durable');
END;`;

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY NOT NULL CONSTRAINT tenants_id_format_chk CHECK (
    length(id) = 36 AND
    length(replace(id, '-', '')) = 32 AND
    id NOT GLOB '*[^0-9A-Fa-f-]*' AND
    substr(id, 9, 1) = '-' AND
    substr(id, 14, 1) = '-' AND
    substr(id, 19, 1) = '-' AND
    substr(id, 24, 1) = '-'
  ),
  slug TEXT NOT NULL CONSTRAINT tenants_slug_length_chk
    CHECK (length(slug) BETWEEN 2 AND 80),
  name TEXT NOT NULL CONSTRAINT tenants_name_length_chk
    CHECK (length(trim(name)) BETWEEN 1 AND 180),
  status TEXT NOT NULL DEFAULT 'provisioning' CONSTRAINT tenants_status_chk
    CHECK (status IN ('provisioning', 'active', 'suspended', 'archived', 'deletion_pending', 'deleted')),
  locale TEXT NOT NULL DEFAULT 'en-US' CONSTRAINT tenants_locale_length_chk
    CHECK (length(trim(locale)) BETWEEN 2 AND 64),
  timezone TEXT NOT NULL DEFAULT 'UTC' CONSTRAINT tenants_timezone_length_chk
    CHECK (length(trim(timezone)) BETWEEN 1 AND 64),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT tenants_slug_format_chk CHECK (
    slug = trim(slug) AND
    slug = lower(slug) AND
    slug NOT GLOB '*[^a-z0-9-]*' AND
    slug NOT GLOB '-*' AND
    slug NOT GLOB '*-' AND
    slug NOT GLOB '*--*'
  ),
  CONSTRAINT tenants_slug_unique UNIQUE (slug),
  CONSTRAINT tenants_locale_format_chk CHECK (
    (
      instr(locale, '-') = 0 AND
      (locale GLOB '[A-Za-z][A-Za-z]' OR locale GLOB '[A-Za-z][A-Za-z][A-Za-z]')
    ) OR (
      instr(locale, '-') > 0 AND
      (
        substr(locale, 1, instr(locale, '-') - 1) GLOB '[A-Za-z][A-Za-z]' OR
        substr(locale, 1, instr(locale, '-') - 1) GLOB '[A-Za-z][A-Za-z][A-Za-z]'
      ) AND
      locale NOT GLOB '*[^A-Za-z0-9-]*' AND
      locale NOT GLOB '-*' AND
      locale NOT GLOB '*-' AND
      locale NOT GLOB '*--*' AND
      locale NOT GLOB '*-[A-Za-z0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9][A-Za-z0-9]*'
    )
  ),
  CONSTRAINT tenants_timezone_format_chk CHECK (
    timezone = 'UTC' OR
    timezone IN ('Etc/GMT+0', 'Etc/GMT+1', 'Etc/GMT+2', 'Etc/GMT+3', 'Etc/GMT+4', 'Etc/GMT+5', 'Etc/GMT+6', 'Etc/GMT+7', 'Etc/GMT+8', 'Etc/GMT+9', 'Etc/GMT+10', 'Etc/GMT+11', 'Etc/GMT+12', 'Etc/GMT+13', 'Etc/GMT+14', 'Etc/GMT-0', 'Etc/GMT-1', 'Etc/GMT-2', 'Etc/GMT-3', 'Etc/GMT-4', 'Etc/GMT-5', 'Etc/GMT-6', 'Etc/GMT-7', 'Etc/GMT-8', 'Etc/GMT-9', 'Etc/GMT-10', 'Etc/GMT-11', 'Etc/GMT-12', 'Etc/GMT-13', 'Etc/GMT-14') OR
    (
      timezone NOT GLOB '*[^A-Za-z0-9_/-]*' AND
      substr(timezone, 1, 1) GLOB '[A-Za-z_]' AND
      timezone NOT GLOB '*/' AND
      timezone NOT GLOB '*//*' AND
      timezone NOT GLOB '*/[^A-Za-z_]*' AND
      (
        (instr(timezone, '/') = 0 AND timezone NOT GLOB '*[0-9-]*') OR
        (instr(timezone, '/') > 0 AND substr(timezone, 1, instr(timezone, '/') - 1) NOT GLOB '*[0-9-]*')
      )
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_tenants_status_created_at ON tenants(status, created_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_novatrade_tenants_immutable_id_slug
BEFORE UPDATE OF id, slug ON tenants
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NEW.id IS NOT OLD.id THEN RAISE(ABORT, 'tenant id is immutable') END;
  SELECT CASE WHEN NEW.slug IS NOT OLD.slug THEN RAISE(ABORT, 'tenant slug is immutable') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_novatrade_tenants_touch_updated_at
AFTER UPDATE ON tenants
FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE tenants
  SET updated_at = CASE
    WHEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') = OLD.updated_at
      THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+1 second')
    ELSE strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  END
  WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY NOT NULL CONSTRAINT workspaces_id_format_chk CHECK (
    length(id) = 36 AND
    length(replace(id, '-', '')) = 32 AND
    id NOT GLOB '*[^0-9A-Fa-f-]*' AND
    substr(id, 9, 1) = '-' AND
    substr(id, 14, 1) = '-' AND
    substr(id, 19, 1) = '-' AND
    substr(id, 24, 1) = '-'
  ),
  tenant_id TEXT NOT NULL CONSTRAINT workspaces_tenant_id_format_chk CHECK (
    length(tenant_id) = 36 AND
    length(replace(tenant_id, '-', '')) = 32 AND
    tenant_id NOT GLOB '*[^0-9A-Fa-f-]*' AND
    substr(tenant_id, 9, 1) = '-' AND
    substr(tenant_id, 14, 1) = '-' AND
    substr(tenant_id, 19, 1) = '-' AND
    substr(tenant_id, 24, 1) = '-'
  ) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  slug TEXT NOT NULL CONSTRAINT workspaces_slug_length_chk
    CHECK (length(slug) BETWEEN 2 AND 80),
  name TEXT NOT NULL CONSTRAINT workspaces_name_length_chk
    CHECK (length(name) BETWEEN 1 AND 120 AND length(trim(name)) >= 1),
  status TEXT NOT NULL DEFAULT 'provisioning' CONSTRAINT workspaces_status_chk
    CHECK (status IN ('provisioning', 'active', 'paused', 'archived', 'deletion_pending', 'deleted')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT workspaces_slug_format_chk CHECK (
    slug = trim(slug) AND
    slug = lower(slug) AND
    slug NOT GLOB '*[^a-z0-9-]*' AND
    slug NOT GLOB '-*' AND
    slug NOT GLOB '*-' AND
    slug NOT GLOB '*--*'
  ),
  CONSTRAINT workspaces_tenant_slug_unique UNIQUE (tenant_id, slug),
  CONSTRAINT workspaces_tenant_id_id_unique UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_workspaces_tenant_status_updated_at
  ON workspaces(tenant_id, status, updated_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_novatrade_workspaces_immutable_id_tenant_slug
BEFORE UPDATE OF id, tenant_id, slug ON workspaces
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NEW.id IS NOT OLD.id THEN RAISE(ABORT, 'workspace id is immutable') END;
  SELECT CASE WHEN NEW.tenant_id IS NOT OLD.tenant_id THEN RAISE(ABORT, 'workspace tenant_id is immutable') END;
  SELECT CASE WHEN NEW.slug IS NOT OLD.slug THEN RAISE(ABORT, 'workspace slug is immutable') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_novatrade_workspaces_touch_updated_at
AFTER UPDATE ON workspaces
FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE workspaces
  SET updated_at = CASE
    WHEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') = OLD.updated_at
      THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+1 second')
    ELSE strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  END
  WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS tenant_memberships (
  id TEXT PRIMARY KEY NOT NULL CONSTRAINT tenant_memberships_id_format_chk CHECK (
    length(id) = 36 AND
    length(replace(id, '-', '')) = 32 AND
    id NOT GLOB '*[^0-9A-Fa-f-]*' AND
    substr(id, 9, 1) = '-' AND
    substr(id, 14, 1) = '-' AND
    substr(id, 19, 1) = '-' AND
    substr(id, 24, 1) = '-'
  ),
  tenant_id TEXT NOT NULL CONSTRAINT tenant_memberships_tenant_id_format_chk CHECK (
    length(tenant_id) = 36 AND
    length(replace(tenant_id, '-', '')) = 32 AND
    tenant_id NOT GLOB '*[^0-9A-Fa-f-]*' AND
    substr(tenant_id, 9, 1) = '-' AND
    substr(tenant_id, 14, 1) = '-' AND
    substr(tenant_id, 19, 1) = '-' AND
    substr(tenant_id, 24, 1) = '-'
  ) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  auth_identity_id TEXT CONSTRAINT tenant_memberships_auth_identity_id_format_chk CHECK (
    auth_identity_id IS NULL OR (
      length(auth_identity_id) = 36 AND
      length(replace(auth_identity_id, '-', '')) = 32 AND
      auth_identity_id NOT GLOB '*[^0-9A-Fa-f-]*' AND
      substr(auth_identity_id, 9, 1) = '-' AND
      substr(auth_identity_id, 14, 1) = '-' AND
      substr(auth_identity_id, 19, 1) = '-' AND
      substr(auth_identity_id, 24, 1) = '-'
    )
  ),
  pending_identity_ref_hash TEXT CONSTRAINT tenant_memberships_pending_identity_ref_hash_chk CHECK (
    pending_identity_ref_hash IS NULL OR pending_identity_ref_hash GLOB '[0-9a-f]*' AND
    length(pending_identity_ref_hash) = 64 AND
    pending_identity_ref_hash NOT GLOB '*[^0-9a-f]*'
  ),
  workspace_id TEXT CONSTRAINT tenant_memberships_workspace_id_format_chk CHECK (
    workspace_id IS NULL OR (
      length(workspace_id) = 36 AND
      length(replace(workspace_id, '-', '')) = 32 AND
      workspace_id NOT GLOB '*[^0-9A-Fa-f-]*' AND
      substr(workspace_id, 9, 1) = '-' AND
      substr(workspace_id, 14, 1) = '-' AND
      substr(workspace_id, 19, 1) = '-' AND
      substr(workspace_id, 24, 1) = '-'
    )
  ),
  status TEXT NOT NULL DEFAULT 'pending' CONSTRAINT tenant_memberships_status_chk
    CHECK (status IN ('pending', 'active', 'suspended', 'disabled', 'revoked', 'removed', 'expired')),
  invited_by_membership_id TEXT CONSTRAINT tenant_memberships_invited_by_membership_id_format_chk CHECK (
    invited_by_membership_id IS NULL OR (
      length(invited_by_membership_id) = 36 AND
      length(replace(invited_by_membership_id, '-', '')) = 32 AND
      invited_by_membership_id NOT GLOB '*[^0-9A-Fa-f-]*' AND
      substr(invited_by_membership_id, 9, 1) = '-' AND
      substr(invited_by_membership_id, 14, 1) = '-' AND
      substr(invited_by_membership_id, 19, 1) = '-' AND
      substr(invited_by_membership_id, 24, 1) = '-'
    )
  ),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    CONSTRAINT tenant_memberships_created_at_utc_chk CHECK (
      length(created_at) = 24 AND
      created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
    ),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    CONSTRAINT tenant_memberships_updated_at_utc_chk CHECK (
      length(updated_at) = 24 AND
      updated_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
    ),
  CONSTRAINT tenant_memberships_identity_selector_chk
    CHECK ((auth_identity_id IS NOT NULL) <> (pending_identity_ref_hash IS NOT NULL)),
  CONSTRAINT tenant_memberships_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT tenant_memberships_workspace_tenant_fkey
    FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES workspaces (tenant_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT tenant_memberships_invited_by_tenant_fkey
    FOREIGN KEY (tenant_id, invited_by_membership_id)
    REFERENCES tenant_memberships (tenant_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_memberships_current_auth_identity_unique
  ON tenant_memberships (tenant_id, auth_identity_id)
  WHERE auth_identity_id IS NOT NULL AND status NOT IN ('revoked', 'removed', 'expired');

CREATE UNIQUE INDEX IF NOT EXISTS tenant_memberships_current_pending_identity_unique
  ON tenant_memberships (tenant_id, pending_identity_ref_hash)
  WHERE pending_identity_ref_hash IS NOT NULL AND status NOT IN ('revoked', 'removed', 'expired');

CREATE INDEX IF NOT EXISTS idx_tenant_memberships_auth_identity_status
  ON tenant_memberships (auth_identity_id, status, tenant_id)
  WHERE auth_identity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_memberships_tenant_status_updated_at
  ON tenant_memberships (tenant_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_memberships_tenant_workspace_status
  ON tenant_memberships (tenant_id, workspace_id, status)
  WHERE workspace_id IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS trg_novatrade_tenant_memberships_guard
BEFORE UPDATE OF id, tenant_id, auth_identity_id, pending_identity_ref_hash ON tenant_memberships
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NEW.id IS NOT OLD.id THEN RAISE(ABORT, 'tenant membership id is immutable') END;
  SELECT CASE WHEN NEW.tenant_id IS NOT OLD.tenant_id THEN RAISE(ABORT, 'tenant membership tenant_id is immutable') END;
  SELECT CASE WHEN NEW.auth_identity_id IS NOT OLD.auth_identity_id THEN RAISE(ABORT, 'tenant membership auth_identity_id is immutable') END;
  SELECT CASE WHEN NEW.pending_identity_ref_hash IS NOT OLD.pending_identity_ref_hash THEN RAISE(ABORT, 'tenant membership pending identity selector is immutable') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_novatrade_tenant_memberships_touch_updated_at
AFTER UPDATE ON tenant_memberships
FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE tenant_memberships
  SET updated_at = CASE
    WHEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') = OLD.updated_at
      THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+1 second')
    ELSE strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  END
  WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS tenant_role_bindings (
  id TEXT PRIMARY KEY NOT NULL CONSTRAINT tenant_role_bindings_id_format_chk CHECK (
    length(id) = 36 AND
    length(replace(id, '-', '')) = 32 AND
    id NOT GLOB '*[^0-9A-Fa-f-]*' AND
    substr(id, 9, 1) = '-' AND
    substr(id, 14, 1) = '-' AND
    substr(id, 19, 1) = '-' AND
    substr(id, 24, 1) = '-'
  ),
  tenant_id TEXT NOT NULL CONSTRAINT tenant_role_bindings_tenant_id_format_chk CHECK (
    length(tenant_id) = 36 AND
    length(replace(tenant_id, '-', '')) = 32 AND
    tenant_id NOT GLOB '*[^0-9A-Fa-f-]*' AND
    substr(tenant_id, 9, 1) = '-' AND
    substr(tenant_id, 14, 1) = '-' AND
    substr(tenant_id, 19, 1) = '-' AND
    substr(tenant_id, 24, 1) = '-'
  ),
  membership_id TEXT NOT NULL CONSTRAINT tenant_role_bindings_membership_id_format_chk CHECK (
    length(membership_id) = 36 AND
    length(replace(membership_id, '-', '')) = 32 AND
    membership_id NOT GLOB '*[^0-9A-Fa-f-]*' AND
    substr(membership_id, 9, 1) = '-' AND
    substr(membership_id, 14, 1) = '-' AND
    substr(membership_id, 19, 1) = '-' AND
    substr(membership_id, 24, 1) = '-'
  ),
  role TEXT NOT NULL CONSTRAINT tenant_role_bindings_role_chk
    CHECK (role IN ('owner', 'admin', 'strategist_manager', 'researcher', 'reviewer', 'outreach_operator', 'analyst_read_only')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    CONSTRAINT tenant_role_bindings_created_at_utc_chk CHECK (
      length(created_at) = 24 AND
      created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
    ),
  valid_from TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    CONSTRAINT tenant_role_bindings_valid_from_utc_chk CHECK (
      length(valid_from) = 24 AND
      valid_from GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
    ),
  revoked_at TEXT CONSTRAINT tenant_role_bindings_revoked_at_utc_chk CHECK (
    revoked_at IS NULL OR (
      length(revoked_at) = 24 AND
      revoked_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
    )
  ),
  assigned_by_membership_id TEXT CONSTRAINT tenant_role_bindings_assigned_by_membership_id_format_chk CHECK (
    assigned_by_membership_id IS NULL OR (
      length(assigned_by_membership_id) = 36 AND
      length(replace(assigned_by_membership_id, '-', '')) = 32 AND
      assigned_by_membership_id NOT GLOB '*[^0-9A-Fa-f-]*' AND
      substr(assigned_by_membership_id, 9, 1) = '-' AND
      substr(assigned_by_membership_id, 14, 1) = '-' AND
      substr(assigned_by_membership_id, 19, 1) = '-' AND
      substr(assigned_by_membership_id, 24, 1) = '-'
    )
  ),
  reason_code TEXT NOT NULL DEFAULT 'initial_provisioning'
    CONSTRAINT tenant_role_bindings_reason_code_chk
    CHECK (reason_code IN ('initial_provisioning', 'invitation', 'role_change', 'owner_replacement', 'membership_reactivation', 'administrative_correction')),
  CONSTRAINT tenant_role_bindings_revoked_at_chk
    CHECK (revoked_at IS NULL OR revoked_at >= valid_from),
  CONSTRAINT tenant_role_bindings_tenant_membership_fkey
    FOREIGN KEY (tenant_id, membership_id)
    REFERENCES tenant_memberships (tenant_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT tenant_role_bindings_assigned_by_tenant_fkey
    FOREIGN KEY (tenant_id, assigned_by_membership_id)
    REFERENCES tenant_memberships (tenant_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_role_bindings_current_membership_unique
  ON tenant_role_bindings (tenant_id, membership_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_role_bindings_membership_history
  ON tenant_role_bindings (tenant_id, membership_id, valid_from DESC);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_role_bindings_tenant_id_id_unique
  ON tenant_role_bindings (tenant_id, id);

CREATE TRIGGER IF NOT EXISTS trg_novatrade_tenant_role_bindings_guard
BEFORE UPDATE ON tenant_role_bindings
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NEW.id IS NOT OLD.id THEN RAISE(ABORT, 'tenant role binding id is immutable') END;
  SELECT CASE WHEN NEW.tenant_id IS NOT OLD.tenant_id THEN RAISE(ABORT, 'tenant role binding tenant_id is immutable') END;
  SELECT CASE WHEN NEW.membership_id IS NOT OLD.membership_id THEN RAISE(ABORT, 'tenant role binding membership_id is immutable') END;
  SELECT CASE WHEN NEW.role IS NOT OLD.role THEN RAISE(ABORT, 'tenant role binding role is immutable') END;
  SELECT CASE WHEN NEW.created_at IS NOT OLD.created_at THEN RAISE(ABORT, 'tenant role binding created_at is immutable') END;
  SELECT CASE WHEN NEW.valid_from IS NOT OLD.valid_from THEN RAISE(ABORT, 'tenant role binding valid_from is immutable') END;
  SELECT CASE WHEN NEW.assigned_by_membership_id IS NOT OLD.assigned_by_membership_id THEN RAISE(ABORT, 'tenant role binding assigned_by_membership_id is immutable') END;
  SELECT CASE WHEN NEW.reason_code IS NOT OLD.reason_code THEN RAISE(ABORT, 'tenant role binding reason_code is immutable') END;
  SELECT CASE WHEN OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NOT OLD.revoked_at THEN RAISE(ABORT, 'tenant role binding revoked_at cannot be rewritten or cleared') END;
END;

${TENANT_MEMBERSHIP_MUTATION_JOURNAL_SQL}

CREATE TABLE IF NOT EXISTS tenant_policies (
  id TEXT PRIMARY KEY NOT NULL CONSTRAINT tenant_policies_id_format_chk CHECK (
    length(id) = 36 AND length(replace(id, '-', '')) = 32 AND
    id NOT GLOB '*[^0-9A-Fa-f-]*' AND substr(id, 9, 1) = '-' AND
    substr(id, 14, 1) = '-' AND substr(id, 19, 1) = '-' AND substr(id, 24, 1) = '-'
  ),
  tenant_id TEXT NOT NULL CONSTRAINT tenant_policies_tenant_id_format_chk CHECK (
    length(tenant_id) = 36 AND length(replace(tenant_id, '-', '')) = 32 AND
    tenant_id NOT GLOB '*[^0-9A-Fa-f-]*' AND substr(tenant_id, 9, 1) = '-' AND
    substr(tenant_id, 14, 1) = '-' AND substr(tenant_id, 19, 1) = '-' AND substr(tenant_id, 24, 1) = '-'
  ) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  version INTEGER NOT NULL DEFAULT 1 CONSTRAINT tenant_policies_version_chk CHECK (typeof(version) = 'integer' AND version >= 1),
  locale TEXT NOT NULL DEFAULT 'en-US' CONSTRAINT tenant_policies_locale_length_chk CHECK (length(trim(locale)) BETWEEN 2 AND 64),
  timezone TEXT NOT NULL DEFAULT 'UTC' CONSTRAINT tenant_policies_timezone_length_chk CHECK (length(trim(timezone)) BETWEEN 1 AND 64),
  export_retention_days INTEGER NOT NULL DEFAULT 7 CONSTRAINT tenant_policies_export_retention_days_chk CHECK (typeof(export_retention_days) = 'integer' AND export_retention_days BETWEEN 1 AND 7),
  operational_log_retention_days INTEGER NOT NULL DEFAULT 30 CONSTRAINT tenant_policies_operational_log_retention_days_chk CHECK (typeof(operational_log_retention_days) = 'integer' AND operational_log_retention_days BETWEEN 1 AND 30),
  raw_source_retention_days INTEGER NOT NULL DEFAULT 180 CONSTRAINT tenant_policies_raw_source_retention_days_chk CHECK (typeof(raw_source_retention_days) = 'integer' AND raw_source_retention_days BETWEEN 1 AND 180),
  contact_freshness_days INTEGER NOT NULL DEFAULT 180 CONSTRAINT tenant_policies_contact_freshness_days_chk CHECK (typeof(contact_freshness_days) = 'integer' AND contact_freshness_days BETWEEN 1 AND 180),
  primary_delete_within_days INTEGER NOT NULL DEFAULT 30 CONSTRAINT tenant_policies_primary_delete_within_days_chk CHECK (typeof(primary_delete_within_days) = 'integer' AND primary_delete_within_days BETWEEN 1 AND 30),
  backup_expire_within_days INTEGER NOT NULL DEFAULT 35 CONSTRAINT tenant_policies_backup_expire_within_days_chk CHECK (typeof(backup_expire_within_days) = 'integer' AND backup_expire_within_days BETWEEN 1 AND 35),
  tombstone_retention_years INTEGER NOT NULL DEFAULT 7 CONSTRAINT tenant_policies_tombstone_retention_years_chk CHECK (typeof(tombstone_retention_years) = 'integer' AND tombstone_retention_years = 7),
  active_materials_mode TEXT NOT NULL DEFAULT 'while_authorized_until_superseded_policy_or_deletion' CONSTRAINT tenant_policies_active_materials_mode_chk CHECK (active_materials_mode = 'while_authorized_until_superseded_policy_or_deletion'),
  ai_processing_enabled INTEGER NOT NULL DEFAULT 0 CONSTRAINT tenant_policies_ai_processing_enabled_chk CHECK (ai_processing_enabled IN (0, 1)),
  source_research_enabled INTEGER NOT NULL DEFAULT 0 CONSTRAINT tenant_policies_source_research_enabled_chk CHECK (source_research_enabled IN (0, 1)),
  contact_research_enabled INTEGER NOT NULL DEFAULT 0 CONSTRAINT tenant_policies_contact_research_enabled_chk CHECK (contact_research_enabled IN (0, 1)),
  outreach_drafting_enabled INTEGER NOT NULL DEFAULT 0 CONSTRAINT tenant_policies_outreach_drafting_enabled_chk CHECK (outreach_drafting_enabled IN (0, 1)),
  copy_export_enabled INTEGER NOT NULL DEFAULT 0 CONSTRAINT tenant_policies_copy_export_enabled_chk CHECK (copy_export_enabled IN (0, 1)),
  autonomous_send_enabled INTEGER NOT NULL DEFAULT 0 CONSTRAINT tenant_policies_autonomous_send_enabled_chk CHECK (autonomous_send_enabled = 0),
  require_source_plan_approval INTEGER NOT NULL DEFAULT 1 CONSTRAINT tenant_policies_require_source_plan_approval_chk CHECK (require_source_plan_approval IN (0, 1)),
  require_knowledge_review INTEGER NOT NULL DEFAULT 1 CONSTRAINT tenant_policies_require_knowledge_review_chk CHECK (require_knowledge_review IN (0, 1)),
  require_icp_review INTEGER NOT NULL DEFAULT 1 CONSTRAINT tenant_policies_require_icp_review_chk CHECK (require_icp_review IN (0, 1)),
  require_lead_play_review INTEGER NOT NULL DEFAULT 1 CONSTRAINT tenant_policies_require_lead_play_review_chk CHECK (require_lead_play_review IN (0, 1)),
  require_contact_review INTEGER NOT NULL DEFAULT 1 CONSTRAINT tenant_policies_require_contact_review_chk CHECK (require_contact_review IN (0, 1)),
  require_outreach_review INTEGER NOT NULL DEFAULT 1 CONSTRAINT tenant_policies_require_outreach_review_chk CHECK (require_outreach_review IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) CONSTRAINT tenant_policies_created_at_utc_chk CHECK (
    length(created_at) = 24 AND created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
  ),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) CONSTRAINT tenant_policies_updated_at_utc_chk CHECK (
    length(updated_at) = 24 AND updated_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
  ),
  CONSTRAINT tenant_policies_tenant_unique UNIQUE (tenant_id),
  CONSTRAINT tenant_policies_locale_format_chk CHECK (
    (
      instr(locale, '-') = 0 AND
      (locale GLOB '[A-Za-z][A-Za-z]' OR locale GLOB '[A-Za-z][A-Za-z][A-Za-z]')
    ) OR (
      instr(locale, '-') > 0 AND
      (substr(locale, 1, instr(locale, '-') - 1) GLOB '[A-Za-z][A-Za-z]' OR
       substr(locale, 1, instr(locale, '-') - 1) GLOB '[A-Za-z][A-Za-z][A-Za-z]') AND
      locale NOT GLOB '*[^A-Za-z0-9-]*' AND locale NOT GLOB '-*' AND
      locale NOT GLOB '*-' AND locale NOT GLOB '*--*'
    )
  ),
  CONSTRAINT tenant_policies_timezone_format_chk CHECK (
    timezone = 'UTC' OR
    timezone IN ('Etc/GMT+0', 'Etc/GMT+1', 'Etc/GMT+2', 'Etc/GMT+3', 'Etc/GMT+4', 'Etc/GMT+5', 'Etc/GMT+6', 'Etc/GMT+7', 'Etc/GMT+8', 'Etc/GMT+9', 'Etc/GMT+10', 'Etc/GMT+11', 'Etc/GMT+12', 'Etc/GMT+13', 'Etc/GMT+14', 'Etc/GMT-0', 'Etc/GMT-1', 'Etc/GMT-2', 'Etc/GMT-3', 'Etc/GMT-4', 'Etc/GMT-5', 'Etc/GMT-6', 'Etc/GMT-7', 'Etc/GMT-8', 'Etc/GMT-9', 'Etc/GMT-10', 'Etc/GMT-11', 'Etc/GMT-12', 'Etc/GMT-13', 'Etc/GMT-14') OR
    (
      timezone NOT GLOB '*[^A-Za-z0-9_/-]*' AND substr(timezone, 1, 1) GLOB '[A-Za-z_]' AND
      timezone NOT GLOB '*/' AND timezone NOT GLOB '*//*' AND timezone NOT GLOB '*/[^A-Za-z_]*' AND
      ((instr(timezone, '/') = 0 AND timezone NOT GLOB '*[0-9-]*') OR
       (instr(timezone, '/') > 0 AND substr(timezone, 1, instr(timezone, '/') - 1) NOT GLOB '*[0-9-]*'))
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_tenant_policies_tenant_updated_at ON tenant_policies(tenant_id, updated_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_novatrade_tenant_policies_guard
BEFORE UPDATE ON tenant_policies
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NEW.id IS NOT OLD.id THEN RAISE(ABORT, 'tenant policy id is immutable') END;
  SELECT CASE WHEN NEW.tenant_id IS NOT OLD.tenant_id THEN RAISE(ABORT, 'tenant policy tenant_id is immutable') END;
  SELECT CASE WHEN NEW.created_at IS NOT OLD.created_at THEN RAISE(ABORT, 'tenant policy created_at is immutable') END;
  SELECT CASE WHEN NEW.version IS NOT OLD.version + 1
    AND NOT (
      NEW.version IS OLD.version AND NEW.id IS OLD.id AND NEW.tenant_id IS OLD.tenant_id AND
      NEW.created_at IS OLD.created_at AND NEW.locale IS OLD.locale AND NEW.timezone IS OLD.timezone AND
      NEW.export_retention_days IS OLD.export_retention_days AND
      NEW.operational_log_retention_days IS OLD.operational_log_retention_days AND
      NEW.raw_source_retention_days IS OLD.raw_source_retention_days AND
      NEW.contact_freshness_days IS OLD.contact_freshness_days AND
      NEW.primary_delete_within_days IS OLD.primary_delete_within_days AND
      NEW.backup_expire_within_days IS OLD.backup_expire_within_days AND
      NEW.tombstone_retention_years IS OLD.tombstone_retention_years AND
      NEW.active_materials_mode IS OLD.active_materials_mode AND
      NEW.ai_processing_enabled IS OLD.ai_processing_enabled AND NEW.source_research_enabled IS OLD.source_research_enabled AND
      NEW.contact_research_enabled IS OLD.contact_research_enabled AND NEW.outreach_drafting_enabled IS OLD.outreach_drafting_enabled AND
      NEW.copy_export_enabled IS OLD.copy_export_enabled AND NEW.autonomous_send_enabled IS OLD.autonomous_send_enabled AND
      NEW.require_source_plan_approval IS OLD.require_source_plan_approval AND NEW.require_knowledge_review IS OLD.require_knowledge_review AND
      NEW.require_icp_review IS OLD.require_icp_review AND NEW.require_lead_play_review IS OLD.require_lead_play_review AND
      NEW.require_contact_review IS OLD.require_contact_review AND NEW.require_outreach_review IS OLD.require_outreach_review AND
      NEW.updated_at IS NOT OLD.updated_at
    ) THEN RAISE(ABORT, 'tenant policy version must advance exactly one') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_novatrade_tenant_policies_touch_updated_at
AFTER UPDATE ON tenant_policies
FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE tenant_policies
  SET updated_at = CASE
    WHEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') = OLD.updated_at
      THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+1 second')
    ELSE strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  END
  WHERE id = NEW.id;
END;

-- Support grant child tables are declared before their parent so the SQLite
-- schema can use the same deferred, non-empty scope anchors as Postgres.
CREATE TABLE IF NOT EXISTS support_access_grant_permissions (
  grant_id TEXT NOT NULL CONSTRAINT support_access_grant_permissions_grant_id_format_chk CHECK (
    length(grant_id) = 36 AND length(replace(grant_id, '-', '')) = 32 AND
    grant_id NOT GLOB '*[^0-9A-Fa-f-]*' AND substr(grant_id, 9, 1) = '-' AND
    substr(grant_id, 14, 1) = '-' AND substr(grant_id, 19, 1) = '-' AND substr(grant_id, 24, 1) = '-'
  ) REFERENCES support_access_grants(id) ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  permission TEXT NOT NULL CONSTRAINT support_access_grant_permissions_permission_chk CHECK (permission IN (
    'tenant:read', 'tenant:manage', 'tenant:lifecycle', 'workspace:read', 'workspace:manage',
    'membership:read', 'membership:invite', 'membership:manage', 'role:assign', 'support:grant',
    'knowledge:read', 'knowledge:upload', 'knowledge:manage', 'knowledge:review', 'knowledge:export', 'knowledge:delete',
    'understanding:read', 'understanding:edit', 'understanding:approve', 'question:manage', 'question:answer',
    'icp:read', 'icp:edit', 'icp:approve', 'play:read', 'play:edit', 'play:approve', 'play:activate', 'play:archive',
    'connector:read', 'connector:manage', 'connector:use', 'source:plan', 'source:approve', 'source:execute', 'source:review',
    'account:read', 'account:edit', 'account:merge', 'account:archive', 'contact:read', 'contact:research', 'contact:edit',
    'contact:use', 'contact:approve', 'buying_center:read', 'buying_center:edit', 'buying_center:approve',
    'qualification:read', 'qualification:edit', 'qualification:approve', 'score:read', 'score:recompute', 'score:override',
    'review:read', 'review:decide', 'audit:read', 'audit:export', 'outreach:read', 'outreach:draft', 'outreach:edit',
    'outreach:approve', 'outreach:copy_export', 'suppression:read', 'suppression:manage', 'outcome:write', 'report:read',
    'report:manage', 'usage:read', 'budget:manage', 'queue:read', 'queue:operate', 'feature:manage', 'data:export', 'data:delete'
  )),
  PRIMARY KEY (grant_id, permission)
);

CREATE TABLE IF NOT EXISTS support_access_grant_data_classes (
  grant_id TEXT NOT NULL CONSTRAINT support_access_grant_data_classes_grant_id_format_chk CHECK (
    length(grant_id) = 36 AND length(replace(grant_id, '-', '')) = 32 AND
    grant_id NOT GLOB '*[^0-9A-Fa-f-]*' AND substr(grant_id, 9, 1) = '-' AND
    substr(grant_id, 14, 1) = '-' AND substr(grant_id, 19, 1) = '-' AND substr(grant_id, 24, 1) = '-'
  ) REFERENCES support_access_grants(id) ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  data_class TEXT NOT NULL CONSTRAINT support_access_grant_data_classes_data_class_chk CHECK (data_class IN (
    'tenant_metadata', 'workspace_metadata', 'public_business_facts', 'documents', 'customer_lists', 'contacts',
    'unpublished_product_technical_data', 'audit_operational_metadata', 'prompts', 'agent_context'
  )),
  PRIMARY KEY (grant_id, data_class)
);

CREATE TABLE IF NOT EXISTS support_access_grants (
  id TEXT PRIMARY KEY NOT NULL CONSTRAINT support_access_grants_id_format_chk CHECK (
    length(id) = 36 AND length(replace(id, '-', '')) = 32 AND id NOT GLOB '*[^0-9A-Fa-f-]*' AND
    substr(id, 9, 1) = '-' AND substr(id, 14, 1) = '-' AND substr(id, 19, 1) = '-' AND substr(id, 24, 1) = '-'
  ),
  tenant_id TEXT NOT NULL CONSTRAINT support_access_grants_tenant_id_format_chk CHECK (
    length(tenant_id) = 36 AND length(replace(tenant_id, '-', '')) = 32 AND tenant_id NOT GLOB '*[^0-9A-Fa-f-]*' AND
    substr(tenant_id, 9, 1) = '-' AND substr(tenant_id, 14, 1) = '-' AND substr(tenant_id, 19, 1) = '-' AND substr(tenant_id, 24, 1) = '-'
  ) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  workspace_id TEXT CONSTRAINT support_access_grants_workspace_id_format_chk CHECK (
    workspace_id IS NULL OR (length(workspace_id) = 36 AND length(replace(workspace_id, '-', '')) = 32 AND workspace_id NOT GLOB '*[^0-9A-Fa-f-]*' AND
    substr(workspace_id, 9, 1) = '-' AND substr(workspace_id, 14, 1) = '-' AND substr(workspace_id, 19, 1) = '-' AND substr(workspace_id, 24, 1) = '-')
  ),
  support_actor_auth_identity_id TEXT NOT NULL CONSTRAINT support_access_grants_support_actor_auth_identity_id_format_chk CHECK (
    length(support_actor_auth_identity_id) = 36 AND length(replace(support_actor_auth_identity_id, '-', '')) = 32 AND support_actor_auth_identity_id NOT GLOB '*[^0-9A-Fa-f-]*' AND
    substr(support_actor_auth_identity_id, 9, 1) = '-' AND substr(support_actor_auth_identity_id, 14, 1) = '-' AND substr(support_actor_auth_identity_id, 19, 1) = '-' AND substr(support_actor_auth_identity_id, 24, 1) = '-'
  ),
  platform_role TEXT NOT NULL DEFAULT 'platform_support' CONSTRAINT support_access_grants_platform_role_chk CHECK (platform_role = 'platform_support'),
  requested_by_auth_identity_id TEXT NOT NULL CONSTRAINT support_access_grants_requested_by_auth_identity_id_format_chk CHECK (
    length(requested_by_auth_identity_id) = 36 AND length(replace(requested_by_auth_identity_id, '-', '')) = 32 AND requested_by_auth_identity_id NOT GLOB '*[^0-9A-Fa-f-]*' AND
    substr(requested_by_auth_identity_id, 9, 1) = '-' AND substr(requested_by_auth_identity_id, 14, 1) = '-' AND substr(requested_by_auth_identity_id, 19, 1) = '-' AND substr(requested_by_auth_identity_id, 24, 1) = '-'
  ),
  approved_by_auth_identity_id TEXT CONSTRAINT support_access_grants_approved_by_auth_identity_id_format_chk CHECK (
    approved_by_auth_identity_id IS NULL OR (length(approved_by_auth_identity_id) = 36 AND length(replace(approved_by_auth_identity_id, '-', '')) = 32 AND approved_by_auth_identity_id NOT GLOB '*[^0-9A-Fa-f-]*' AND
    substr(approved_by_auth_identity_id, 9, 1) = '-' AND substr(approved_by_auth_identity_id, 14, 1) = '-' AND substr(approved_by_auth_identity_id, 19, 1) = '-' AND substr(approved_by_auth_identity_id, 24, 1) = '-')
  ),
  approved_at TEXT CONSTRAINT support_access_grants_approved_at_utc_chk CHECK (
    approved_at IS NULL OR (length(approved_at) = 24 AND approved_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND strftime('%Y-%m-%dT%H:%M:%fZ', approved_at) = approved_at AND created_at <= approved_at AND approved_at < expires_at)
  ),
  revoked_by_auth_identity_id TEXT CONSTRAINT support_access_grants_revoked_by_auth_identity_id_format_chk CHECK (
    revoked_by_auth_identity_id IS NULL OR (length(revoked_by_auth_identity_id) = 36 AND length(replace(revoked_by_auth_identity_id, '-', '')) = 32 AND revoked_by_auth_identity_id NOT GLOB '*[^0-9A-Fa-f-]*' AND
    substr(revoked_by_auth_identity_id, 9, 1) = '-' AND substr(revoked_by_auth_identity_id, 14, 1) = '-' AND substr(revoked_by_auth_identity_id, 19, 1) = '-' AND substr(revoked_by_auth_identity_id, 24, 1) = '-')
  ),
  revoked_at TEXT CONSTRAINT support_access_grants_revoked_at_utc_chk CHECK (
    revoked_at IS NULL OR (length(revoked_at) = 24 AND revoked_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND strftime('%Y-%m-%dT%H:%M:%fZ', revoked_at) = revoked_at AND approved_at IS NOT NULL AND approved_at <= revoked_at)
  ),
  state TEXT NOT NULL DEFAULT 'pending' CONSTRAINT support_access_grants_state_chk CHECK (state IN ('pending', 'approved', 'revoked')),
  reason_code TEXT NOT NULL CONSTRAINT support_access_grants_reason_code_chk CHECK (length(reason_code) BETWEEN 3 AND 80 AND reason_code GLOB '[a-z]*' AND reason_code NOT GLOB '*[^a-z0-9._-]*'),
  reason TEXT NOT NULL CONSTRAINT support_access_grants_reason_chk CHECK (length(reason) BETWEEN 1 AND 500 AND length(trim(reason)) >= 1),
  starts_at TEXT NOT NULL CONSTRAINT support_access_grants_starts_at_utc_chk CHECK (
    length(starts_at) = 24 AND starts_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND strftime('%Y-%m-%dT%H:%M:%fZ', starts_at) = starts_at
  ),
  expires_at TEXT NOT NULL CONSTRAINT support_access_grants_expires_at_utc_chk CHECK (
    length(expires_at) = 24 AND expires_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND strftime('%Y-%m-%dT%H:%M:%fZ', expires_at) = expires_at AND starts_at < expires_at
  ),
  correlation_id TEXT NOT NULL CONSTRAINT support_access_grants_correlation_id_chk CHECK (length(correlation_id) BETWEEN 8 AND 128 AND correlation_id GLOB '[A-Za-z0-9]*' AND correlation_id NOT GLOB '*[^A-Za-z0-9._:-]*'),
  audit_event_id TEXT NOT NULL CONSTRAINT support_access_grants_audit_event_id_format_chk CHECK (
    length(audit_event_id) = 36 AND length(replace(audit_event_id, '-', '')) = 32 AND audit_event_id NOT GLOB '*[^0-9A-Fa-f-]*' AND
    substr(audit_event_id, 9, 1) = '-' AND substr(audit_event_id, 14, 1) = '-' AND substr(audit_event_id, 19, 1) = '-' AND substr(audit_event_id, 24, 1) = '-'
  ),
  permission_anchor TEXT NOT NULL,
  data_class_anchor TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) CONSTRAINT support_access_grants_created_at_utc_chk CHECK (
    length(created_at) = 24 AND created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
  ),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) CONSTRAINT support_access_grants_updated_at_utc_chk CHECK (
    length(updated_at) = 24 AND updated_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND created_at <= updated_at
  ),
  CONSTRAINT support_access_grants_workspace_tenant_fkey FOREIGN KEY (tenant_id, workspace_id) REFERENCES workspaces (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT support_access_grants_permission_anchor_fkey FOREIGN KEY (id, permission_anchor) REFERENCES support_access_grant_permissions (grant_id, permission) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT support_access_grants_data_class_anchor_fkey FOREIGN KEY (id, data_class_anchor) REFERENCES support_access_grant_data_classes (grant_id, data_class) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT support_access_grants_state_facts_chk CHECK (
    (state = 'pending' AND approved_by_auth_identity_id IS NULL AND approved_at IS NULL AND revoked_by_auth_identity_id IS NULL AND revoked_at IS NULL) OR
    (state = 'approved' AND approved_by_auth_identity_id IS NOT NULL AND approved_at IS NOT NULL AND revoked_by_auth_identity_id IS NULL AND revoked_at IS NULL) OR
    (state = 'revoked' AND approved_by_auth_identity_id IS NOT NULL AND approved_at IS NOT NULL AND revoked_by_auth_identity_id IS NOT NULL AND revoked_at IS NOT NULL)
  ),
  CONSTRAINT support_access_grants_no_self_approval_chk CHECK (approved_by_auth_identity_id IS NULL OR approved_by_auth_identity_id IS NOT support_actor_auth_identity_id)
);

CREATE INDEX IF NOT EXISTS idx_support_access_grants_tenant_history ON support_access_grants(tenant_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_support_access_grants_active_lookup ON support_access_grants(tenant_id, support_actor_auth_identity_id, workspace_id, starts_at, expires_at) WHERE state = 'approved' AND revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_support_access_grant_permissions_grant ON support_access_grant_permissions(grant_id, permission);
CREATE INDEX IF NOT EXISTS idx_support_access_grant_data_classes_grant ON support_access_grant_data_classes(grant_id, data_class);
CREATE UNIQUE INDEX IF NOT EXISTS support_access_grants_current_tenantwide_unique ON support_access_grants(tenant_id, support_actor_auth_identity_id) WHERE workspace_id IS NULL AND state IN ('pending', 'approved');
CREATE UNIQUE INDEX IF NOT EXISTS support_access_grants_current_workspace_unique ON support_access_grants(tenant_id, support_actor_auth_identity_id, workspace_id) WHERE workspace_id IS NOT NULL AND state IN ('pending', 'approved');

DROP TRIGGER IF EXISTS trg_novatrade_support_access_grants_validate_approval;
DROP TRIGGER IF EXISTS trg_novatrade_support_access_grants_validate_approval_update;
DROP TRIGGER IF EXISTS trg_novatrade_support_access_grants_validate_revocation;
DROP TRIGGER IF EXISTS trg_novatrade_support_access_grants_validate_revocation_update;

CREATE TRIGGER IF NOT EXISTS trg_novatrade_support_access_grants_validate_approval
BEFORE INSERT ON support_access_grants
FOR EACH ROW
WHEN NEW.state = 'approved'
BEGIN
  SELECT CASE WHEN NEW.approved_by_auth_identity_id IS NOT NULL AND NEW.approved_by_auth_identity_id IS NEW.support_actor_auth_identity_id THEN RAISE(ABORT, 'support actor cannot approve its own grant') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM tenant_memberships AS membership
    JOIN tenant_role_bindings AS binding ON binding.tenant_id = membership.tenant_id AND binding.membership_id = membership.id
    WHERE membership.tenant_id = NEW.tenant_id AND membership.auth_identity_id = NEW.approved_by_auth_identity_id
      AND membership.status = 'active' AND binding.role IN ('owner', 'admin') AND binding.revoked_at IS NULL
      AND binding.valid_from <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ) THEN RAISE(ABORT, 'support grant approver must be an active same-tenant owner or admin') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_novatrade_support_access_grants_validate_approval_update
BEFORE UPDATE ON support_access_grants
FOR EACH ROW
WHEN OLD.state = 'pending' AND NEW.state = 'approved'
BEGIN
  SELECT CASE WHEN NEW.approved_by_auth_identity_id IS NOT NULL AND NEW.approved_by_auth_identity_id IS NEW.support_actor_auth_identity_id THEN RAISE(ABORT, 'support actor cannot approve its own grant') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM tenant_memberships AS membership
    JOIN tenant_role_bindings AS binding ON binding.tenant_id = membership.tenant_id AND binding.membership_id = membership.id
    WHERE membership.tenant_id = NEW.tenant_id AND membership.auth_identity_id = NEW.approved_by_auth_identity_id
      AND membership.status = 'active' AND binding.role IN ('owner', 'admin') AND binding.revoked_at IS NULL
      AND binding.valid_from <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ) THEN RAISE(ABORT, 'support grant approver must be an active same-tenant owner or admin') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_novatrade_support_access_grants_validate_revocation
BEFORE INSERT ON support_access_grants
FOR EACH ROW
WHEN NEW.state = 'revoked'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM tenant_memberships AS membership
    JOIN tenant_role_bindings AS binding ON binding.tenant_id = membership.tenant_id AND binding.membership_id = membership.id
    WHERE membership.tenant_id = NEW.tenant_id AND membership.auth_identity_id = NEW.revoked_by_auth_identity_id
      AND membership.status = 'active' AND binding.role IN ('owner', 'admin') AND binding.revoked_at IS NULL
      AND binding.valid_from <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ) THEN RAISE(ABORT, 'support grant revoker must be an active same-tenant owner or admin') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_novatrade_support_access_grants_validate_revocation_update
BEFORE UPDATE ON support_access_grants
FOR EACH ROW
WHEN OLD.state = 'approved' AND NEW.state = 'revoked'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM tenant_memberships AS membership
    JOIN tenant_role_bindings AS binding ON binding.tenant_id = membership.tenant_id AND binding.membership_id = membership.id
    WHERE membership.tenant_id = NEW.tenant_id AND membership.auth_identity_id = NEW.revoked_by_auth_identity_id
      AND membership.status = 'active' AND binding.role IN ('owner', 'admin') AND binding.revoked_at IS NULL
      AND binding.valid_from <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ) THEN RAISE(ABORT, 'support grant revoker must be an active same-tenant owner or admin') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_novatrade_support_access_grants_guard
BEFORE UPDATE ON support_access_grants
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NEW.id IS NOT OLD.id THEN RAISE(ABORT, 'support grant id is immutable') END;
  SELECT CASE WHEN NEW.tenant_id IS NOT OLD.tenant_id THEN RAISE(ABORT, 'support grant tenant_id is immutable') END;
  SELECT CASE WHEN NEW.workspace_id IS NOT OLD.workspace_id THEN RAISE(ABORT, 'support grant workspace_id is immutable') END;
  SELECT CASE WHEN NEW.support_actor_auth_identity_id IS NOT OLD.support_actor_auth_identity_id THEN RAISE(ABORT, 'support grant support actor is immutable') END;
  SELECT CASE WHEN NEW.platform_role IS NOT OLD.platform_role THEN RAISE(ABORT, 'support grant platform role is immutable') END;
  SELECT CASE WHEN NEW.requested_by_auth_identity_id IS NOT OLD.requested_by_auth_identity_id THEN RAISE(ABORT, 'support grant requester is immutable') END;
  SELECT CASE WHEN NEW.reason_code IS NOT OLD.reason_code OR NEW.reason IS NOT OLD.reason THEN RAISE(ABORT, 'support grant reason is immutable') END;
  SELECT CASE WHEN NEW.starts_at IS NOT OLD.starts_at OR NEW.expires_at IS NOT OLD.expires_at THEN RAISE(ABORT, 'support grant time window is immutable') END;
  SELECT CASE WHEN NEW.correlation_id IS NOT OLD.correlation_id OR NEW.audit_event_id IS NOT OLD.audit_event_id THEN RAISE(ABORT, 'support grant audit facts are immutable') END;
  SELECT CASE WHEN NEW.permission_anchor IS NOT OLD.permission_anchor OR NEW.data_class_anchor IS NOT OLD.data_class_anchor THEN RAISE(ABORT, 'support grant scope anchors are immutable') END;
  SELECT CASE WHEN NEW.created_at IS NOT OLD.created_at THEN RAISE(ABORT, 'support grant created_at is immutable') END;
  SELECT CASE WHEN NOT ((OLD.state = NEW.state) OR (OLD.state = 'pending' AND NEW.state = 'approved') OR (OLD.state = 'approved' AND NEW.state = 'revoked')) THEN RAISE(ABORT, 'support grant state transition is invalid') END;
  SELECT CASE WHEN OLD.approved_by_auth_identity_id IS NOT NULL AND (NEW.approved_by_auth_identity_id IS NOT OLD.approved_by_auth_identity_id OR NEW.approved_at IS NOT OLD.approved_at) THEN RAISE(ABORT, 'support grant approval facts are immutable') END;
  SELECT CASE WHEN OLD.revoked_by_auth_identity_id IS NOT NULL AND (NEW.revoked_by_auth_identity_id IS NOT OLD.revoked_by_auth_identity_id OR NEW.revoked_at IS NOT OLD.revoked_at) THEN RAISE(ABORT, 'support grant revocation is one-way') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_novatrade_support_access_grants_touch_updated_at
AFTER UPDATE ON support_access_grants
FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE support_access_grants
  SET updated_at = CASE WHEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') = OLD.updated_at THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+1 second') ELSE strftime('%Y-%m-%dT%H:%M:%fZ', 'now') END
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_novatrade_support_access_grant_permissions_guard
BEFORE INSERT ON support_access_grant_permissions
FOR EACH ROW
BEGIN
  SELECT CASE WHEN COALESCE((SELECT state FROM support_access_grants WHERE id = NEW.grant_id), 'missing') <> 'pending' THEN RAISE(ABORT, 'support grant scope is immutable after approval') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_novatrade_support_access_grant_permissions_no_update
BEFORE UPDATE ON support_access_grant_permissions
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'support grant permission rows are immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_novatrade_support_access_grant_permissions_no_delete
BEFORE DELETE ON support_access_grant_permissions
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'support grant permission rows cannot be deleted');
END;

CREATE TRIGGER IF NOT EXISTS trg_novatrade_support_access_grant_data_classes_guard
BEFORE INSERT ON support_access_grant_data_classes
FOR EACH ROW
BEGIN
  SELECT CASE WHEN COALESCE((SELECT state FROM support_access_grants WHERE id = NEW.grant_id), 'missing') <> 'pending' THEN RAISE(ABORT, 'support grant data classes are immutable after approval') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_novatrade_support_access_grant_data_classes_no_update
BEFORE UPDATE ON support_access_grant_data_classes
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'support grant data-class rows are immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_novatrade_support_access_grant_data_classes_no_delete
BEFORE DELETE ON support_access_grant_data_classes
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'support grant data-class rows cannot be deleted');
END;

CREATE TABLE IF NOT EXISTS tenant_export_jobs (
  id TEXT PRIMARY KEY NOT NULL CONSTRAINT tenant_export_jobs_id_format_chk CHECK (
    length(id) = 36 AND length(replace(id, '-', '')) = 32 AND id NOT GLOB '*[^0-9A-Fa-f-]*' AND
    substr(id, 9, 1) = '-' AND substr(id, 14, 1) = '-' AND substr(id, 19, 1) = '-' AND substr(id, 24, 1) = '-'
  ),
  tenant_id TEXT NOT NULL CONSTRAINT tenant_export_jobs_tenant_id_format_chk CHECK (
    length(tenant_id) = 36 AND length(replace(tenant_id, '-', '')) = 32 AND tenant_id NOT GLOB '*[^0-9A-Fa-f-]*' AND
    substr(tenant_id, 9, 1) = '-' AND substr(tenant_id, 14, 1) = '-' AND substr(tenant_id, 19, 1) = '-' AND substr(tenant_id, 24, 1) = '-'
  ) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  workspace_id TEXT CONSTRAINT tenant_export_jobs_workspace_id_format_chk CHECK (
    workspace_id IS NULL OR (length(workspace_id) = 36 AND length(replace(workspace_id, '-', '')) = 32 AND workspace_id NOT GLOB '*[^0-9A-Fa-f-]*' AND substr(workspace_id, 9, 1) = '-' AND substr(workspace_id, 14, 1) = '-' AND substr(workspace_id, 19, 1) = '-' AND substr(workspace_id, 24, 1) = '-')
  ),
  operation TEXT NOT NULL DEFAULT 'tenant_data_export' CONSTRAINT tenant_export_jobs_operation_chk CHECK (operation = 'tenant_data_export'),
  requester_auth_identity_id TEXT NOT NULL CONSTRAINT tenant_export_jobs_requester_auth_identity_id_format_chk CHECK (length(requester_auth_identity_id) = 36 AND length(replace(requester_auth_identity_id, '-', '')) = 32 AND requester_auth_identity_id NOT GLOB '*[^0-9A-Fa-f-]*' AND substr(requester_auth_identity_id, 9, 1) = '-' AND substr(requester_auth_identity_id, 14, 1) = '-' AND substr(requester_auth_identity_id, 19, 1) = '-' AND substr(requester_auth_identity_id, 24, 1) = '-'),
  requester_membership_id TEXT CONSTRAINT tenant_export_jobs_requester_membership_id_format_chk CHECK (requester_membership_id IS NULL OR (length(requester_membership_id) = 36 AND length(replace(requester_membership_id, '-', '')) = 32 AND requester_membership_id NOT GLOB '*[^0-9A-Fa-f-]*' AND substr(requester_membership_id, 9, 1) = '-' AND substr(requester_membership_id, 14, 1) = '-' AND substr(requester_membership_id, 19, 1) = '-' AND substr(requester_membership_id, 24, 1) = '-')),
  support_access_grant_id TEXT CONSTRAINT tenant_export_jobs_support_access_grant_id_format_chk CHECK (support_access_grant_id IS NULL OR (length(support_access_grant_id) = 36 AND length(replace(support_access_grant_id, '-', '')) = 32 AND support_access_grant_id NOT GLOB '*[^0-9A-Fa-f-]*' AND substr(support_access_grant_id, 9, 1) = '-' AND substr(support_access_grant_id, 14, 1) = '-' AND substr(support_access_grant_id, 19, 1) = '-' AND substr(support_access_grant_id, 24, 1) = '-')),
  status TEXT NOT NULL DEFAULT 'requested' CONSTRAINT tenant_export_jobs_status_chk CHECK (status IN ('requested', 'snapshotting', 'redacting', 'artifact_created', 'released', 'retry_wait', 'failed', 'canceled', 'expired', 'deleted')),
  scope_hash TEXT NOT NULL CONSTRAINT tenant_export_jobs_scope_hash_chk CHECK (length(scope_hash) = 64 AND scope_hash NOT GLOB '*[^0-9a-f]*'),
  input_hash TEXT NOT NULL CONSTRAINT tenant_export_jobs_input_hash_chk CHECK (length(input_hash) = 64 AND input_hash NOT GLOB '*[^0-9a-f]*'),
  idempotency_key_hash TEXT NOT NULL CONSTRAINT tenant_export_jobs_idempotency_key_hash_chk CHECK (length(idempotency_key_hash) = 64 AND idempotency_key_hash NOT GLOB '*[^0-9a-f]*'),
  policy_version TEXT NOT NULL CONSTRAINT tenant_export_jobs_policy_version_chk CHECK (length(policy_version) BETWEEN 5 AND 128 AND policy_version GLOB '[A-Za-z0-9]*' AND policy_version NOT GLOB '*[^A-Za-z0-9._-]*'),
  manifest_version TEXT NOT NULL CONSTRAINT tenant_export_jobs_manifest_version_chk CHECK (length(manifest_version) BETWEEN 1 AND 128 AND manifest_version GLOB '[A-Za-z0-9]*' AND manifest_version NOT GLOB '*[^A-Za-z0-9._-]*'),
  schema_version TEXT NOT NULL CONSTRAINT tenant_export_jobs_schema_version_chk CHECK (length(schema_version) BETWEEN 1 AND 128 AND schema_version GLOB '[A-Za-z0-9]*' AND schema_version NOT GLOB '*[^A-Za-z0-9._-]*'),
  requested_format TEXT NOT NULL CONSTRAINT tenant_export_jobs_requested_format_chk CHECK (requested_format IN ('csv', 'json', 'package')),
  snapshot_at TEXT CONSTRAINT tenant_export_jobs_snapshot_at_utc_chk CHECK (snapshot_at IS NULL OR (length(snapshot_at) = 24 AND snapshot_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND strftime('%Y-%m-%dT%H:%M:%fZ', snapshot_at) = snapshot_at)),
  artifact_storage_ref TEXT CONSTRAINT tenant_export_jobs_artifact_ref_shape_chk CHECK (
    artifact_storage_ref IS NULL OR (
      artifact_storage_ref = trim(artifact_storage_ref)
      AND artifact_storage_ref NOT GLOB '*[^A-Za-z0-9._/-]*'
      AND artifact_storage_ref NOT GLOB '/*'
      AND artifact_storage_ref NOT GLOB '*//*'
      AND artifact_storage_ref NOT GLOB '*..*'
      AND artifact_storage_ref NOT LIKE '%secret%'
      AND artifact_storage_ref NOT LIKE '%credential%'
      AND artifact_storage_ref NOT LIKE '%password%'
      AND artifact_storage_ref NOT LIKE '%token%'
      AND artifact_storage_ref NOT LIKE '%api_key%'
      AND artifact_storage_ref GLOB 'tenants/*/exports/*/*'
    )
  ),
  artifact_checksum_sha256 TEXT CONSTRAINT tenant_export_jobs_artifact_checksum_chk CHECK (artifact_checksum_sha256 IS NULL OR (length(artifact_checksum_sha256) = 64 AND artifact_checksum_sha256 NOT GLOB '*[^0-9a-f]*')),
  included_count INTEGER CONSTRAINT tenant_export_jobs_included_count_chk CHECK (included_count IS NULL OR (typeof(included_count) = 'integer' AND included_count >= 0)),
  excluded_count INTEGER CONSTRAINT tenant_export_jobs_excluded_count_chk CHECK (excluded_count IS NULL OR (typeof(excluded_count) = 'integer' AND excluded_count >= 0)),
  redacted_count INTEGER CONSTRAINT tenant_export_jobs_redacted_count_chk CHECK (redacted_count IS NULL OR (typeof(redacted_count) = 'integer' AND redacted_count >= 0)),
  artifact_created_at TEXT CONSTRAINT tenant_export_jobs_artifact_created_at_utc_chk CHECK (artifact_created_at IS NULL OR (length(artifact_created_at) = 24 AND artifact_created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND strftime('%Y-%m-%dT%H:%M:%fZ', artifact_created_at) = artifact_created_at)),
  expires_at TEXT CONSTRAINT tenant_export_jobs_expires_at_utc_chk CHECK (expires_at IS NULL OR (length(expires_at) = 24 AND expires_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND strftime('%Y-%m-%dT%H:%M:%fZ', expires_at) = expires_at)),
  error_code TEXT CONSTRAINT tenant_export_jobs_error_code_chk CHECK (error_code IS NULL OR (error_code IN ('EXPORT_SCOPE_INVALID', 'EXPORT_POLICY_BLOCKED', 'EXPORT_SNAPSHOT_FAILED', 'EXPORT_REDACTION_FAILED', 'EXPORT_ARTIFACT_FAILED', 'EXPORT_STORAGE_CHECKPOINT_FAILED', 'EXPORT_RETRYABLE', 'EXPORT_RETRY_EXHAUSTED', 'EXPORT_CANCELED', 'BLOCKED_EXPORT_REPLAY_CONFLICT', 'BLOCKED_EXPORT_EXPIRED', 'EXPORT_UNKNOWN_FAILURE') AND length(error_code) BETWEEN 3 AND 64 AND error_code = upper(error_code) AND error_code GLOB '[A-Z]*' AND error_code NOT GLOB '*[^A-Z0-9_]*')),
  error_message TEXT CONSTRAINT tenant_export_jobs_error_message_chk CHECK (error_message IS NULL OR (length(error_message) BETWEEN 1 AND 240 AND error_message = trim(error_message) AND error_message NOT GLOB '*[^A-Za-z0-9 .,:;_()/-]*' AND lower(error_message) NOT LIKE '%secret%' AND lower(error_message) NOT LIKE '%credential%' AND lower(error_message) NOT LIKE '%password%' AND lower(error_message) NOT LIKE '%token%' AND lower(error_message) NOT LIKE '%api_key%')),
  retry_count INTEGER NOT NULL DEFAULT 0 CONSTRAINT tenant_export_jobs_retry_count_chk CHECK (typeof(retry_count) = 'integer' AND retry_count BETWEEN 0 AND 10),
  max_retries INTEGER NOT NULL DEFAULT 3 CONSTRAINT tenant_export_jobs_max_retries_chk CHECK (typeof(max_retries) = 'integer' AND max_retries BETWEEN 0 AND 10),
  next_retry_at TEXT CONSTRAINT tenant_export_jobs_next_retry_at_utc_chk CHECK (next_retry_at IS NULL OR (length(next_retry_at) = 24 AND next_retry_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND strftime('%Y-%m-%dT%H:%M:%fZ', next_retry_at) = next_retry_at)),
  lease_owner_hash TEXT CONSTRAINT tenant_export_jobs_lease_owner_hash_chk CHECK (lease_owner_hash IS NULL OR (length(lease_owner_hash) = 64 AND lease_owner_hash NOT GLOB '*[^0-9a-f]*')),
  lease_generation INTEGER NOT NULL DEFAULT 0 CONSTRAINT tenant_export_jobs_lease_generation_chk CHECK (typeof(lease_generation) = 'integer' AND lease_generation BETWEEN 0 AND 2147483647),
  lease_acquired_at TEXT CONSTRAINT tenant_export_jobs_lease_acquired_at_utc_chk CHECK (lease_acquired_at IS NULL OR (length(lease_acquired_at) = 24 AND lease_acquired_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND strftime('%Y-%m-%dT%H:%M:%fZ', lease_acquired_at) = lease_acquired_at)),
  lease_heartbeat_at TEXT CONSTRAINT tenant_export_jobs_lease_heartbeat_at_utc_chk CHECK (lease_heartbeat_at IS NULL OR (length(lease_heartbeat_at) = 24 AND lease_heartbeat_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND strftime('%Y-%m-%dT%H:%M:%fZ', lease_heartbeat_at) = lease_heartbeat_at)),
  lease_expires_at TEXT CONSTRAINT tenant_export_jobs_lease_expires_at_utc_chk CHECK (lease_expires_at IS NULL OR (length(lease_expires_at) = 24 AND lease_expires_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND strftime('%Y-%m-%dT%H:%M:%fZ', lease_expires_at) = lease_expires_at)),
  correlation_id TEXT NOT NULL CONSTRAINT tenant_export_jobs_correlation_id_chk CHECK (length(correlation_id) BETWEEN 8 AND 128 AND correlation_id GLOB '[A-Za-z0-9]*' AND correlation_id NOT GLOB '*[^A-Za-z0-9._:-]*'),
  audit_event_id TEXT NOT NULL CONSTRAINT tenant_export_jobs_audit_event_id_format_chk CHECK (length(audit_event_id) = 36 AND length(replace(audit_event_id, '-', '')) = 32 AND audit_event_id NOT GLOB '*[^0-9A-Fa-f-]*' AND substr(audit_event_id, 9, 1) = '-' AND substr(audit_event_id, 14, 1) = '-' AND substr(audit_event_id, 19, 1) = '-' AND substr(audit_event_id, 24, 1) = '-'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) CONSTRAINT tenant_export_jobs_created_at_utc_chk CHECK (length(created_at) = 24 AND created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND strftime('%Y-%m-%dT%H:%M:%fZ', created_at) = created_at),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) CONSTRAINT tenant_export_jobs_updated_at_utc_chk CHECK (length(updated_at) = 24 AND updated_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z' AND strftime('%Y-%m-%dT%H:%M:%fZ', updated_at) = updated_at AND created_at <= updated_at),
  CONSTRAINT tenant_export_jobs_workspace_tenant_fkey FOREIGN KEY (tenant_id, workspace_id) REFERENCES workspaces (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT tenant_export_jobs_requester_membership_fkey FOREIGN KEY (tenant_id, requester_membership_id) REFERENCES tenant_memberships (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT tenant_export_jobs_support_grant_fkey FOREIGN KEY (support_access_grant_id) REFERENCES support_access_grants (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT tenant_export_jobs_requester_selector_chk CHECK ((requester_membership_id IS NOT NULL) <> (support_access_grant_id IS NOT NULL)),
  CONSTRAINT tenant_export_jobs_hashes_chk CHECK (length(scope_hash) = 64 AND scope_hash NOT GLOB '*[^0-9a-f]*' AND length(input_hash) = 64 AND input_hash NOT GLOB '*[^0-9a-f]*' AND length(idempotency_key_hash) = 64 AND idempotency_key_hash NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT tenant_export_jobs_artifact_facts_chk CHECK ((artifact_storage_ref IS NULL AND artifact_checksum_sha256 IS NULL AND included_count IS NULL AND excluded_count IS NULL AND redacted_count IS NULL AND artifact_created_at IS NULL AND expires_at IS NULL) OR (artifact_storage_ref IS NOT NULL AND artifact_checksum_sha256 IS NOT NULL AND included_count IS NOT NULL AND excluded_count IS NOT NULL AND redacted_count IS NOT NULL AND artifact_created_at IS NOT NULL AND expires_at IS NOT NULL AND status IN ('artifact_created', 'released', 'expired', 'deleted', 'retry_wait', 'failed', 'canceled'))),
  CONSTRAINT tenant_export_jobs_artifact_expiry_chk CHECK (artifact_created_at IS NULL OR (expires_at > artifact_created_at AND julianday(expires_at) - julianday(artifact_created_at) <= 7)),
  CONSTRAINT tenant_export_jobs_retry_facts_chk CHECK ((status = 'retry_wait' AND next_retry_at IS NOT NULL AND error_code IS NOT NULL AND error_message IS NOT NULL AND retry_count < max_retries) OR (status IN ('failed', 'canceled') AND next_retry_at IS NULL AND error_code IS NOT NULL AND error_message IS NOT NULL) OR (status NOT IN ('retry_wait', 'failed', 'canceled') AND next_retry_at IS NULL)),
  CONSTRAINT tenant_export_jobs_artifact_state_facts_chk CHECK (status NOT IN ('artifact_created', 'released', 'expired', 'deleted') OR (artifact_storage_ref IS NOT NULL AND artifact_checksum_sha256 IS NOT NULL AND included_count IS NOT NULL AND excluded_count IS NOT NULL AND redacted_count IS NOT NULL AND artifact_created_at IS NOT NULL AND expires_at IS NOT NULL)),
  CONSTRAINT tenant_export_jobs_lease_facts_chk CHECK ((lease_owner_hash IS NULL AND lease_acquired_at IS NULL AND lease_heartbeat_at IS NULL AND lease_expires_at IS NULL) OR (lease_owner_hash IS NOT NULL AND lease_acquired_at IS NOT NULL AND lease_heartbeat_at IS NOT NULL AND lease_expires_at IS NOT NULL AND lease_acquired_at <= lease_heartbeat_at AND lease_heartbeat_at < lease_expires_at AND (julianday(lease_expires_at) - julianday(lease_heartbeat_at)) * 86400 <= 900.1)),
  CONSTRAINT tenant_export_jobs_unique_idempotency UNIQUE (tenant_id, operation, idempotency_key_hash),
  CONSTRAINT tenant_export_jobs_retry_bounds_chk CHECK (retry_count <= max_retries),
  CONSTRAINT tenant_export_jobs_snapshot_state_chk CHECK (status NOT IN ('redacting', 'artifact_created', 'released', 'expired', 'deleted') OR (snapshot_at IS NOT NULL AND snapshot_at >= created_at)),
  CONSTRAINT tenant_export_jobs_artifact_snapshot_order_chk CHECK (artifact_created_at IS NULL OR (snapshot_at IS NOT NULL AND artifact_created_at >= snapshot_at))
);

CREATE INDEX IF NOT EXISTS idx_tenant_export_jobs_tenant_history ON tenant_export_jobs(tenant_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_tenant_export_jobs_queue ON tenant_export_jobs(tenant_id, status, next_retry_at, created_at);
CREATE INDEX IF NOT EXISTS idx_tenant_export_jobs_lease ON tenant_export_jobs(tenant_id, status, lease_expires_at, lease_generation);
CREATE INDEX IF NOT EXISTS idx_tenant_export_jobs_expiry ON tenant_export_jobs(tenant_id, status, expires_at);

CREATE TRIGGER IF NOT EXISTS trg_novatrade_tenant_export_jobs_scope_guard
BEFORE INSERT ON tenant_export_jobs
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NEW.status IS NOT 'requested'
    OR NEW.snapshot_at IS NOT NULL
    OR NEW.artifact_storage_ref IS NOT NULL OR NEW.artifact_checksum_sha256 IS NOT NULL
    OR NEW.included_count IS NOT NULL OR NEW.excluded_count IS NOT NULL OR NEW.redacted_count IS NOT NULL
    OR NEW.artifact_created_at IS NOT NULL OR NEW.expires_at IS NOT NULL
    OR NEW.error_code IS NOT NULL OR NEW.error_message IS NOT NULL OR NEW.next_retry_at IS NOT NULL
    OR NEW.retry_count <> 0 OR NEW.lease_owner_hash IS NOT NULL OR NEW.lease_generation <> 0
    OR NEW.lease_acquired_at IS NOT NULL OR NEW.lease_heartbeat_at IS NOT NULL OR NEW.lease_expires_at IS NOT NULL
    THEN RAISE(ABORT, 'export job must be inserted in the exact requested initial state') END;
  SELECT CASE WHEN NEW.requester_membership_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM tenant_memberships AS membership
    JOIN tenant_role_bindings AS binding ON binding.tenant_id = membership.tenant_id AND binding.membership_id = membership.id
    WHERE membership.tenant_id = NEW.tenant_id AND membership.id = NEW.requester_membership_id
      AND membership.auth_identity_id = NEW.requester_auth_identity_id AND membership.status = 'active'
      AND (membership.workspace_id IS NULL OR membership.workspace_id IS NEW.workspace_id)
      AND binding.role IN ('owner', 'admin') AND binding.revoked_at IS NULL
      AND binding.valid_from <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ) THEN RAISE(ABORT, 'export requester membership is not active, same-tenant, same-scope, and identity-matched') END;
  SELECT CASE WHEN NEW.requester_membership_id IS NULL AND NOT EXISTS (
    SELECT 1 FROM support_access_grants AS grant_row
    JOIN support_access_grant_permissions AS permission_row ON permission_row.grant_id = grant_row.id AND permission_row.permission = 'data:export'
    WHERE grant_row.id = NEW.support_access_grant_id AND grant_row.tenant_id = NEW.tenant_id
      AND grant_row.support_actor_auth_identity_id = NEW.requester_auth_identity_id
      AND (grant_row.workspace_id IS NULL OR grant_row.workspace_id IS NEW.workspace_id) AND grant_row.state = 'approved'
      AND grant_row.revoked_at IS NULL AND grant_row.starts_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AND strftime('%Y-%m-%dT%H:%M:%fZ', 'now') < grant_row.expires_at
  ) THEN RAISE(ABORT, 'export requester support grant is not active, same-tenant, same-scope, and identity-matched') END;
  SELECT CASE WHEN NEW.artifact_storage_ref IS NOT NULL AND NEW.artifact_storage_ref NOT LIKE 'tenants/' || NEW.tenant_id || '/exports/' || NEW.id || '/%' THEN RAISE(ABORT, 'export artifact reference is outside the job tenant namespace') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_novatrade_tenant_export_jobs_scope_guard_update
BEFORE UPDATE ON tenant_export_jobs
FOR EACH ROW
BEGIN
  SELECT CASE WHEN (OLD.status = NEW.status OR NEW.status NOT IN ('failed', 'canceled', 'expired', 'deleted'))
    AND NOT (NEW.updated_at IS NOT OLD.updated_at
      AND NEW.id IS OLD.id AND NEW.tenant_id IS OLD.tenant_id AND NEW.workspace_id IS OLD.workspace_id
      AND NEW.operation IS OLD.operation AND NEW.requester_auth_identity_id IS OLD.requester_auth_identity_id
      AND NEW.requester_membership_id IS OLD.requester_membership_id AND NEW.support_access_grant_id IS OLD.support_access_grant_id
      AND NEW.status IS OLD.status AND NEW.scope_hash IS OLD.scope_hash AND NEW.input_hash IS OLD.input_hash
      AND NEW.idempotency_key_hash IS OLD.idempotency_key_hash AND NEW.policy_version IS OLD.policy_version
      AND NEW.manifest_version IS OLD.manifest_version AND NEW.schema_version IS OLD.schema_version
      AND NEW.requested_format IS OLD.requested_format AND NEW.snapshot_at IS OLD.snapshot_at
      AND NEW.artifact_storage_ref IS OLD.artifact_storage_ref AND NEW.artifact_checksum_sha256 IS OLD.artifact_checksum_sha256
      AND NEW.included_count IS OLD.included_count AND NEW.excluded_count IS OLD.excluded_count
      AND NEW.redacted_count IS OLD.redacted_count AND NEW.artifact_created_at IS OLD.artifact_created_at
      AND NEW.expires_at IS OLD.expires_at AND NEW.error_code IS OLD.error_code AND NEW.error_message IS OLD.error_message
      AND NEW.retry_count IS OLD.retry_count AND NEW.max_retries IS OLD.max_retries AND NEW.next_retry_at IS OLD.next_retry_at
      AND NEW.lease_owner_hash IS OLD.lease_owner_hash AND NEW.lease_generation IS OLD.lease_generation
      AND NEW.lease_acquired_at IS OLD.lease_acquired_at AND NEW.lease_heartbeat_at IS OLD.lease_heartbeat_at
      AND NEW.lease_expires_at IS OLD.lease_expires_at AND NEW.correlation_id IS OLD.correlation_id
      AND NEW.audit_event_id IS OLD.audit_event_id AND NEW.created_at IS OLD.created_at)
    AND NEW.requester_membership_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM tenant_memberships AS membership
    JOIN tenant_role_bindings AS binding ON binding.tenant_id = membership.tenant_id AND binding.membership_id = membership.id
    WHERE membership.tenant_id = NEW.tenant_id AND membership.id = NEW.requester_membership_id
      AND membership.auth_identity_id = NEW.requester_auth_identity_id AND membership.status = 'active'
      AND (membership.workspace_id IS NULL OR membership.workspace_id IS NEW.workspace_id)
      AND binding.role IN ('owner', 'admin') AND binding.revoked_at IS NULL
      AND binding.valid_from <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ) THEN RAISE(ABORT, 'export requester membership is not active, same-tenant, same-scope, and identity-matched') END;
  SELECT CASE WHEN (OLD.status = NEW.status OR NEW.status NOT IN ('failed', 'canceled', 'expired', 'deleted'))
    AND NOT (NEW.updated_at IS NOT OLD.updated_at
      AND NEW.id IS OLD.id AND NEW.tenant_id IS OLD.tenant_id AND NEW.workspace_id IS OLD.workspace_id
      AND NEW.operation IS OLD.operation AND NEW.requester_auth_identity_id IS OLD.requester_auth_identity_id
      AND NEW.requester_membership_id IS OLD.requester_membership_id AND NEW.support_access_grant_id IS OLD.support_access_grant_id
      AND NEW.status IS OLD.status AND NEW.scope_hash IS OLD.scope_hash AND NEW.input_hash IS OLD.input_hash
      AND NEW.idempotency_key_hash IS OLD.idempotency_key_hash AND NEW.policy_version IS OLD.policy_version
      AND NEW.manifest_version IS OLD.manifest_version AND NEW.schema_version IS OLD.schema_version
      AND NEW.requested_format IS OLD.requested_format AND NEW.snapshot_at IS OLD.snapshot_at
      AND NEW.artifact_storage_ref IS OLD.artifact_storage_ref AND NEW.artifact_checksum_sha256 IS OLD.artifact_checksum_sha256
      AND NEW.included_count IS OLD.included_count AND NEW.excluded_count IS OLD.excluded_count
      AND NEW.redacted_count IS OLD.redacted_count AND NEW.artifact_created_at IS OLD.artifact_created_at
      AND NEW.expires_at IS OLD.expires_at AND NEW.error_code IS OLD.error_code AND NEW.error_message IS OLD.error_message
      AND NEW.retry_count IS OLD.retry_count AND NEW.max_retries IS OLD.max_retries AND NEW.next_retry_at IS OLD.next_retry_at
      AND NEW.lease_owner_hash IS OLD.lease_owner_hash AND NEW.lease_generation IS OLD.lease_generation
      AND NEW.lease_acquired_at IS OLD.lease_acquired_at AND NEW.lease_heartbeat_at IS OLD.lease_heartbeat_at
      AND NEW.lease_expires_at IS OLD.lease_expires_at AND NEW.correlation_id IS OLD.correlation_id
      AND NEW.audit_event_id IS OLD.audit_event_id AND NEW.created_at IS OLD.created_at)
    AND NEW.requester_membership_id IS NULL AND NOT EXISTS (
    SELECT 1 FROM support_access_grants AS grant_row
    JOIN support_access_grant_permissions AS permission_row ON permission_row.grant_id = grant_row.id AND permission_row.permission = 'data:export'
    WHERE grant_row.id = NEW.support_access_grant_id AND grant_row.tenant_id = NEW.tenant_id
      AND grant_row.support_actor_auth_identity_id = NEW.requester_auth_identity_id
      AND (grant_row.workspace_id IS NULL OR grant_row.workspace_id IS NEW.workspace_id) AND grant_row.state = 'approved'
      AND grant_row.revoked_at IS NULL AND grant_row.starts_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AND strftime('%Y-%m-%dT%H:%M:%fZ', 'now') < grant_row.expires_at
  ) THEN RAISE(ABORT, 'export requester support grant is not active, same-tenant, same-scope, and identity-matched') END;
  SELECT CASE WHEN NEW.artifact_storage_ref IS NOT NULL AND NEW.artifact_storage_ref NOT LIKE 'tenants/' || NEW.tenant_id || '/exports/' || NEW.id || '/%' THEN RAISE(ABORT, 'export artifact reference is outside the job tenant namespace') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_novatrade_tenant_export_jobs_guard
BEFORE UPDATE ON tenant_export_jobs
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NEW.id IS NOT OLD.id THEN RAISE(ABORT, 'export job id is immutable') END;
  SELECT CASE WHEN NEW.tenant_id IS NOT OLD.tenant_id THEN RAISE(ABORT, 'export job tenant_id is immutable') END;
  SELECT CASE WHEN NEW.workspace_id IS NOT OLD.workspace_id THEN RAISE(ABORT, 'export job workspace_id is immutable') END;
  SELECT CASE WHEN NEW.operation IS NOT OLD.operation THEN RAISE(ABORT, 'export job operation is immutable') END;
  SELECT CASE WHEN NEW.requester_auth_identity_id IS NOT OLD.requester_auth_identity_id THEN RAISE(ABORT, 'export job requester identity is immutable') END;
  SELECT CASE WHEN NEW.requester_membership_id IS NOT OLD.requester_membership_id OR NEW.support_access_grant_id IS NOT OLD.support_access_grant_id THEN RAISE(ABORT, 'export job requester authority reference is immutable') END;
  SELECT CASE WHEN NEW.scope_hash IS NOT OLD.scope_hash OR NEW.input_hash IS NOT OLD.input_hash OR NEW.idempotency_key_hash IS NOT OLD.idempotency_key_hash THEN RAISE(ABORT, 'export job request hashes are immutable') END;
  SELECT CASE WHEN NEW.policy_version IS NOT OLD.policy_version OR NEW.manifest_version IS NOT OLD.manifest_version OR NEW.schema_version IS NOT OLD.schema_version OR NEW.requested_format IS NOT OLD.requested_format THEN RAISE(ABORT, 'export job contract facts are immutable') END;
  SELECT CASE WHEN NEW.max_retries IS NOT OLD.max_retries THEN RAISE(ABORT, 'export job max_retries is immutable') END;
  SELECT CASE WHEN NEW.created_at IS NOT OLD.created_at OR NEW.correlation_id IS NOT OLD.correlation_id OR NEW.audit_event_id IS NOT OLD.audit_event_id THEN RAISE(ABORT, 'export job identity and audit facts are immutable') END;
  SELECT CASE WHEN OLD.snapshot_at IS NOT NULL AND NEW.snapshot_at IS NOT OLD.snapshot_at THEN RAISE(ABORT, 'export snapshot fact is immutable once set') END;
  SELECT CASE WHEN OLD.artifact_storage_ref IS NOT NULL AND (NEW.artifact_storage_ref IS NOT OLD.artifact_storage_ref OR NEW.artifact_checksum_sha256 IS NOT OLD.artifact_checksum_sha256 OR NEW.included_count IS NOT OLD.included_count OR NEW.excluded_count IS NOT OLD.excluded_count OR NEW.redacted_count IS NOT OLD.redacted_count OR NEW.artifact_created_at IS NOT OLD.artifact_created_at OR NEW.expires_at IS NOT OLD.expires_at) THEN RAISE(ABORT, 'export artifact facts are immutable once set') END;
  SELECT CASE WHEN NOT (OLD.status = NEW.status OR (OLD.status = 'requested' AND NEW.status IN ('snapshotting', 'failed', 'canceled')) OR (OLD.status = 'snapshotting' AND NEW.status IN ('redacting', 'retry_wait', 'failed', 'canceled')) OR (OLD.status = 'redacting' AND NEW.status IN ('artifact_created', 'retry_wait', 'failed', 'canceled')) OR (OLD.status = 'artifact_created' AND NEW.status IN ('released', 'retry_wait', 'failed', 'canceled')) OR (OLD.status = 'released' AND NEW.status IN ('expired', 'deleted')) OR (OLD.status = 'retry_wait' AND NEW.status IN ('snapshotting', 'redacting', 'artifact_created', 'failed', 'canceled')) OR (OLD.status = 'failed' AND NEW.status IN ('retry_wait', 'canceled')) OR (OLD.status = 'expired' AND NEW.status = 'deleted')) THEN RAISE(ABORT, 'export job state transition is invalid') END;
  SELECT CASE WHEN OLD.status IS NOT 'retry_wait' AND NEW.status = 'retry_wait' AND (OLD.retry_count >= 10 OR NEW.retry_count <> OLD.retry_count + 1) THEN RAISE(ABORT, 'export job retry_count must increment exactly once when entering retry_wait') END;
  SELECT CASE WHEN NOT (OLD.status IS NOT 'retry_wait' AND NEW.status = 'retry_wait') AND NEW.retry_count IS NOT OLD.retry_count THEN RAISE(ABORT, 'export job retry_count is immutable outside retry_wait entry') END;
  SELECT CASE WHEN NEW.lease_generation < OLD.lease_generation THEN RAISE(ABORT, 'export job lease generation is stale or skipped') END;
  SELECT CASE WHEN OLD.lease_generation < 2147483647 AND NEW.lease_generation > OLD.lease_generation + 1 THEN RAISE(ABORT, 'export job lease generation is stale or skipped') END;
  SELECT CASE WHEN OLD.lease_generation = 2147483647 AND NEW.lease_generation > OLD.lease_generation THEN RAISE(ABORT, 'export job lease generation is stale or skipped') END;
  SELECT CASE WHEN NEW.lease_generation = OLD.lease_generation AND OLD.lease_owner_hash IS NULL AND NEW.lease_owner_hash IS NOT NULL THEN RAISE(ABORT, 'export job lease acquisition requires a new generation') END;
  SELECT CASE WHEN NEW.lease_generation = OLD.lease_generation AND OLD.lease_owner_hash IS NOT NULL AND NEW.lease_owner_hash IS NULL AND (NEW.lease_acquired_at IS NOT NULL OR NEW.lease_heartbeat_at IS NOT NULL OR NEW.lease_expires_at IS NOT NULL) THEN RAISE(ABORT, 'export job lease release must clear all lease facts') END;
  SELECT CASE WHEN NEW.lease_generation = OLD.lease_generation AND OLD.lease_owner_hash IS NOT NULL AND NEW.lease_owner_hash IS NOT NULL AND NEW.lease_owner_hash IS NOT OLD.lease_owner_hash THEN RAISE(ABORT, 'export job lease owner cannot change within a generation') END;
  SELECT CASE WHEN NEW.lease_generation = OLD.lease_generation AND OLD.lease_owner_hash IS NOT NULL AND NEW.lease_owner_hash IS NOT NULL AND NEW.lease_acquired_at IS NOT OLD.lease_acquired_at THEN RAISE(ABORT, 'export job lease acquired_at cannot change within a generation') END;
  SELECT CASE WHEN NEW.lease_generation = OLD.lease_generation AND OLD.lease_owner_hash IS NOT NULL AND NEW.lease_owner_hash IS NOT NULL AND NEW.lease_heartbeat_at < OLD.lease_heartbeat_at THEN RAISE(ABORT, 'export job lease heartbeat cannot move backward') END;
  SELECT CASE WHEN OLD.lease_generation < 2147483647 AND NEW.lease_generation = OLD.lease_generation + 1 AND OLD.lease_owner_hash IS NOT NULL AND OLD.lease_expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now') THEN RAISE(ABORT, 'export job lease generation cannot replace a live lease') END;
  SELECT CASE WHEN OLD.lease_generation < 2147483647 AND NEW.lease_generation = OLD.lease_generation + 1 AND NEW.lease_owner_hash IS NULL THEN RAISE(ABORT, 'export job new lease generation requires an owner') END;
  SELECT CASE WHEN NEW.lease_generation = OLD.lease_generation AND OLD.lease_owner_hash IS NOT NULL AND NEW.lease_owner_hash IS NOT NULL AND NEW.lease_expires_at < OLD.lease_expires_at THEN RAISE(ABORT, 'export job lease expiry cannot move backward within a generation') END;
  SELECT CASE WHEN NEW.status IN ('artifact_created', 'released', 'expired', 'deleted') AND NEW.artifact_storage_ref IS NULL THEN RAISE(ABORT, 'export job completed state requires artifact facts') END;
  SELECT CASE WHEN NEW.status = 'expired' AND NEW.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now') THEN RAISE(ABORT, 'export job cannot expire before artifact expiry') END;
  SELECT CASE WHEN NEW.status = 'retry_wait' AND (NEW.next_retry_at IS NULL OR NEW.error_code IS NULL OR NEW.error_message IS NULL OR NEW.retry_count >= NEW.max_retries) THEN RAISE(ABORT, 'export job retry state requires bounded retry facts') END;
  SELECT CASE WHEN NEW.status IN ('failed', 'canceled') AND (NEW.error_code IS NULL OR NEW.error_message IS NULL OR NEW.next_retry_at IS NOT NULL) THEN RAISE(ABORT, 'export job failed or canceled state requires a safe terminal error') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_novatrade_tenant_export_jobs_touch_updated_at
AFTER UPDATE ON tenant_export_jobs
FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE tenant_export_jobs
  SET updated_at = CASE WHEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') = OLD.updated_at THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+1 second') ELSE strftime('%Y-%m-%dT%H:%M:%fZ', 'now') END
  WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS tenant_deletion_jobs (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id NOT GLOB '*[^0-9A-Fa-f-]*'),
  tenant_id TEXT NOT NULL CHECK (length(tenant_id) = 36 AND tenant_id NOT GLOB '*[^0-9A-Fa-f-]*') REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  workspace_id TEXT,
  operation TEXT NOT NULL DEFAULT 'tenant_data_deletion' CHECK (operation = 'tenant_data_deletion'),
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('tenant', 'workspace', 'resource_set')),
  scope_selector_hash TEXT NOT NULL CHECK (length(scope_selector_hash) = 64 AND scope_selector_hash NOT GLOB '*[^0-9a-f]*'),
  requested_by_auth_identity_id TEXT NOT NULL CHECK (length(requested_by_auth_identity_id) = 36 AND requested_by_auth_identity_id NOT GLOB '*[^0-9A-Fa-f-]*'),
  requested_by_membership_id TEXT NOT NULL CHECK (length(requested_by_membership_id) = 36 AND requested_by_membership_id NOT GLOB '*[^0-9A-Fa-f-]*'),
  verified_by_auth_identity_id TEXT CHECK (verified_by_auth_identity_id IS NULL OR (length(verified_by_auth_identity_id) = 36 AND verified_by_auth_identity_id NOT GLOB '*[^0-9A-Fa-f-]*')),
  verified_by_membership_id TEXT CHECK (verified_by_membership_id IS NULL OR (length(verified_by_membership_id) = 36 AND verified_by_membership_id NOT GLOB '*[^0-9A-Fa-f-]*')),
  verified_at TEXT,
  approved_by_auth_identity_id TEXT CHECK (approved_by_auth_identity_id IS NULL OR (length(approved_by_auth_identity_id) = 36 AND approved_by_auth_identity_id NOT GLOB '*[^0-9A-Fa-f-]*')),
  approved_by_membership_id TEXT CHECK (approved_by_membership_id IS NULL OR (length(approved_by_membership_id) = 36 AND approved_by_membership_id NOT GLOB '*[^0-9A-Fa-f-]*')),
  approved_at TEXT,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','verified','scheduled','running','retry_wait','failed','canceled','primary_deleted','backup_aging','completed')),
  policy_version TEXT NOT NULL CHECK (length(policy_version) BETWEEN 5 AND 128 AND policy_version NOT GLOB '*[^A-Za-z0-9._-]*'),
  policy_snapshot_hash TEXT NOT NULL CHECK (length(policy_snapshot_hash) = 64 AND policy_snapshot_hash NOT GLOB '*[^0-9a-f]*'),
  input_hash TEXT NOT NULL CHECK (length(input_hash) = 64 AND input_hash NOT GLOB '*[^0-9a-f]*'),
  idempotency_key_hash TEXT NOT NULL CHECK (length(idempotency_key_hash) = 64 AND idempotency_key_hash NOT GLOB '*[^0-9a-f]*'),
  legal_hold_status TEXT NOT NULL DEFAULT 'none' CHECK (legal_hold_status IN ('none','active_subset','released','unresolved')),
  legal_hold_snapshot_hash TEXT,
  held_scope_hash TEXT,
  uncovered_scope_hash TEXT,
  freeze_handoff_status TEXT NOT NULL DEFAULT 'not_started' CHECK (freeze_handoff_status IN ('not_started','requested','acknowledged','failed')),
  access_revocation_handoff_status TEXT NOT NULL DEFAULT 'not_started' CHECK (access_revocation_handoff_status IN ('not_started','requested','acknowledged','failed')),
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (typeof(retry_count) = 'integer' AND retry_count BETWEEN 0 AND 10),
  max_retries INTEGER NOT NULL DEFAULT 3 CHECK (typeof(max_retries) = 'integer' AND max_retries BETWEEN 0 AND 10),
  next_retry_at TEXT,
  lease_owner_hash TEXT CHECK (lease_owner_hash IS NULL OR (length(lease_owner_hash) = 64 AND lease_owner_hash NOT GLOB '*[^0-9a-f]*')),
  lease_generation INTEGER NOT NULL DEFAULT 0 CHECK (typeof(lease_generation) = 'integer' AND lease_generation BETWEEN 0 AND 2147483647),
  lease_acquired_at TEXT,
  lease_heartbeat_at TEXT,
  lease_expires_at TEXT,
  correlation_id TEXT NOT NULL CHECK (length(correlation_id) BETWEEN 8 AND 128 AND correlation_id NOT GLOB '*[^A-Za-z0-9._:-]*'),
  audit_event_id TEXT NOT NULL CHECK (length(audit_event_id) = 36 AND audit_event_id NOT GLOB '*[^0-9A-Fa-f-]*'),
  error_code TEXT,
  error_fingerprint TEXT CHECK (error_fingerprint IS NULL OR (length(error_fingerprint) = 64 AND error_fingerprint NOT GLOB '*[^0-9a-f]*')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  scheduled_at TEXT,
  started_at TEXT,
  primary_deleted_at TEXT,
  backup_aging_at TEXT,
  completed_at TEXT,
  canceled_at TEXT,
  backup_expiry_target_at TEXT,
  CONSTRAINT tenant_deletion_jobs_workspace_tenant_fkey FOREIGN KEY (tenant_id, workspace_id) REFERENCES workspaces(tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT tenant_deletion_jobs_requester_membership_fkey FOREIGN KEY (tenant_id, requested_by_membership_id) REFERENCES tenant_memberships(tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT tenant_deletion_jobs_verified_membership_fkey FOREIGN KEY (tenant_id, verified_by_membership_id) REFERENCES tenant_memberships(tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT tenant_deletion_jobs_approved_membership_fkey FOREIGN KEY (tenant_id, approved_by_membership_id) REFERENCES tenant_memberships(tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT tenant_deletion_jobs_scope_shape_chk CHECK ((scope_kind = 'tenant' AND workspace_id IS NULL) OR (scope_kind = 'workspace' AND workspace_id IS NOT NULL) OR scope_kind = 'resource_set'),
  CONSTRAINT tenant_deletion_jobs_error_code_chk CHECK (error_code IS NULL OR error_code IN ('DELETE_SCOPE_INVALID','DELETE_POLICY_BLOCKED','DELETE_CHECKPOINT_RETRYABLE','DELETE_CHECKPOINT_FAILED','DELETE_PROVIDER_RESPONSE_INVALID','DELETE_PROVIDER_OUTAGE','DELETE_TIMEOUT','DELETE_CANCELED','DELETE_HOLD_UNRESOLVED','DELETE_REPLAY_CONFLICT','DELETE_INTERNAL')),
  CONSTRAINT tenant_deletion_jobs_status_attribution_chk CHECK ((verified_at IS NULL AND verified_by_auth_identity_id IS NULL AND verified_by_membership_id IS NULL) OR (status <> 'requested' AND verified_at IS NOT NULL AND verified_by_auth_identity_id IS NOT NULL AND verified_by_membership_id IS NOT NULL)),
  CONSTRAINT tenant_deletion_jobs_approval_chk CHECK ((approved_at IS NULL AND approved_by_auth_identity_id IS NULL AND approved_by_membership_id IS NULL) OR (status NOT IN ('requested','verified') AND approved_at IS NOT NULL AND approved_by_auth_identity_id IS NOT NULL AND approved_by_membership_id IS NOT NULL AND verified_at IS NOT NULL)),
  CONSTRAINT tenant_deletion_jobs_hold_shape_chk CHECK ((legal_hold_status = 'none' AND legal_hold_snapshot_hash IS NULL AND held_scope_hash IS NULL AND uncovered_scope_hash IS NULL) OR (legal_hold_status IN ('active_subset','released') AND length(legal_hold_snapshot_hash) = 64 AND length(held_scope_hash) = 64 AND length(uncovered_scope_hash) = 64) OR (legal_hold_status = 'unresolved' AND length(legal_hold_snapshot_hash) = 64)),
  CONSTRAINT tenant_deletion_jobs_hold_hash_shape_chk CHECK ((legal_hold_snapshot_hash IS NULL OR (length(legal_hold_snapshot_hash) = 64 AND legal_hold_snapshot_hash NOT GLOB '*[^0-9a-f]*')) AND (held_scope_hash IS NULL OR (length(held_scope_hash) = 64 AND held_scope_hash NOT GLOB '*[^0-9a-f]*')) AND (uncovered_scope_hash IS NULL OR (length(uncovered_scope_hash) = 64 AND uncovered_scope_hash NOT GLOB '*[^0-9a-f]*'))),
  CONSTRAINT tenant_deletion_jobs_timestamp_shape_chk CHECK (length(created_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', created_at) = created_at AND length(updated_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', updated_at) = updated_at AND (verified_at IS NULL OR (length(verified_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', verified_at) = verified_at)) AND (approved_at IS NULL OR (length(approved_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', approved_at) = approved_at)) AND (scheduled_at IS NULL OR (length(scheduled_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', scheduled_at) = scheduled_at)) AND (started_at IS NULL OR (length(started_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', started_at) = started_at)) AND (primary_deleted_at IS NULL OR (length(primary_deleted_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', primary_deleted_at) = primary_deleted_at)) AND (backup_aging_at IS NULL OR (length(backup_aging_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', backup_aging_at) = backup_aging_at)) AND (backup_expiry_target_at IS NULL OR (length(backup_expiry_target_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', backup_expiry_target_at) = backup_expiry_target_at)) AND (completed_at IS NULL OR (length(completed_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', completed_at) = completed_at)) AND (canceled_at IS NULL OR (length(canceled_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', canceled_at) = canceled_at)) AND (next_retry_at IS NULL OR (length(next_retry_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', next_retry_at) = next_retry_at)) AND (lease_acquired_at IS NULL OR (length(lease_acquired_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', lease_acquired_at) = lease_acquired_at)) AND (lease_heartbeat_at IS NULL OR (length(lease_heartbeat_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', lease_heartbeat_at) = lease_heartbeat_at)) AND (lease_expires_at IS NULL OR (length(lease_expires_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', lease_expires_at) = lease_expires_at))),
  CONSTRAINT tenant_deletion_jobs_timestamp_order_chk CHECK (created_at <= updated_at AND (verified_at IS NULL OR verified_at >= created_at) AND (approved_at IS NULL OR (verified_at IS NOT NULL AND approved_at >= verified_at)) AND (scheduled_at IS NULL OR (approved_at IS NOT NULL AND scheduled_at >= approved_at)) AND (scheduled_at IS NULL OR scheduled_at >= created_at) AND (started_at IS NULL OR (scheduled_at IS NOT NULL AND started_at >= scheduled_at)) AND (primary_deleted_at IS NULL OR (started_at IS NOT NULL AND primary_deleted_at >= started_at)) AND (backup_aging_at IS NULL OR (primary_deleted_at IS NOT NULL AND backup_aging_at >= primary_deleted_at)) AND (completed_at IS NULL OR (backup_aging_at IS NOT NULL AND completed_at >= backup_aging_at)) AND (backup_expiry_target_at IS NULL OR (primary_deleted_at IS NOT NULL AND backup_expiry_target_at >= primary_deleted_at AND julianday(backup_expiry_target_at) - julianday(primary_deleted_at) <= 35))),
  CONSTRAINT tenant_deletion_jobs_status_timestamp_chk CHECK ((status NOT IN ('scheduled','running','retry_wait','failed','primary_deleted','backup_aging','completed') OR scheduled_at IS NOT NULL) AND (status NOT IN ('running','retry_wait','failed','primary_deleted','backup_aging','completed') OR started_at IS NOT NULL) AND (status NOT IN ('primary_deleted','backup_aging','completed') OR primary_deleted_at IS NOT NULL) AND (status NOT IN ('backup_aging','completed') OR backup_aging_at IS NOT NULL) AND (status <> 'completed' OR completed_at IS NOT NULL) AND (status <> 'canceled' OR canceled_at IS NOT NULL)),
  CONSTRAINT tenant_deletion_jobs_lease_shape_chk CHECK ((lease_owner_hash IS NULL AND ((lease_acquired_at IS NULL AND lease_heartbeat_at IS NULL AND lease_expires_at IS NULL) OR (lease_acquired_at IS NOT NULL AND lease_heartbeat_at IS NOT NULL AND lease_expires_at IS NOT NULL AND lease_acquired_at <= lease_heartbeat_at AND lease_heartbeat_at < lease_expires_at AND (julianday(lease_expires_at) - julianday(lease_heartbeat_at)) * 86400 <= 900.1)) OR (lease_owner_hash IS NOT NULL AND lease_acquired_at IS NOT NULL AND lease_heartbeat_at IS NOT NULL AND lease_expires_at IS NOT NULL AND lease_acquired_at <= lease_heartbeat_at AND lease_heartbeat_at < lease_expires_at AND (julianday(lease_expires_at) - julianday(lease_heartbeat_at)) * 86400 <= 900.1))),
  CONSTRAINT tenant_deletion_jobs_lease_status_chk CHECK (status = 'running' OR lease_owner_hash IS NULL),
  CONSTRAINT tenant_deletion_jobs_canceled_exact_shape_chk CHECK (status <> 'canceled' OR (canceled_at IS NOT NULL AND started_at IS NULL AND primary_deleted_at IS NULL AND backup_aging_at IS NULL AND completed_at IS NULL AND retry_count = 0 AND next_retry_at IS NULL AND lease_owner_hash IS NULL AND lease_acquired_at IS NULL AND lease_heartbeat_at IS NULL AND lease_expires_at IS NULL AND error_code IS NULL AND error_fingerprint IS NULL AND backup_expiry_target_at IS NULL AND ((verified_at IS NULL AND verified_by_auth_identity_id IS NULL AND verified_by_membership_id IS NULL AND approved_at IS NULL AND approved_by_auth_identity_id IS NULL AND approved_by_membership_id IS NULL AND scheduled_at IS NULL) OR (verified_at IS NOT NULL AND verified_by_auth_identity_id IS NOT NULL AND verified_by_membership_id IS NOT NULL AND approved_at IS NULL AND approved_by_auth_identity_id IS NULL AND approved_by_membership_id IS NULL AND scheduled_at IS NULL) OR (verified_at IS NOT NULL AND verified_by_auth_identity_id IS NOT NULL AND verified_by_membership_id IS NOT NULL AND approved_at IS NOT NULL AND approved_by_auth_identity_id IS NOT NULL AND approved_by_membership_id IS NOT NULL AND scheduled_at IS NOT NULL)))),
  CONSTRAINT tenant_deletion_jobs_status_exact_shape_chk CHECK ((status <> 'requested' OR (verified_by_auth_identity_id IS NULL AND verified_by_membership_id IS NULL AND verified_at IS NULL AND approved_by_auth_identity_id IS NULL AND approved_by_membership_id IS NULL AND approved_at IS NULL AND scheduled_at IS NULL AND started_at IS NULL AND primary_deleted_at IS NULL AND backup_aging_at IS NULL AND completed_at IS NULL AND canceled_at IS NULL AND retry_count = 0 AND next_retry_at IS NULL AND lease_owner_hash IS NULL AND error_code IS NULL AND error_fingerprint IS NULL AND backup_expiry_target_at IS NULL AND freeze_handoff_status = 'not_started' AND access_revocation_handoff_status = 'not_started')) AND (status <> 'verified' OR (verified_by_auth_identity_id IS NOT NULL AND verified_by_membership_id IS NOT NULL AND verified_at IS NOT NULL AND approved_by_auth_identity_id IS NULL AND approved_by_membership_id IS NULL AND approved_at IS NULL AND scheduled_at IS NULL AND started_at IS NULL AND primary_deleted_at IS NULL AND backup_aging_at IS NULL AND completed_at IS NULL AND canceled_at IS NULL AND retry_count = 0 AND next_retry_at IS NULL AND lease_owner_hash IS NULL AND error_code IS NULL AND error_fingerprint IS NULL AND backup_expiry_target_at IS NULL)) AND (status <> 'scheduled' OR (verified_at IS NOT NULL AND approved_by_auth_identity_id IS NOT NULL AND approved_by_membership_id IS NOT NULL AND approved_at IS NOT NULL AND scheduled_at IS NOT NULL AND started_at IS NULL AND primary_deleted_at IS NULL AND backup_aging_at IS NULL AND completed_at IS NULL AND canceled_at IS NULL AND retry_count = 0 AND next_retry_at IS NULL AND lease_owner_hash IS NULL AND error_code IS NULL AND error_fingerprint IS NULL AND backup_expiry_target_at IS NULL)) AND (status NOT IN ('running','retry_wait','failed') OR (verified_at IS NOT NULL AND approved_at IS NOT NULL AND scheduled_at IS NOT NULL AND started_at IS NOT NULL AND primary_deleted_at IS NULL AND backup_aging_at IS NULL AND completed_at IS NULL AND canceled_at IS NULL AND backup_expiry_target_at IS NULL)) AND (status <> 'primary_deleted' OR (primary_deleted_at IS NOT NULL AND backup_aging_at IS NULL AND completed_at IS NULL AND canceled_at IS NULL)) AND (status <> 'backup_aging' OR (primary_deleted_at IS NOT NULL AND backup_aging_at IS NOT NULL AND completed_at IS NULL AND canceled_at IS NULL)) AND (status <> 'completed' OR (primary_deleted_at IS NOT NULL AND backup_aging_at IS NOT NULL AND completed_at IS NOT NULL AND canceled_at IS NULL))),
  CONSTRAINT tenant_deletion_jobs_backup_target_state_chk CHECK ((status IN ('requested','verified','scheduled','running','retry_wait','failed','canceled') AND backup_expiry_target_at IS NULL) OR (status IN ('primary_deleted','backup_aging','completed') AND backup_expiry_target_at IS NOT NULL)),
  CONSTRAINT tenant_deletion_jobs_retry_shape_chk CHECK ((status = 'retry_wait' AND next_retry_at IS NOT NULL AND retry_count <= max_retries AND error_code = 'DELETE_CHECKPOINT_RETRYABLE' AND error_fingerprint IS NOT NULL) OR (status = 'failed' AND next_retry_at IS NULL AND error_code IS NOT NULL AND error_fingerprint IS NOT NULL) OR (status NOT IN ('retry_wait','failed') AND next_retry_at IS NULL AND error_code IS NULL AND error_fingerprint IS NULL)),
  CONSTRAINT tenant_deletion_jobs_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT tenant_deletion_jobs_unique_idempotency UNIQUE (tenant_id, operation, scope_selector_hash, idempotency_key_hash)
);

CREATE INDEX IF NOT EXISTS idx_tenant_deletion_jobs_tenant_history ON tenant_deletion_jobs(tenant_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_tenant_deletion_jobs_queue ON tenant_deletion_jobs(tenant_id, status, next_retry_at, created_at);
CREATE INDEX IF NOT EXISTS idx_tenant_deletion_jobs_lease ON tenant_deletion_jobs(tenant_id, status, lease_expires_at, lease_generation);

CREATE TRIGGER IF NOT EXISTS trg_novatrade_tenant_deletion_jobs_insert_guard
BEFORE INSERT ON tenant_deletion_jobs
FOR EACH ROW BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM tenant_memberships AS membership WHERE membership.tenant_id = NEW.tenant_id AND membership.id = NEW.requested_by_membership_id AND membership.auth_identity_id IS NEW.requested_by_auth_identity_id) THEN RAISE(ABORT, 'requester identity does not match membership') END;
  SELECT CASE WHEN NEW.verified_by_membership_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tenant_memberships AS membership WHERE membership.tenant_id = NEW.tenant_id AND membership.id = NEW.verified_by_membership_id AND membership.auth_identity_id IS NEW.verified_by_auth_identity_id) THEN RAISE(ABORT, 'verifier identity does not match membership') END;
  SELECT CASE WHEN NEW.approved_by_membership_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tenant_memberships AS membership WHERE membership.tenant_id = NEW.tenant_id AND membership.id = NEW.approved_by_membership_id AND membership.auth_identity_id IS NEW.approved_by_auth_identity_id) THEN RAISE(ABORT, 'approver identity does not match membership') END;
  SELECT CASE WHEN NEW.status IS NOT 'requested' OR NEW.verified_by_auth_identity_id IS NOT NULL OR NEW.verified_by_membership_id IS NOT NULL OR NEW.verified_at IS NOT NULL OR NEW.approved_by_auth_identity_id IS NOT NULL OR NEW.approved_by_membership_id IS NOT NULL OR NEW.approved_at IS NOT NULL OR NEW.scheduled_at IS NOT NULL OR NEW.started_at IS NOT NULL OR NEW.primary_deleted_at IS NOT NULL OR NEW.backup_aging_at IS NOT NULL OR NEW.completed_at IS NOT NULL OR NEW.canceled_at IS NOT NULL OR NEW.retry_count <> 0 OR NEW.next_retry_at IS NOT NULL OR NEW.lease_owner_hash IS NOT NULL OR NEW.lease_generation <> 0 OR NEW.lease_acquired_at IS NOT NULL OR NEW.lease_heartbeat_at IS NOT NULL OR NEW.lease_expires_at IS NOT NULL OR NEW.error_code IS NOT NULL OR NEW.error_fingerprint IS NOT NULL OR NEW.backup_expiry_target_at IS NOT NULL OR NEW.freeze_handoff_status IS NOT 'not_started' OR NEW.access_revocation_handoff_status IS NOT 'not_started' THEN RAISE(ABORT, 'deletion jobs must be inserted in the requested state') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_novatrade_tenant_deletion_jobs_clock_on_insert
AFTER INSERT ON tenant_deletion_jobs
FOR EACH ROW
BEGIN
  UPDATE tenant_deletion_jobs
  SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE id = NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS trg_novatrade_tenant_deletion_jobs_touch_updated_at
AFTER UPDATE ON tenant_deletion_jobs
FOR EACH ROW
WHEN NEW.updated_at IS NOT strftime('%Y-%m-%dT%H:%M:%fZ','now')
BEGIN
  UPDATE tenant_deletion_jobs SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS tenant_deletion_checkpoints (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id NOT GLOB '*[^0-9A-Fa-f-]*'),
  job_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL CHECK (length(tenant_id) = 36 AND tenant_id NOT GLOB '*[^0-9A-Fa-f-]*'),
  workspace_id TEXT,
  store_class TEXT NOT NULL CHECK (store_class IN ('cache_idempotency','search_embeddings','queues_leases','agent_context','extracted_derivatives_previews_scanner','object_quarantine_storage','primary_database_negative_verification','provider_external_copy_requests','logs_telemetry_aggregates','backup_aging')),
  required INTEGER NOT NULL DEFAULT 1 CHECK (required IN (0,1) AND required = 1),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','complete','retryable','failed','held','exempted')),
  attempt INTEGER NOT NULL DEFAULT 0 CHECK (attempt BETWEEN 0 AND 10),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 0 AND 10),
  lease_owner_hash TEXT CHECK (lease_owner_hash IS NULL OR (length(lease_owner_hash) = 64 AND lease_owner_hash NOT GLOB '*[^0-9a-f]*')),
  lease_generation INTEGER NOT NULL DEFAULT 0 CHECK (lease_generation BETWEEN 0 AND 2147483647),
  lease_acquired_at TEXT,
  lease_heartbeat_at TEXT,
  lease_expires_at TEXT,
  opaque_target_hash TEXT NOT NULL CHECK (length(opaque_target_hash) = 64 AND opaque_target_hash NOT GLOB '*[^0-9a-f]*'),
  receipt_hash TEXT CHECK (receipt_hash IS NULL OR (length(receipt_hash) = 64 AND receipt_hash NOT GLOB '*[^0-9a-f]*')),
  provider_operation_hash TEXT CHECK (provider_operation_hash IS NULL OR (length(provider_operation_hash) = 64 AND provider_operation_hash NOT GLOB '*[^0-9a-f]*')),
  exemption_reason TEXT CHECK (exemption_reason IS NULL OR exemption_reason IN ('legal_hold_covered','not_applicable_by_policy','no_provider_copy_evidenced','backup_retention_only')),
  exemption_approved INTEGER NOT NULL DEFAULT 0 CHECK (exemption_approved IN (0,1)),
  observed_count INTEGER CHECK (observed_count IS NULL OR observed_count >= 0),
  expected_count INTEGER CHECK (expected_count IS NULL OR expected_count >= 0),
  reason_code TEXT CHECK (reason_code IS NULL OR reason_code IN ('LEGAL_HOLD')),
  error_code TEXT CHECK (error_code IS NULL OR error_code IN ('DELETE_CHECKPOINT_RETRYABLE','DELETE_CHECKPOINT_FAILED','DELETE_PROVIDER_RESPONSE_INVALID','DELETE_TIMEOUT','DELETE_INTERNAL')),
  error_fingerprint TEXT CHECK (error_fingerprint IS NULL OR (length(error_fingerprint) = 64 AND error_fingerprint NOT GLOB '*[^0-9a-f]*')),
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT tenant_deletion_checkpoints_job_fkey FOREIGN KEY (tenant_id, job_id) REFERENCES tenant_deletion_jobs(tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT tenant_deletion_checkpoints_workspace_fkey FOREIGN KEY (tenant_id, workspace_id) REFERENCES workspaces(tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT tenant_deletion_checkpoints_status_shape_chk CHECK ((status = 'pending' AND started_at IS NULL AND completed_at IS NULL AND receipt_hash IS NULL AND exemption_reason IS NULL AND exemption_approved = 0 AND reason_code IS NULL AND error_code IS NULL AND error_fingerprint IS NULL) OR (status = 'running' AND started_at IS NOT NULL AND completed_at IS NULL AND receipt_hash IS NULL AND exemption_reason IS NULL AND exemption_approved = 0 AND reason_code IS NULL AND error_code IS NULL AND error_fingerprint IS NULL) OR (status = 'retryable' AND started_at IS NOT NULL AND completed_at IS NULL AND receipt_hash IS NULL AND exemption_reason IS NULL AND exemption_approved = 0 AND reason_code IS NULL AND error_code = 'DELETE_CHECKPOINT_RETRYABLE' AND error_fingerprint IS NOT NULL) OR (status = 'failed' AND started_at IS NOT NULL AND completed_at IS NULL AND receipt_hash IS NULL AND exemption_reason IS NULL AND exemption_approved = 0 AND reason_code IS NULL AND error_code IS NOT NULL AND error_fingerprint IS NOT NULL) OR (status = 'held' AND started_at IS NULL AND completed_at IS NULL AND receipt_hash IS NULL AND exemption_reason IS NULL AND exemption_approved = 0 AND reason_code = 'LEGAL_HOLD' AND error_code IS NULL AND error_fingerprint IS NULL) OR (status = 'complete' AND started_at IS NOT NULL AND completed_at IS NOT NULL AND receipt_hash IS NOT NULL AND exemption_reason IS NULL AND exemption_approved = 0 AND reason_code IS NULL AND error_code IS NULL AND error_fingerprint IS NULL) OR (status = 'exempted' AND started_at IS NOT NULL AND completed_at IS NOT NULL AND receipt_hash IS NULL AND exemption_reason IS NOT NULL AND exemption_approved = 1 AND reason_code IS NULL AND error_code IS NULL AND error_fingerprint IS NULL)),
  CONSTRAINT tenant_deletion_checkpoints_timestamp_shape_chk CHECK ((started_at IS NULL OR (length(started_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', started_at) = started_at)) AND (completed_at IS NULL OR (length(completed_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', completed_at) = completed_at)) AND (lease_acquired_at IS NULL OR (length(lease_acquired_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', lease_acquired_at) = lease_acquired_at)) AND (lease_heartbeat_at IS NULL OR (length(lease_heartbeat_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', lease_heartbeat_at) = lease_heartbeat_at)) AND (lease_expires_at IS NULL OR (length(lease_expires_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', lease_expires_at) = lease_expires_at)) AND length(updated_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', updated_at) = updated_at),
  CONSTRAINT tenant_deletion_checkpoints_exemption_shape_chk CHECK ((status = 'exempted') = (exemption_reason IS NOT NULL AND exemption_approved = 1)),
  CONSTRAINT tenant_deletion_checkpoints_exemption_store_chk CHECK (exemption_reason IS NULL OR (store_class = 'backup_aging' AND exemption_reason = 'backup_retention_only') OR (store_class = 'provider_external_copy_requests' AND exemption_reason = 'no_provider_copy_evidenced') OR (exemption_reason IN ('legal_hold_covered','not_applicable_by_policy') AND store_class <> 'backup_aging')),
  CONSTRAINT tenant_deletion_checkpoints_lease_shape_chk CHECK ((lease_owner_hash IS NULL AND ((lease_acquired_at IS NULL AND lease_heartbeat_at IS NULL AND lease_expires_at IS NULL) OR (lease_acquired_at IS NOT NULL AND lease_heartbeat_at IS NOT NULL AND lease_expires_at IS NOT NULL AND lease_acquired_at <= lease_heartbeat_at AND lease_heartbeat_at < lease_expires_at AND julianday(lease_expires_at) - julianday(lease_heartbeat_at) <= 900)) OR (status = 'running' AND lease_owner_hash IS NOT NULL AND lease_acquired_at IS NOT NULL AND lease_heartbeat_at IS NOT NULL AND lease_expires_at IS NOT NULL AND lease_acquired_at <= lease_heartbeat_at AND lease_heartbeat_at < lease_expires_at AND julianday(lease_expires_at) - julianday(lease_heartbeat_at) <= 900))),
  CONSTRAINT tenant_deletion_checkpoints_timestamp_order_chk CHECK (completed_at IS NULL OR (started_at IS NOT NULL AND completed_at >= started_at)),
  CONSTRAINT tenant_deletion_checkpoints_attempt_shape_chk CHECK (attempt <= max_attempts),
  CONSTRAINT tenant_deletion_checkpoints_tenant_id_job_id_id_unique UNIQUE (tenant_id, job_id, id),
  CONSTRAINT tenant_deletion_checkpoints_unique_store UNIQUE (job_id, store_class)
);

CREATE INDEX IF NOT EXISTS idx_tenant_deletion_checkpoints_queue ON tenant_deletion_checkpoints(tenant_id, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_tenant_deletion_checkpoints_job ON tenant_deletion_checkpoints(tenant_id, job_id, store_class);

CREATE TABLE IF NOT EXISTS tenant_deletion_checkpoint_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  checkpoint_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  job_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','running','complete','retryable','failed','held','exempted')),
  attempt INTEGER NOT NULL CHECK (attempt BETWEEN 0 AND 10),
  lease_generation INTEGER NOT NULL CHECK (lease_generation BETWEEN 0 AND 2147483647),
  receipt_hash TEXT CHECK (receipt_hash IS NULL OR (length(receipt_hash) = 64 AND receipt_hash NOT GLOB '*[^0-9a-f]*')),
  reason_code TEXT CHECK (reason_code IS NULL OR reason_code IN ('LEGAL_HOLD')),
  occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT tenant_deletion_checkpoint_events_job_fkey FOREIGN KEY (tenant_id, job_id) REFERENCES tenant_deletion_jobs(tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT tenant_deletion_checkpoint_events_checkpoint_fkey FOREIGN KEY (tenant_id, job_id, checkpoint_id) REFERENCES tenant_deletion_checkpoints(tenant_id, job_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT tenant_deletion_checkpoint_events_duplicate_guard UNIQUE (checkpoint_id, attempt, lease_generation, status),
  CONSTRAINT tenant_deletion_checkpoint_events_timestamp_shape_chk CHECK (length(occurred_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', occurred_at) = occurred_at)
);
CREATE INDEX IF NOT EXISTS idx_tenant_deletion_checkpoint_events_history ON tenant_deletion_checkpoint_events(tenant_id, job_id, checkpoint_id, occurred_at, id);
CREATE TRIGGER IF NOT EXISTS trg_novatrade_tenant_deletion_checkpoint_events_insert_guard
BEFORE INSERT ON tenant_deletion_checkpoint_events
FOR EACH ROW BEGIN
  SELECT CASE WHEN NEW.occurred_at IS NOT strftime('%Y-%m-%dT%H:%M:%fZ','now') THEN RAISE(ABORT, 'deletion event timestamp must use the database clock') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM tenant_deletion_checkpoints AS checkpoint WHERE checkpoint.id = NEW.checkpoint_id AND checkpoint.tenant_id = NEW.tenant_id AND checkpoint.job_id = NEW.job_id AND checkpoint.status = NEW.status AND checkpoint.attempt = NEW.attempt AND checkpoint.lease_generation = NEW.lease_generation AND checkpoint.receipt_hash IS NEW.receipt_hash AND checkpoint.reason_code IS NEW.reason_code) THEN RAISE(ABORT, 'deletion event facts do not match the current checkpoint') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_novatrade_tenant_deletion_checkpoints_touch_updated_at
AFTER INSERT ON tenant_deletion_checkpoints
FOR EACH ROW
BEGIN
  UPDATE tenant_deletion_checkpoints SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS trg_novatrade_tenant_deletion_checkpoints_touch_updated_at_update
AFTER UPDATE ON tenant_deletion_checkpoints
FOR EACH ROW
WHEN NEW.updated_at IS NOT strftime('%Y-%m-%dT%H:%M:%fZ','now')
BEGIN
  UPDATE tenant_deletion_checkpoints SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS tenant_deletion_tombstones (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36 AND id NOT GLOB '*[^0-9A-Fa-f-]*'),
  job_id TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT,
  scope_selector_hash TEXT NOT NULL CHECK (length(scope_selector_hash) = 64 AND scope_selector_hash NOT GLOB '*[^0-9a-f]*'),
  tenant_identity_hash TEXT NOT NULL CHECK (length(tenant_identity_hash) = 64 AND tenant_identity_hash NOT GLOB '*[^0-9a-f]*'),
  policy_version TEXT NOT NULL CHECK (length(policy_version) BETWEEN 5 AND 128 AND policy_version NOT GLOB '*[^A-Za-z0-9._-]*'),
  retention_until TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT tenant_deletion_tombstones_job_fkey FOREIGN KEY (tenant_id, job_id) REFERENCES tenant_deletion_jobs(tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT tenant_deletion_tombstones_workspace_fkey FOREIGN KEY (tenant_id, workspace_id) REFERENCES workspaces(tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT tenant_deletion_tombstones_retention_chk CHECK (julianday(retention_until) >= julianday(created_at, '+7 years') AND length(retention_until) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', retention_until) = retention_until AND length(created_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', created_at) = created_at)
);

CREATE TRIGGER IF NOT EXISTS trg_novatrade_tenant_deletion_jobs_guard
BEFORE UPDATE ON tenant_deletion_jobs
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM tenant_memberships AS membership WHERE membership.tenant_id = NEW.tenant_id AND membership.id = NEW.requested_by_membership_id AND membership.auth_identity_id IS NEW.requested_by_auth_identity_id) THEN RAISE(ABORT, 'requester identity does not match membership') END;
  SELECT CASE WHEN NEW.verified_by_membership_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tenant_memberships AS membership WHERE membership.tenant_id = NEW.tenant_id AND membership.id = NEW.verified_by_membership_id AND membership.auth_identity_id IS NEW.verified_by_auth_identity_id) THEN RAISE(ABORT, 'verifier identity does not match membership') END;
  SELECT CASE WHEN NEW.approved_by_membership_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tenant_memberships AS membership WHERE membership.tenant_id = NEW.tenant_id AND membership.id = NEW.approved_by_membership_id AND membership.auth_identity_id IS NEW.approved_by_auth_identity_id) THEN RAISE(ABORT, 'approver identity does not match membership') END;
  SELECT CASE WHEN NEW.id IS NOT OLD.id OR NEW.tenant_id IS NOT OLD.tenant_id OR NEW.workspace_id IS NOT OLD.workspace_id OR NEW.operation IS NOT OLD.operation OR NEW.scope_kind IS NOT OLD.scope_kind OR NEW.scope_selector_hash IS NOT OLD.scope_selector_hash OR NEW.requested_by_auth_identity_id IS NOT OLD.requested_by_auth_identity_id OR NEW.requested_by_membership_id IS NOT OLD.requested_by_membership_id OR NEW.policy_version IS NOT OLD.policy_version OR NEW.policy_snapshot_hash IS NOT OLD.policy_snapshot_hash OR NEW.input_hash IS NOT OLD.input_hash OR NEW.idempotency_key_hash IS NOT OLD.idempotency_key_hash OR NEW.max_retries IS NOT OLD.max_retries OR (NEW.created_at IS NOT OLD.created_at AND NOT (OLD.created_at IS OLD.updated_at AND NEW.created_at IS NEW.updated_at AND NEW.created_at IS strftime('%Y-%m-%dT%H:%M:%fZ','now'))) OR NEW.correlation_id IS NOT OLD.correlation_id OR NEW.audit_event_id IS NOT OLD.audit_event_id THEN RAISE(ABORT, 'deletion job identity and request facts are immutable') END;
  SELECT CASE WHEN NOT (OLD.status IS NEW.status OR (OLD.status = 'requested' AND NEW.status IN ('verified','canceled')) OR (OLD.status = 'verified' AND NEW.status IN ('scheduled','canceled')) OR (OLD.status = 'scheduled' AND NEW.status IN ('running','canceled')) OR (OLD.status = 'running' AND NEW.status IN ('retry_wait','failed','primary_deleted')) OR (OLD.status = 'retry_wait' AND NEW.status IN ('running','failed')) OR (OLD.status = 'failed' AND NEW.status = 'retry_wait') OR (OLD.status = 'primary_deleted' AND NEW.status = 'backup_aging') OR (OLD.status = 'backup_aging' AND NEW.status = 'completed')) THEN RAISE(ABORT, 'deletion job state transition is invalid') END;
  SELECT CASE WHEN NEW.status = 'canceled' AND (NEW.freeze_handoff_status <> 'not_started' OR NEW.access_revocation_handoff_status <> 'not_started' OR EXISTS (SELECT 1 FROM tenant_deletion_checkpoints WHERE job_id = NEW.id AND status <> 'pending')) THEN RAISE(ABORT, 'deletion cancellation window is closed') END;
  SELECT CASE WHEN NEW.status = 'canceled' AND (NEW.started_at IS NOT NULL OR NEW.primary_deleted_at IS NOT NULL OR NEW.backup_aging_at IS NOT NULL OR NEW.completed_at IS NOT NULL OR (OLD.status = 'requested' AND (NEW.verified_at IS NOT NULL OR NEW.approved_at IS NOT NULL OR NEW.scheduled_at IS NOT NULL)) OR (OLD.status = 'verified' AND (NEW.approved_at IS NOT NULL OR NEW.scheduled_at IS NOT NULL))) THEN RAISE(ABORT, 'canceled job contains later truth') END;
  SELECT CASE WHEN (NEW.verified_by_auth_identity_id IS NOT OLD.verified_by_auth_identity_id OR NEW.verified_by_membership_id IS NOT OLD.verified_by_membership_id OR NEW.verified_at IS NOT OLD.verified_at) AND NOT (OLD.status IS 'requested' AND NEW.status IS 'verified') THEN RAISE(ABORT, 'verification attribution is immutable') END;
  SELECT CASE WHEN (NEW.approved_by_auth_identity_id IS NOT OLD.approved_by_auth_identity_id OR NEW.approved_by_membership_id IS NOT OLD.approved_by_membership_id OR NEW.approved_at IS NOT OLD.approved_at) AND NOT (OLD.status IS 'verified' AND NEW.status IS 'scheduled') THEN RAISE(ABORT, 'approval attribution is immutable') END;
  SELECT CASE WHEN NEW.scheduled_at IS NOT OLD.scheduled_at AND NOT (OLD.status IS 'verified' AND NEW.status IS 'scheduled') THEN RAISE(ABORT, 'schedule timestamp is immutable') END;
  SELECT CASE WHEN NEW.started_at IS NOT OLD.started_at AND NOT (OLD.status IS 'scheduled' AND NEW.status IS 'running') THEN RAISE(ABORT, 'start timestamp is immutable') END;
  SELECT CASE WHEN NEW.primary_deleted_at IS NOT OLD.primary_deleted_at AND NOT (OLD.status IS 'running' AND NEW.status IS 'primary_deleted') THEN RAISE(ABORT, 'primary deletion timestamp is immutable') END;
  SELECT CASE WHEN NEW.backup_expiry_target_at IS NOT OLD.backup_expiry_target_at AND NOT (OLD.status IS 'running' AND NEW.status IS 'primary_deleted') THEN RAISE(ABORT, 'backup aging target is immutable') END;
  SELECT CASE WHEN NEW.backup_aging_at IS NOT OLD.backup_aging_at AND NOT (OLD.status IS 'primary_deleted' AND NEW.status IS 'backup_aging') THEN RAISE(ABORT, 'backup aging timestamp is immutable') END;
  SELECT CASE WHEN NEW.completed_at IS NOT OLD.completed_at AND NOT (OLD.status IS 'backup_aging' AND NEW.status IS 'completed') THEN RAISE(ABORT, 'completion timestamp is immutable') END;
  SELECT CASE WHEN NEW.canceled_at IS NOT OLD.canceled_at AND NOT (NEW.status IS 'canceled' AND OLD.status IN ('requested','verified','scheduled')) THEN RAISE(ABORT, 'cancellation timestamp is immutable') END;
  SELECT CASE WHEN OLD.status IS NEW.status AND (NEW.retry_count IS NOT OLD.retry_count OR NEW.next_retry_at IS NOT OLD.next_retry_at OR NEW.error_code IS NOT OLD.error_code OR NEW.error_fingerprint IS NOT OLD.error_fingerprint) THEN RAISE(ABORT, 'same-state retry facts are immutable') END;
  SELECT CASE WHEN NOT (OLD.freeze_handoff_status IS NEW.freeze_handoff_status OR (OLD.freeze_handoff_status = 'not_started' AND NEW.freeze_handoff_status IN ('requested','failed')) OR (OLD.freeze_handoff_status = 'requested' AND NEW.freeze_handoff_status IN ('requested','acknowledged','failed')) OR (OLD.freeze_handoff_status = 'acknowledged' AND NEW.freeze_handoff_status = 'acknowledged') OR (OLD.freeze_handoff_status = 'failed' AND NEW.freeze_handoff_status IN ('failed','requested'))) THEN RAISE(ABORT, 'freeze handoff transition is invalid') END;
  SELECT CASE WHEN NOT (OLD.access_revocation_handoff_status IS NEW.access_revocation_handoff_status OR (OLD.access_revocation_handoff_status = 'not_started' AND NEW.access_revocation_handoff_status IN ('requested','failed')) OR (OLD.access_revocation_handoff_status = 'requested' AND NEW.access_revocation_handoff_status IN ('requested','acknowledged','failed')) OR (OLD.access_revocation_handoff_status = 'acknowledged' AND NEW.access_revocation_handoff_status = 'acknowledged') OR (OLD.access_revocation_handoff_status = 'failed' AND NEW.access_revocation_handoff_status IN ('failed','requested'))) THEN RAISE(ABORT, 'access revocation handoff transition is invalid') END;
  SELECT CASE WHEN OLD.legal_hold_status IS NEW.legal_hold_status AND (OLD.legal_hold_snapshot_hash IS NOT NEW.legal_hold_snapshot_hash OR OLD.held_scope_hash IS NOT NEW.held_scope_hash OR OLD.uncovered_scope_hash IS NOT NEW.uncovered_scope_hash) THEN RAISE(ABORT, 'same legal hold status cannot rewrite its reviewed snapshot') END;
  SELECT CASE WHEN OLD.legal_hold_status IS 'active_subset' AND NEW.legal_hold_status IS 'released' AND (OLD.legal_hold_snapshot_hash IS NOT NEW.legal_hold_snapshot_hash OR OLD.held_scope_hash IS NOT NEW.held_scope_hash OR OLD.uncovered_scope_hash IS NOT NEW.uncovered_scope_hash) THEN RAISE(ABORT, 'legal hold release must preserve its reviewed snapshot') END;
  SELECT CASE WHEN NOT (OLD.legal_hold_status IS NEW.legal_hold_status OR (OLD.legal_hold_status = 'none' AND NEW.legal_hold_status IN ('active_subset','unresolved')) OR (OLD.legal_hold_status = 'active_subset' AND NEW.legal_hold_status IN ('released','unresolved')) OR (OLD.legal_hold_status = 'unresolved' AND NEW.legal_hold_status = 'unresolved') OR (OLD.legal_hold_status = 'unresolved' AND NEW.legal_hold_status = 'active_subset' AND NEW.legal_hold_snapshot_hash IS NOT OLD.legal_hold_snapshot_hash) OR (OLD.legal_hold_status = 'released' AND NEW.legal_hold_status = 'released') OR (OLD.legal_hold_status = 'released' AND NEW.legal_hold_status = 'active_subset' AND NEW.legal_hold_snapshot_hash IS NOT OLD.legal_hold_snapshot_hash)) THEN RAISE(ABORT, 'legal hold transition is invalid') END;
  SELECT CASE WHEN NEW.lease_generation < OLD.lease_generation OR NEW.lease_generation > OLD.lease_generation + 1 THEN RAISE(ABORT, 'deletion lease generation is stale or skipped') END;
  SELECT CASE WHEN NEW.lease_generation = OLD.lease_generation AND OLD.lease_owner_hash IS NULL AND NEW.lease_owner_hash IS NOT NULL THEN RAISE(ABORT, 'deletion lease acquisition requires a new generation') END;
  SELECT CASE WHEN NEW.lease_generation = OLD.lease_generation + 1 AND (NEW.lease_owner_hash IS NULL OR NEW.lease_acquired_at IS NULL OR NEW.lease_heartbeat_at IS NULL OR NEW.lease_expires_at IS NULL OR (OLD.lease_owner_hash IS NOT NULL AND NEW.lease_owner_hash IS OLD.lease_owner_hash) OR (OLD.lease_owner_hash IS NOT NULL AND NEW.lease_acquired_at < OLD.lease_expires_at)) THEN RAISE(ABORT, 'deletion lease generation must fence an acquisition after expiry') END;
  SELECT CASE WHEN NEW.lease_generation = OLD.lease_generation AND OLD.lease_owner_hash IS NOT NULL AND NEW.lease_owner_hash IS NOT NULL AND NEW.lease_owner_hash IS NOT OLD.lease_owner_hash THEN RAISE(ABORT, 'deletion lease owner cannot change within a generation') END;
  SELECT CASE WHEN NEW.lease_generation = OLD.lease_generation AND NEW.lease_acquired_at IS NOT OLD.lease_acquired_at THEN RAISE(ABORT, 'deletion lease acquisition time cannot change within a generation') END;
  SELECT CASE WHEN NEW.lease_generation = OLD.lease_generation AND OLD.lease_owner_hash IS NOT NULL AND NEW.lease_heartbeat_at < OLD.lease_heartbeat_at THEN RAISE(ABORT, 'deletion lease heartbeat cannot move backward') END;
  SELECT CASE WHEN NEW.lease_generation = OLD.lease_generation AND OLD.lease_owner_hash IS NOT NULL AND NEW.lease_expires_at < OLD.lease_expires_at THEN RAISE(ABORT, 'deletion lease expiry cannot move backward') END;
  SELECT CASE WHEN OLD.status IS NOT 'retry_wait' AND NEW.status = 'retry_wait' AND (NEW.retry_count <> OLD.retry_count + 1 OR NEW.retry_count > NEW.max_retries) THEN RAISE(ABORT, 'deletion retry bound or increment is invalid') END;
  SELECT CASE WHEN OLD.status = 'retry_wait' AND NEW.status IS NOT 'retry_wait' AND NEW.retry_count IS NOT OLD.retry_count THEN RAISE(ABORT, 'deletion retry count is immutable outside retry entry') END;
  SELECT CASE WHEN NEW.status IN ('running','retry_wait','failed','primary_deleted','backup_aging','completed') AND ((SELECT count(*) FROM tenant_deletion_checkpoints WHERE job_id = NEW.id) <> 10 OR EXISTS (SELECT 1 FROM tenant_deletion_checkpoints WHERE job_id = NEW.id AND store_class NOT IN ('cache_idempotency','search_embeddings','queues_leases','agent_context','extracted_derivatives_previews_scanner','object_quarantine_storage','primary_database_negative_verification','provider_external_copy_requests','logs_telemetry_aggregates','backup_aging'))) THEN RAISE(ABORT, 'exact deletion checkpoint store set is required before execution') END;
  SELECT CASE WHEN NEW.status IN ('running','retry_wait','failed','primary_deleted','backup_aging','completed') AND EXISTS (SELECT 1 FROM tenant_deletion_checkpoints WHERE job_id = NEW.id AND store_class NOT IN ('cache_idempotency','search_embeddings','queues_leases','agent_context','extracted_derivatives_previews_scanner','object_quarantine_storage','primary_database_negative_verification','provider_external_copy_requests','logs_telemetry_aggregates','backup_aging')) THEN RAISE(ABORT, 'unknown deletion checkpoint store') END;
  SELECT CASE WHEN NEW.status IN ('primary_deleted','backup_aging','completed') AND EXISTS (SELECT 1 FROM tenant_deletion_checkpoints WHERE job_id = NEW.id AND required = 1 AND store_class <> 'backup_aging' AND NOT (status = 'complete' OR (status = 'exempted' AND exemption_approved = 1))) THEN RAISE(ABORT, 'primary deletion requires every required primary checkpoint') END;
  SELECT CASE WHEN NEW.status = 'completed' AND EXISTS (SELECT 1 FROM tenant_deletion_checkpoints WHERE job_id = NEW.id AND required = 1 AND NOT (status = 'complete' OR (status = 'exempted' AND exemption_approved = 1 AND (store_class <> 'backup_aging' OR exemption_reason = 'backup_retention_only')))) THEN RAISE(ABORT, 'completion requires every required checkpoint') END;
  SELECT CASE WHEN NEW.status = 'completed' AND NOT EXISTS (SELECT 1 FROM tenant_deletion_tombstones WHERE job_id = NEW.id) THEN RAISE(ABORT, 'completion requires a content-minimized tombstone') END;
  SELECT CASE WHEN NEW.legal_hold_status = 'unresolved' AND NEW.status IS NOT 'requested' THEN RAISE(ABORT, 'unresolved legal hold blocks deletion execution') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_novatrade_tenant_deletion_checkpoints_guard
BEFORE UPDATE ON tenant_deletion_checkpoints
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NEW.id IS NOT OLD.id OR NEW.job_id IS NOT OLD.job_id OR NEW.tenant_id IS NOT OLD.tenant_id OR NEW.workspace_id IS NOT OLD.workspace_id OR NEW.store_class IS NOT OLD.store_class OR NEW.required IS NOT OLD.required OR NEW.opaque_target_hash IS NOT OLD.opaque_target_hash OR NEW.max_attempts IS NOT OLD.max_attempts THEN RAISE(ABORT, 'deletion checkpoint identity and retry facts are immutable') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM tenant_deletion_jobs AS job WHERE job.id = NEW.job_id AND job.tenant_id = NEW.tenant_id AND job.workspace_id IS NEW.workspace_id) THEN RAISE(ABORT, 'deletion checkpoint workspace does not match its job') END;
  SELECT CASE WHEN NEW.exemption_reason = 'legal_hold_covered' AND NOT EXISTS (SELECT 1 FROM tenant_deletion_jobs AS job WHERE job.id = NEW.job_id AND job.legal_hold_status IN ('active_subset','released')) THEN RAISE(ABORT, 'legal hold exemption requires a reviewed hold snapshot') END;
  SELECT CASE WHEN NOT (OLD.status IS NEW.status OR (OLD.status = 'pending' AND NEW.status IN ('running','held','exempted')) OR (OLD.status = 'running' AND NEW.status IN ('complete','retryable','failed','held','exempted')) OR (OLD.status = 'retryable' AND NEW.status IN ('running','failed')) OR (OLD.status = 'held' AND NEW.status = 'pending') OR (OLD.status = 'failed' AND NEW.status = 'retryable')) THEN RAISE(ABORT, 'deletion checkpoint state transition is invalid') END;
  SELECT CASE WHEN NEW.attempt IS NOT OLD.attempt AND NOT (NEW.status = 'retryable' AND OLD.status IN ('running','failed') AND NEW.attempt = OLD.attempt + 1) THEN RAISE(ABORT, 'deletion checkpoint attempt is stale or skipped') END;
  SELECT CASE WHEN NEW.lease_generation < OLD.lease_generation OR NEW.lease_generation > OLD.lease_generation + 1 THEN RAISE(ABORT, 'deletion checkpoint lease generation is stale or skipped') END;
  SELECT CASE WHEN NEW.lease_generation = OLD.lease_generation AND OLD.lease_owner_hash IS NULL AND NEW.lease_owner_hash IS NOT NULL THEN RAISE(ABORT, 'deletion checkpoint lease acquisition requires a new generation') END;
  SELECT CASE WHEN OLD.status IN ('complete','exempted') AND (NEW.status IS NOT OLD.status OR NEW.attempt IS NOT OLD.attempt OR NEW.lease_generation IS NOT OLD.lease_generation OR NEW.lease_owner_hash IS NOT OLD.lease_owner_hash OR NEW.started_at IS NOT OLD.started_at OR NEW.completed_at IS NOT OLD.completed_at OR NEW.receipt_hash IS NOT OLD.receipt_hash OR NEW.provider_operation_hash IS NOT OLD.provider_operation_hash OR NEW.exemption_reason IS NOT OLD.exemption_reason OR NEW.exemption_approved IS NOT OLD.exemption_approved OR NEW.observed_count IS NOT OLD.observed_count OR NEW.expected_count IS NOT OLD.expected_count OR NEW.reason_code IS NOT OLD.reason_code OR NEW.error_code IS NOT OLD.error_code OR NEW.error_fingerprint IS NOT OLD.error_fingerprint) THEN RAISE(ABORT, 'finalized deletion checkpoint facts are immutable') END;
  SELECT CASE WHEN NEW.lease_generation = OLD.lease_generation + 1 AND (NEW.lease_owner_hash IS NULL OR NEW.lease_acquired_at IS NULL OR NEW.lease_heartbeat_at IS NULL OR NEW.lease_expires_at IS NULL OR (OLD.lease_owner_hash IS NOT NULL AND NEW.lease_owner_hash IS OLD.lease_owner_hash) OR (OLD.lease_owner_hash IS NOT NULL AND NEW.lease_acquired_at < OLD.lease_expires_at)) THEN RAISE(ABORT, 'deletion checkpoint lease generation must fence an acquisition after expiry') END;
  SELECT CASE WHEN NEW.lease_generation = OLD.lease_generation AND OLD.lease_owner_hash IS NOT NULL AND NEW.lease_owner_hash IS NOT NULL AND NEW.lease_owner_hash IS NOT OLD.lease_owner_hash THEN RAISE(ABORT, 'deletion checkpoint lease owner cannot change within a generation') END;
  SELECT CASE WHEN NEW.lease_generation = OLD.lease_generation AND NEW.lease_acquired_at IS NOT OLD.lease_acquired_at THEN RAISE(ABORT, 'deletion checkpoint lease acquisition time cannot change within a generation') END;
  SELECT CASE WHEN NEW.lease_generation = OLD.lease_generation AND OLD.lease_owner_hash IS NOT NULL AND NEW.lease_heartbeat_at < OLD.lease_heartbeat_at THEN RAISE(ABORT, 'deletion checkpoint lease heartbeat cannot move backward') END;
  SELECT CASE WHEN NEW.lease_generation = OLD.lease_generation AND OLD.lease_owner_hash IS NOT NULL AND NEW.lease_expires_at < OLD.lease_expires_at THEN RAISE(ABORT, 'deletion checkpoint lease expiry cannot move backward') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_novatrade_tenant_deletion_checkpoints_insert_guard
BEFORE INSERT ON tenant_deletion_checkpoints
FOR EACH ROW BEGIN
  SELECT CASE WHEN NEW.status IS NOT 'pending' OR NEW.attempt <> 0 OR NEW.lease_owner_hash IS NOT NULL OR NEW.lease_generation <> 0 OR NEW.lease_acquired_at IS NOT NULL OR NEW.lease_heartbeat_at IS NOT NULL OR NEW.lease_expires_at IS NOT NULL OR NEW.receipt_hash IS NOT NULL OR NEW.provider_operation_hash IS NOT NULL OR NEW.exemption_reason IS NOT NULL OR NEW.exemption_approved <> 0 OR NEW.observed_count IS NOT NULL OR NEW.expected_count IS NOT NULL OR NEW.reason_code IS NOT NULL OR NEW.error_code IS NOT NULL OR NEW.error_fingerprint IS NOT NULL OR NEW.started_at IS NOT NULL OR NEW.completed_at IS NOT NULL THEN RAISE(ABORT, 'deletion checkpoints must be inserted in the pending state') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM tenant_deletion_jobs AS job WHERE job.id = NEW.job_id AND job.tenant_id = NEW.tenant_id AND job.workspace_id IS NEW.workspace_id) THEN RAISE(ABORT, 'deletion checkpoint workspace does not match its job') END;
  SELECT CASE WHEN NEW.exemption_reason = 'legal_hold_covered' AND NOT EXISTS (SELECT 1 FROM tenant_deletion_jobs AS job WHERE job.id = NEW.job_id AND job.legal_hold_status IN ('active_subset','released')) THEN RAISE(ABORT, 'legal hold exemption requires a reviewed hold snapshot') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_novatrade_tenant_deletion_checkpoints_no_delete
BEFORE DELETE ON tenant_deletion_checkpoints FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'current deletion checkpoints are append-only receipts'); END;

CREATE TRIGGER IF NOT EXISTS trg_novatrade_tenant_deletion_jobs_no_delete
BEFORE DELETE ON tenant_deletion_jobs FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'deletion ledger rows are append-only'); END;
CREATE TRIGGER IF NOT EXISTS trg_novatrade_tenant_deletion_checkpoint_events_no_update
BEFORE UPDATE ON tenant_deletion_checkpoint_events FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'deletion history is append-only'); END;
CREATE TRIGGER IF NOT EXISTS trg_novatrade_tenant_deletion_checkpoint_events_no_delete
BEFORE DELETE ON tenant_deletion_checkpoint_events FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'deletion history is append-only'); END;
CREATE TRIGGER IF NOT EXISTS trg_novatrade_tenant_deletion_tombstones_no_update
BEFORE UPDATE ON tenant_deletion_tombstones FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'deletion tombstones are append-only'); END;
CREATE TRIGGER IF NOT EXISTS trg_novatrade_tenant_deletion_tombstones_no_delete
BEFORE DELETE ON tenant_deletion_tombstones FOR EACH ROW BEGIN SELECT RAISE(ABORT, 'deletion tombstones are append-only'); END;
CREATE TRIGGER IF NOT EXISTS trg_novatrade_tenant_deletion_tombstones_insert_guard
BEFORE INSERT ON tenant_deletion_tombstones FOR EACH ROW BEGIN
  SELECT CASE WHEN NEW.created_at IS NOT strftime('%Y-%m-%dT%H:%M:%fZ','now') THEN RAISE(ABORT, 'tombstone timestamp must use the database clock') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM tenant_deletion_jobs AS job WHERE job.id = NEW.job_id AND job.status IN ('primary_deleted','backup_aging')) THEN RAISE(ABORT, 'tombstone is write-last after primary checkpoints') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM tenant_deletion_jobs AS job WHERE job.id = NEW.job_id AND job.tenant_id = NEW.tenant_id AND job.workspace_id IS NEW.workspace_id) THEN RAISE(ABORT, 'deletion tombstone workspace does not match its job') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM tenant_deletion_jobs AS job WHERE job.id = NEW.job_id AND job.scope_selector_hash = NEW.scope_selector_hash AND job.policy_version = NEW.policy_version) THEN RAISE(ABORT, 'deletion tombstone facts do not match its job') END;
  SELECT CASE WHEN (SELECT count(*) FROM tenant_deletion_checkpoints WHERE job_id = NEW.job_id) <> 10 OR EXISTS (SELECT 1 FROM tenant_deletion_checkpoints WHERE job_id = NEW.job_id AND store_class NOT IN ('cache_idempotency','search_embeddings','queues_leases','agent_context','extracted_derivatives_previews_scanner','object_quarantine_storage','primary_database_negative_verification','provider_external_copy_requests','logs_telemetry_aggregates','backup_aging')) THEN RAISE(ABORT, 'tombstone requires the exact deletion checkpoint store set') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM tenant_deletion_checkpoints WHERE job_id = NEW.job_id AND store_class <> 'backup_aging' AND required = 1 AND NOT (status = 'complete' OR (status = 'exempted' AND exemption_approved = 1))) THEN RAISE(ABORT, 'tombstone requires complete primary checkpoints') END;
END;

CREATE TABLE IF NOT EXISTS zip_codes (
  zip TEXT PRIMARY KEY,
  city TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'CO',
  county TEXT NOT NULL DEFAULT '',
  lat REAL,
  lng REAL,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS location_markets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country_code TEXT NOT NULL,
  admin_area1 TEXT,
  admin_area2 TEXT,
  locality TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS location_cells (
  id TEXT PRIMARY KEY,
  market_id TEXT NOT NULL REFERENCES location_markets(id),
  country_code TEXT NOT NULL,
  admin_area1 TEXT,
  admin_area2 TEXT,
  locality TEXT,
  postal_code TEXT,
  postal_code_normalized TEXT,
  cell_type TEXT NOT NULL,
  cell_label TEXT NOT NULL,
  lat REAL,
  lng REAL,
  radius_meters INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS crawl_runs (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'coverage' CHECK(mode IN ('coverage','manual','refresh')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','paused','blocked','done','error','canceled')),
  categories TEXT NOT NULL DEFAULT '[]',
  market_id TEXT,
  selection_json TEXT,
  name TEXT,
  scope_label TEXT,
  created_by_user_id TEXT,
  started_at TEXT,
  ended_at TEXT,
  discovered_count INTEGER NOT NULL DEFAULT 0,
  enriched_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  api_calls_used INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  blocked_reason TEXT,
  blocked_at TEXT,
  blocked_error_code TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS crawl_units (
  id TEXT PRIMARY KEY,
  crawl_run_id TEXT NOT NULL REFERENCES crawl_runs(id),
  zip TEXT NOT NULL,
  market_id TEXT,
  location_cell_id TEXT,
  country_code TEXT,
  query_location_label TEXT,
  category TEXT NOT NULL,
  keyword TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','retry_wait','done','failed','canceled')),
  next_page_token TEXT,
  max_pages INTEGER NOT NULL DEFAULT 1,
  pages_fetched INTEGER NOT NULL DEFAULT 0,
  raw_places_seen INTEGER NOT NULL DEFAULT 0,
  new_places_seen INTEGER NOT NULL DEFAULT 0,
  duplicate_places_seen INTEGER NOT NULL DEFAULT 0,
  budget_blocked_at TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TEXT,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_error_code TEXT,
  discovered_count INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  finished_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_users (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'researcher' CHECK(role IN ('admin','researcher')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
  created_by TEXT,
  is_team_lead INTEGER NOT NULL DEFAULT 0,
  team_lead_user_id TEXT,
  team_label TEXT,
  last_seen_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_market_access (
  user_id TEXT NOT NULL,
  market_id TEXT NOT NULL REFERENCES location_markets(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by_user_id TEXT,
  PRIMARY KEY (user_id, market_id)
);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  place_id TEXT NOT NULL UNIQUE,
  name TEXT,
  address TEXT,
  phone TEXT,
  categories TEXT NOT NULL DEFAULT '[]',
  rating REAL,
  review_count INTEGER,
  website_uri TEXT,
  website_status TEXT NOT NULL DEFAULT 'none' CHECK(website_status IN ('none','social','basic','custom')),
  maps_uri TEXT,
  business_status TEXT,
  price_level TEXT,
  photo_count INTEGER DEFAULT 0,
  has_opening_hours INTEGER DEFAULT 0,
  primary_type TEXT,
  lat REAL,
  lng REAL,
  market_id TEXT,
  location_cell_id TEXT,
  country_code TEXT,
  admin_area1 TEXT,
  admin_area2 TEXT,
  locality TEXT,
  postal_code TEXT,
  score REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','verified','contacted','preview_sent','meeting_set','closed_won','closed_lost')),
  is_excluded INTEGER NOT NULL DEFAULT 0,
  exclusion_reason TEXT,
  excluded_at TEXT,
  archived_at TEXT,
  archived_by_user_id TEXT,
  archive_reason TEXT,
  selling_niche TEXT,
  qualification_status TEXT NOT NULL DEFAULT 'needs_verification' CHECK(qualification_status IN ('qualified','needs_verification','unqualified','disqualified')),
  disqualification_reason TEXT,
  website_verified_at TEXT,
  contactability_score REAL NOT NULL DEFAULT 0,
  estimated_deal_value REAL NOT NULL DEFAULT 0,
  business_type TEXT DEFAULT 'local_services',
  win_probability_score REAL NOT NULL DEFAULT 0,
  lead_quality_score REAL NOT NULL DEFAULT 0,
  quality_bucket TEXT NOT NULL DEFAULT 'needs_ai_verify',
  easy_build_score REAL NOT NULL DEFAULT 0,
  cash_speed_score REAL NOT NULL DEFAULT 0,
  need_score REAL NOT NULL DEFAULT 0,
  quality_reason TEXT,
  recommended_offer TEXT NOT NULL DEFAULT 'starter_site',
  next_best_action TEXT,
  phone_verification_status TEXT NOT NULL DEFAULT 'unknown',
  last_quality_scored_at TEXT,
  quality_checked_by_user_id TEXT,
  ai_verification_status TEXT NOT NULL DEFAULT 'not_checked' CHECK(ai_verification_status IN ('not_checked','site_found','no_site_found','weak_site_found','uncertain','mismatch','error')),
  ai_confidence REAL NOT NULL DEFAULT 0,
  ai_found_website_url TEXT,
  ai_recommendation TEXT,
  ai_summary TEXT,
  ai_checked_at TEXT,
  ai_website_viability_status TEXT,
  ai_website_health TEXT,
  ai_queue_status TEXT NOT NULL DEFAULT 'not_checked' CHECK(ai_queue_status IN ('not_checked','queued','running','verified','error')),
  ai_attempt_count INTEGER NOT NULL DEFAULT 0,
  ai_last_error TEXT,
  ai_next_retry_at TEXT,
  ai_input_hash TEXT,
  raw_opportunity_score REAL NOT NULL DEFAULT 0,
  verification_score REAL NOT NULL DEFAULT 0,
  sales_priority_score REAL NOT NULL DEFAULT 0,
  pitch_outcome TEXT,
  objection_reason TEXT,
  decision_maker_reached INTEGER NOT NULL DEFAULT 0,
  quoted_amount REAL NOT NULL DEFAULT 0,
  close_value REAL NOT NULL DEFAULT 0,
  demo_sent_at TEXT,
  ai_website_feedback_status TEXT,
  ai_corrected_website_url TEXT,
  ai_false_positive_reason TEXT,
  ai_reviewer_notes TEXT,
  ai_feedback_at TEXT,
  assigned_to_user_id TEXT,
  notes TEXT,
  reminder_date TEXT,
  enrichment_status TEXT NOT NULL DEFAULT 'pending' CHECK(enrichment_status IN ('pending','running','retry_wait','enriched','error','skipped')),
  enrichment_attempt_count INTEGER NOT NULL DEFAULT 0,
  enrichment_started_at TEXT,
  enrichment_finished_at TEXT,
  enrichment_next_retry_at TEXT,
  enrichment_last_error TEXT,
  enrichment_last_error_code TEXT,
  enrichment_max_attempts INTEGER NOT NULL DEFAULT 3,
  enriched_at TEXT,
  review_highlights TEXT,
  editorial_summary TEXT,
  website_health TEXT,
  website_checked_at TEXT,
  verification TEXT NOT NULL DEFAULT '{}',
  discovered_at TEXT NOT NULL DEFAULT (datetime('now')),
  first_contacted_at TEXT,
  first_reply_at TEXT,
  meeting_booked_at TEXT,
  last_contacted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS outreach_events (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id),
  channel TEXT NOT NULL CHECK(channel IN ('call','text','email','walkin','other')),
  actor_user_id TEXT,
  actor_email TEXT,
  contact_person_name TEXT,
  contact_person_role TEXT,
  decision_maker_reached INTEGER NOT NULL DEFAULT 0,
  outcome TEXT NOT NULL DEFAULT 'contacted',
  objection_reason TEXT,
  quoted_amount REAL NOT NULL DEFAULT 0,
  close_value REAL NOT NULL DEFAULT 0,
  follow_up_at TEXT,
  next_step TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admin_requests (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  created_by_user_id TEXT,
  created_by_email TEXT,
  assigned_admin_user_id TEXT,
  request_type TEXT NOT NULL CHECK(request_type IN ('website_request','quote_request')),
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','seen','in_progress','waiting_on_researcher','done','cancelled')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('urgent','normal','low')),
  summary TEXT,
  contact_person_name TEXT,
  budget_hint TEXT,
  due_at TEXT,
  next_step TEXT,
  seen_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS demos (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id),
  slug TEXT NOT NULL UNIQUE,
  template_id TEXT DEFAULT 'default',
  config_json TEXT NOT NULL DEFAULT '{}',
  is_published INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  published_by_user_id TEXT,
  unpublished_at TEXT,
  unpublished_by_user_id TEXT,
  revoked_at TEXT,
  revoked_by_user_id TEXT,
  revoke_reason TEXT,
  view_count INTEGER NOT NULL DEFAULT 0,
  last_viewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  niche_weights TEXT NOT NULL DEFAULT '{}',
  social_hosts TEXT NOT NULL DEFAULT '[]',
  basic_hosts TEXT NOT NULL DEFAULT '[]',
  rate_limit_ms INTEGER NOT NULL DEFAULT 200,
  max_calls_per_day INTEGER NOT NULL DEFAULT 300,
  max_calls_per_run INTEGER NOT NULL DEFAULT 500,
  max_monthly_api_spend REAL NOT NULL DEFAULT 50.0,
  stop_on_budget_limit INTEGER NOT NULL DEFAULT 1,
  search_radius_km REAL NOT NULL DEFAULT 8.0,
  enrichment_enabled INTEGER NOT NULL DEFAULT 1,
  max_enrichment_per_run INTEGER NOT NULL DEFAULT 50,
  website_health_enabled INTEGER NOT NULL DEFAULT 1,
  cache_ttl_days INTEGER NOT NULL DEFAULT 30,
  enrichment_stage_b_min_score REAL NOT NULL DEFAULT 9.0,
  max_atmosphere_enrichment_per_run INTEGER NOT NULL DEFAULT 25,
  cost_engine_v2_enabled INTEGER NOT NULL DEFAULT 1,
  ai_enabled INTEGER NOT NULL DEFAULT 0,
  ai_model TEXT NOT NULL DEFAULT 'gpt-5.4-mini',
  ai_daily_budget_usd REAL NOT NULL DEFAULT 2.0,
  ai_monthly_budget_usd REAL NOT NULL DEFAULT 25.0,
  ai_batch_limit INTEGER NOT NULL DEFAULT 25,
  researcher_ai_daily_run_cap INTEGER NOT NULL DEFAULT 10,
  researcher_ai_daily_budget_usd REAL NOT NULL DEFAULT 2.0,
  researcher_ai_monthly_budget_usd REAL NOT NULL DEFAULT 25.0,
  ai_cache_ttl_days INTEGER NOT NULL DEFAULT 30,
  ai_manual_apply_required INTEGER NOT NULL DEFAULT 1,
  ai_auto_verify_enabled INTEGER NOT NULL DEFAULT 1,
  ai_verify_after_discovery INTEGER NOT NULL DEFAULT 1,
  ai_reverify_after_enrichment INTEGER NOT NULL DEFAULT 1,
  ai_verification_concurrency INTEGER NOT NULL DEFAULT 1,
  ai_max_attempts INTEGER NOT NULL DEFAULT 3,
  scheduler_ai_verification_enabled INTEGER NOT NULL DEFAULT 1,
  scheduler_crawl_enabled INTEGER NOT NULL DEFAULT 1,
  scheduler_enrichment_enabled INTEGER NOT NULL DEFAULT 1,
  scheduler_artifact_enabled INTEGER NOT NULL DEFAULT 1,
  scheduler_score_recompute_enabled INTEGER NOT NULL DEFAULT 1,
  openai_api_key_encrypted TEXT,
  google_places_api_key_encrypted TEXT,
  google_maps_browser_api_key_encrypted TEXT,
  google_text_search_monthly_cap INTEGER NOT NULL DEFAULT 4900,
  google_enterprise_monthly_cap INTEGER NOT NULL DEFAULT 900,
  google_test_run_call_cap INTEGER NOT NULL DEFAULT 50,
  google_auto_pagination_enabled INTEGER NOT NULL DEFAULT 1,
  google_auto_pagination_min_new_candidates INTEGER NOT NULL DEFAULT 6,
  google_auto_pagination_max_duplicate_rate REAL NOT NULL DEFAULT 0.6,
  google_default_discovery_mode TEXT NOT NULL DEFAULT 'coverage_probe',
  google_default_pagination_policy TEXT NOT NULL DEFAULT 'auto_yield_based',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lead_notes (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id),
  author_user_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS place_cache (
  place_id TEXT PRIMARY KEY,
  raw_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS places_master (
  place_id TEXT PRIMARY KEY,
  name TEXT,
  address TEXT,
  phone TEXT,
  website_uri TEXT,
  maps_uri TEXT,
  categories TEXT NOT NULL DEFAULT '[]',
  rating REAL,
  user_rating_count INTEGER,
  business_status TEXT,
  price_level TEXT,
  photo_count INTEGER NOT NULL DEFAULT 0,
  has_opening_hours INTEGER NOT NULL DEFAULT 0,
  primary_type TEXT,
  lat REAL,
  lng REAL,
  editorial_summary TEXT,
  review_highlights TEXT,
  website_health TEXT,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_details_at TEXT,
  last_enriched_at TEXT,
  completeness_score REAL NOT NULL DEFAULT 0,
  freshness_score REAL NOT NULL DEFAULT 0,
  verification_coverage REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS place_observations (
  id TEXT PRIMARY KEY,
  place_id TEXT NOT NULL,
  crawl_run_id TEXT,
  crawl_unit_id TEXT,
  lead_id TEXT,
  endpoint TEXT NOT NULL,
  sku TEXT NOT NULL,
  field_mask TEXT,
  raw_json TEXT NOT NULL,
  observed_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS api_usage_events (
  id TEXT PRIMARY KEY,
  crawl_run_id TEXT,
  crawl_unit_id TEXT,
  lead_id TEXT,
  endpoint TEXT NOT NULL,
  sku TEXT NOT NULL,
  field_mask TEXT,
  success INTEGER NOT NULL DEFAULT 1,
  was_cached INTEGER NOT NULL DEFAULT 0,
  billable_units INTEGER NOT NULL DEFAULT 1,
  estimated_unit_price REAL NOT NULL DEFAULT 0,
  estimated_cost REAL NOT NULL DEFAULT 0,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_lead_verifications (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id),
  model TEXT NOT NULL,
  status TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0,
  found_website_url TEXT,
  found_email TEXT,
  found_phone TEXT,
  social_profiles TEXT NOT NULL DEFAULT '[]',
  sources TEXT NOT NULL DEFAULT '[]',
  recommendation TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  website_viability_status TEXT,
  website_health_json TEXT,
  website_viability_reason TEXT,
  raw_json TEXT NOT NULL DEFAULT '{}',
  input_hash TEXT,
  usage_input_tokens INTEGER NOT NULL DEFAULT 0,
  usage_output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost REAL NOT NULL DEFAULT 0,
  error TEXT,
  requested_by_user_id TEXT,
  request_source TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id TEXT PRIMARY KEY,
  lead_id TEXT REFERENCES leads(id),
  verification_id TEXT REFERENCES ai_lead_verifications(id),
  model TEXT NOT NULL,
  endpoint TEXT NOT NULL DEFAULT 'responses',
  success INTEGER NOT NULL DEFAULT 1,
  was_cached INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost REAL NOT NULL DEFAULT 0,
  metadata TEXT NOT NULL DEFAULT '{}',
  actor_user_id TEXT,
  request_source TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lead_ai_artifacts (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id),
  artifact_type TEXT NOT NULL CHECK(artifact_type IN ('business_detail','competitive_report')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','complete','error')),
  model TEXT NOT NULL DEFAULT 'gpt-5.4-mini',
  input_hash TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  content_json TEXT NOT NULL DEFAULT '{}',
  sources_json TEXT NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL DEFAULT 0,
  usage_input_tokens INTEGER NOT NULL DEFAULT 0,
  usage_output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost REAL NOT NULL DEFAULT 0,
  error TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_retry_at TEXT,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  requested_by_user_id TEXT,
  request_source TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_feedback_events (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  verification_id TEXT REFERENCES ai_lead_verifications(id) ON DELETE SET NULL,
  artifact_id TEXT REFERENCES lead_ai_artifacts(id) ON DELETE SET NULL,
  actor_user_id TEXT,
  feedback_kind TEXT NOT NULL CHECK(feedback_kind IN ('verification','pitch')),
  verdict TEXT NOT NULL CHECK(verdict IN ('correct','incorrect','uncertain','useful','not_useful')),
  corrected_website_url TEXT,
  reason TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS worker_runs (
  id TEXT PRIMARY KEY,
  worker_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  trigger_source TEXT NOT NULL DEFAULT 'unknown',
  http_status INTEGER,
  result_json TEXT NOT NULL DEFAULT '{}',
  error TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  actor_user_id TEXT,
  actor_email TEXT,
  actor_role TEXT,
  metadata TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  scope_kind TEXT NOT NULL DEFAULT 'legacy_unscoped',
  tenant_id TEXT,
  workspace_id TEXT,
  correlation_id TEXT,
  actor_auth_identity_id TEXT,
  actor_membership_id TEXT,
  actor_launch_role TEXT,
  actor_role_binding_id TEXT,
  actor_layer TEXT,
  CONSTRAINT audit_logs_scope_kind_chk CHECK (scope_kind IN ('tenant', 'platform', 'legacy_unscoped')),
  CONSTRAINT audit_logs_scope_shape_chk CHECK (
    (scope_kind = 'tenant' AND tenant_id IS NOT NULL)
    OR (scope_kind IN ('platform', 'legacy_unscoped') AND tenant_id IS NULL)
  ),
  CONSTRAINT audit_logs_tenant_required_context_chk CHECK (
    scope_kind <> 'tenant'
    OR (
      correlation_id IS NOT NULL
      AND actor_auth_identity_id IS NOT NULL
      AND actor_membership_id IS NOT NULL
      AND actor_launch_role IS NOT NULL
      AND actor_role_binding_id IS NOT NULL
      AND actor_layer = 'member'
      AND actor_email IS NULL
    )
  ),
  CONSTRAINT audit_logs_platform_context_chk CHECK (
    scope_kind <> 'platform'
    OR (workspace_id IS NULL AND actor_membership_id IS NULL AND actor_role_binding_id IS NULL AND actor_layer IS NOT NULL AND actor_layer <> 'member')
  ),
  CONSTRAINT audit_logs_workspace_tenant_fkey
    FOREIGN KEY (tenant_id, workspace_id)
    REFERENCES workspaces (tenant_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT audit_logs_membership_tenant_fkey
    FOREIGN KEY (tenant_id, actor_membership_id)
    REFERENCES tenant_memberships (tenant_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT audit_logs_role_binding_tenant_fkey
    FOREIGN KEY (tenant_id, actor_role_binding_id)
    REFERENCES tenant_role_bindings (tenant_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT audit_logs_launch_role_chk CHECK (
    actor_launch_role IS NULL OR actor_launch_role IN ('owner', 'admin', 'strategist_manager', 'researcher', 'reviewer', 'outreach_operator', 'analyst_read_only')
  ),
  CONSTRAINT audit_logs_actor_layer_chk CHECK (
    actor_layer IS NULL OR actor_layer IN ('member', 'support', 'worker', 'agent', 'system')
  ),
  CONSTRAINT audit_logs_action_shape_chk CHECK (action GLOB '[a-z]*' AND action NOT GLOB '*[^a-z0-9_.:-]*' AND length(action) BETWEEN 1 AND 128),
  CONSTRAINT audit_logs_entity_type_shape_chk CHECK (entity_type IS NULL OR (entity_type GLOB '[a-z]*' AND entity_type NOT GLOB '*[^a-z0-9_.:-]*' AND length(entity_type) BETWEEN 1 AND 64)),
  CONSTRAINT audit_logs_entity_id_shape_chk CHECK (entity_id IS NULL OR (substr(entity_id, 1, 1) GLOB '[A-Za-z0-9]' AND entity_id NOT GLOB '*[^A-Za-z0-9._:/-]*' AND length(entity_id) BETWEEN 1 AND 256)),
  CONSTRAINT audit_logs_correlation_shape_chk CHECK (correlation_id IS NULL OR (substr(correlation_id, 1, 1) GLOB '[A-Za-z0-9]' AND correlation_id NOT GLOB '*[^A-Za-z0-9._:/-]*' AND length(correlation_id) BETWEEN 1 AND 128)),
  CONSTRAINT audit_logs_uuid_shape_chk CHECK (
    (tenant_id IS NULL OR (length(tenant_id) = 36 AND length(replace(tenant_id, '-', '')) = 32 AND tenant_id NOT GLOB '*[^0-9A-Fa-f-]*'))
    AND (workspace_id IS NULL OR (length(workspace_id) = 36 AND length(replace(workspace_id, '-', '')) = 32 AND workspace_id NOT GLOB '*[^0-9A-Fa-f-]*'))
    AND (actor_auth_identity_id IS NULL OR (length(actor_auth_identity_id) = 36 AND length(replace(actor_auth_identity_id, '-', '')) = 32 AND actor_auth_identity_id NOT GLOB '*[^0-9A-Fa-f-]*'))
    AND (actor_membership_id IS NULL OR (length(actor_membership_id) = 36 AND length(replace(actor_membership_id, '-', '')) = 32 AND actor_membership_id NOT GLOB '*[^0-9A-Fa-f-]*'))
    AND (actor_role_binding_id IS NULL OR (length(actor_role_binding_id) = 36 AND length(replace(actor_role_binding_id, '-', '')) = 32 AND actor_role_binding_id NOT GLOB '*[^0-9A-Fa-f-]*'))
  )
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created_at ON audit_logs(tenant_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_action_created_at ON audit_logs(tenant_id, action, created_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_correlation_id ON audit_logs(correlation_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace_created_at ON audit_logs(workspace_id, created_at DESC, id) WHERE workspace_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_novatrade_audit_logs_insert_guard;
CREATE TRIGGER trg_novatrade_audit_logs_insert_guard
BEFORE INSERT ON audit_logs
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NEW.scope_kind = 'tenant' AND NOT EXISTS (
    SELECT 1
    FROM tenant_memberships AS membership
    WHERE membership.tenant_id = NEW.tenant_id
      AND membership.id = NEW.actor_membership_id
      AND membership.auth_identity_id = NEW.actor_auth_identity_id
  ) THEN RAISE(ABORT, 'tenant audit membership does not match tenant and actor identity') END;
  SELECT CASE WHEN NEW.scope_kind = 'tenant' AND NOT EXISTS (
    SELECT 1
    FROM tenant_role_bindings AS binding
    WHERE binding.tenant_id = NEW.tenant_id
      AND binding.id = NEW.actor_role_binding_id
      AND binding.membership_id = NEW.actor_membership_id
      AND binding.role = NEW.actor_launch_role
  ) THEN RAISE(ABORT, 'tenant audit role binding does not match tenant and membership') END;
END;

DROP TRIGGER IF EXISTS trg_novatrade_audit_logs_update_guard;
CREATE TRIGGER trg_novatrade_audit_logs_update_guard
BEFORE UPDATE ON audit_logs
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'audit logs are append-only');
END;

DROP TRIGGER IF EXISTS trg_novatrade_audit_logs_delete_guard;
CREATE TRIGGER trg_novatrade_audit_logs_delete_guard
BEFORE DELETE ON audit_logs
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'audit logs are append-only');
END;

CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_website_status ON leads(website_status);
CREATE INDEX IF NOT EXISTS idx_leads_enrichment ON leads(enrichment_status, score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_enrichment_lease ON leads(enrichment_status, enrichment_next_retry_at, score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_queue_candidates ON leads(website_status, status, score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_workbench_active_candidates ON leads(assigned_to_user_id, website_status, qualification_status, status, quality_bucket, sales_priority_score DESC, lead_quality_score DESC, score DESC) WHERE archived_at IS NULL AND COALESCE(is_excluded, 0) = 0 AND score > 0;
CREATE INDEX IF NOT EXISTS idx_leads_queue_timing ON leads(reminder_date, last_contacted_at);
CREATE INDEX IF NOT EXISTS idx_leads_primary_type_score ON leads(primary_type, score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_numeric_filters ON leads(review_count, rating, score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_exclusion_score ON leads(is_excluded, score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_archived_active ON leads(archived_at, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_qualification_score ON leads(qualification_status, score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_selling_niche_score ON leads(selling_niche, score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_business_type_score ON leads(business_type, score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_win_probability ON leads(win_probability_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_quality_bucket_score ON leads(quality_bucket, lead_quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_quality_offer ON leads(recommended_offer, lead_quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_phone_quality ON leads(phone_verification_status, lead_quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_ai_status_checked ON leads(ai_verification_status, ai_checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_ai_queue_status ON leads(ai_queue_status, ai_next_retry_at, sales_priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_sales_priority ON leads(sales_priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_component_scores ON leads(raw_opportunity_score DESC, verification_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to_user ON leads(assigned_to_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_market_active ON leads(market_id, archived_at, score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_location_cell ON leads(location_cell_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_country_admin ON leads(country_code, admin_area1, locality);
CREATE INDEX IF NOT EXISTS idx_app_users_role_status ON app_users(role, status);
CREATE INDEX IF NOT EXISTS idx_app_users_team_lead ON app_users(team_lead_user_id, status);
CREATE INDEX IF NOT EXISTS idx_location_markets_country_status ON location_markets(country_code, status, name);
CREATE INDEX IF NOT EXISTS idx_location_cells_market_active ON location_cells(market_id, is_active, cell_type);
CREATE INDEX IF NOT EXISTS idx_location_cells_country_postal ON location_cells(country_code, postal_code_normalized);
CREATE INDEX IF NOT EXISTS idx_user_market_access_user ON user_market_access(user_id, market_id);
CREATE INDEX IF NOT EXISTS idx_user_market_access_market ON user_market_access(market_id, user_id);
CREATE INDEX IF NOT EXISTS idx_lead_notes_lead_created ON lead_notes(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crawl_units_status_zip ON crawl_units(status, zip);
CREATE INDEX IF NOT EXISTS idx_crawl_units_retry_ready ON crawl_units(crawl_run_id, status, next_retry_at, created_at);
CREATE INDEX IF NOT EXISTS idx_crawl_units_run ON crawl_units(crawl_run_id);
CREATE INDEX IF NOT EXISTS idx_crawl_units_run_status ON crawl_units(crawl_run_id, status);
CREATE INDEX IF NOT EXISTS idx_crawl_runs_status_created ON crawl_runs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crawl_runs_market_created ON crawl_runs(market_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crawl_runs_created_desc ON crawl_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crawl_units_market_status ON crawl_units(market_id, status, category);
CREATE INDEX IF NOT EXISTS idx_crawl_units_cell_status ON crawl_units(location_cell_id, status, category);
CREATE INDEX IF NOT EXISTS idx_zip_codes_state_county_zip ON zip_codes(state, county, zip);
CREATE INDEX IF NOT EXISTS idx_zip_codes_state_county_active ON zip_codes(state, county, is_active);
CREATE INDEX IF NOT EXISTS idx_places_master_last_seen ON places_master(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_places_master_quality ON places_master(completeness_score DESC, freshness_score DESC);
CREATE INDEX IF NOT EXISTS idx_place_observations_place_time ON place_observations(place_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_place_observations_run_time ON place_observations(crawl_run_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_created ON api_usage_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_sku_created ON api_usage_events(sku, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_run_created ON api_usage_events(crawl_run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_endpoint_created ON api_usage_events(endpoint, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_verifications_lead_created ON ai_lead_verifications(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_verifications_status_created ON ai_lead_verifications(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_verifications_requester_created ON ai_lead_verifications(requested_by_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_model_created ON ai_usage_events(model, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_actor_created ON ai_usage_events(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_ai_artifacts_lead_type_created ON lead_ai_artifacts(lead_id, artifact_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_ai_artifacts_status_created ON lead_ai_artifacts(status, created_at);
CREATE INDEX IF NOT EXISTS idx_lead_ai_artifacts_requester_created ON lead_ai_artifacts(requested_by_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_events_lead_created ON ai_feedback_events(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_events_actor_created ON ai_feedback_events(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_events_kind_verdict ON ai_feedback_events(feedback_kind, verdict, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_score_recompute_stale ON leads(updated_at DESC, last_quality_scored_at);
CREATE INDEX IF NOT EXISTS idx_worker_runs_worker_started ON worker_runs(worker_name, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_worker_runs_status_started ON worker_runs(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_events_lead ON outreach_events(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_events_actor_created ON outreach_events(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_requests_status_type_created ON admin_requests(status, request_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_requests_lead_created ON admin_requests(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_requests_creator_created ON admin_requests(created_by_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_requests_assigned_created ON admin_requests(assigned_admin_user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_requests_open_unique ON admin_requests(lead_id, request_type)
  WHERE status IN ('new','seen','in_progress','waiting_on_researcher');
CREATE INDEX IF NOT EXISTS idx_demos_public_slug ON demos(slug, is_published, revoked_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created ON audit_logs(actor_user_id, created_at DESC);

INSERT OR IGNORE INTO settings (id) VALUES (1);
`;
