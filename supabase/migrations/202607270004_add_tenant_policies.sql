CREATE TABLE public.tenant_policies (
  id uuid CONSTRAINT tenant_policies_pkey PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  tenant_id uuid NOT NULL CONSTRAINT tenant_policies_tenant_id_fkey
    REFERENCES public.tenants (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  version integer NOT NULL DEFAULT 1 CONSTRAINT tenant_policies_version_chk CHECK (version >= 1),
  locale text NOT NULL DEFAULT 'en-US'
    CONSTRAINT tenant_policies_locale_length_chk CHECK (char_length(trim(locale)) BETWEEN 2 AND 64)
    CONSTRAINT tenant_policies_locale_format_chk CHECK (locale ~ '^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{1,8})*$'),
  timezone text NOT NULL DEFAULT 'UTC'
    CONSTRAINT tenant_policies_timezone_length_chk CHECK (char_length(trim(timezone)) BETWEEN 1 AND 64)
    CONSTRAINT tenant_policies_timezone_format_chk CHECK (
      timezone = 'UTC' OR timezone ~ '^(?:[A-Za-z_]+(?:/[A-Za-z_][A-Za-z0-9_-]*)*|Etc/GMT[+-](?:1[0-4]|[0-9]))$'
    ),
  export_retention_days integer NOT NULL DEFAULT 7 CONSTRAINT tenant_policies_export_retention_days_chk CHECK (export_retention_days BETWEEN 1 AND 7),
  operational_log_retention_days integer NOT NULL DEFAULT 30 CONSTRAINT tenant_policies_operational_log_retention_days_chk CHECK (operational_log_retention_days BETWEEN 1 AND 30),
  raw_source_retention_days integer NOT NULL DEFAULT 180 CONSTRAINT tenant_policies_raw_source_retention_days_chk CHECK (raw_source_retention_days BETWEEN 1 AND 180),
  contact_freshness_days integer NOT NULL DEFAULT 180 CONSTRAINT tenant_policies_contact_freshness_days_chk CHECK (contact_freshness_days BETWEEN 1 AND 180),
  primary_delete_within_days integer NOT NULL DEFAULT 30 CONSTRAINT tenant_policies_primary_delete_within_days_chk CHECK (primary_delete_within_days BETWEEN 1 AND 30),
  backup_expire_within_days integer NOT NULL DEFAULT 35 CONSTRAINT tenant_policies_backup_expire_within_days_chk CHECK (backup_expire_within_days BETWEEN 1 AND 35),
  tombstone_retention_years integer NOT NULL DEFAULT 7 CONSTRAINT tenant_policies_tombstone_retention_years_chk CHECK (tombstone_retention_years = 7),
  active_materials_mode text NOT NULL DEFAULT 'while_authorized_until_superseded_policy_or_deletion'
    CONSTRAINT tenant_policies_active_materials_mode_chk CHECK (active_materials_mode = 'while_authorized_until_superseded_policy_or_deletion'),
  ai_processing_enabled boolean NOT NULL DEFAULT false CONSTRAINT tenant_policies_ai_processing_enabled_chk CHECK (ai_processing_enabled IN (false, true)),
  source_research_enabled boolean NOT NULL DEFAULT false CONSTRAINT tenant_policies_source_research_enabled_chk CHECK (source_research_enabled IN (false, true)),
  contact_research_enabled boolean NOT NULL DEFAULT false CONSTRAINT tenant_policies_contact_research_enabled_chk CHECK (contact_research_enabled IN (false, true)),
  outreach_drafting_enabled boolean NOT NULL DEFAULT false CONSTRAINT tenant_policies_outreach_drafting_enabled_chk CHECK (outreach_drafting_enabled IN (false, true)),
  copy_export_enabled boolean NOT NULL DEFAULT false CONSTRAINT tenant_policies_copy_export_enabled_chk CHECK (copy_export_enabled IN (false, true)),
  autonomous_send_enabled boolean NOT NULL DEFAULT false CONSTRAINT tenant_policies_autonomous_send_enabled_chk CHECK (autonomous_send_enabled = false),
  require_source_plan_approval boolean NOT NULL DEFAULT true CONSTRAINT tenant_policies_require_source_plan_approval_chk CHECK (require_source_plan_approval IN (false, true)),
  require_knowledge_review boolean NOT NULL DEFAULT true CONSTRAINT tenant_policies_require_knowledge_review_chk CHECK (require_knowledge_review IN (false, true)),
  require_icp_review boolean NOT NULL DEFAULT true CONSTRAINT tenant_policies_require_icp_review_chk CHECK (require_icp_review IN (false, true)),
  require_lead_play_review boolean NOT NULL DEFAULT true CONSTRAINT tenant_policies_require_lead_play_review_chk CHECK (require_lead_play_review IN (false, true)),
  require_contact_review boolean NOT NULL DEFAULT true CONSTRAINT tenant_policies_require_contact_review_chk CHECK (require_contact_review IN (false, true)),
  require_outreach_review boolean NOT NULL DEFAULT true CONSTRAINT tenant_policies_require_outreach_review_chk CHECK (require_outreach_review IN (false, true)),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT tenant_policies_tenant_unique UNIQUE (tenant_id)
);

COMMENT ON TABLE public.tenant_policies IS 'One versioned, tenant-scoped lifecycle and capability kill-switch profile per tenant; policy never grants authority.';
COMMENT ON COLUMN public.tenant_policies.contact_freshness_days IS 'Freshness eligibility window; it is not a deletion timer.';
COMMENT ON COLUMN public.tenant_policies.backup_expire_within_days IS 'Backup expiry target measured after verified primary deletion.';
COMMENT ON COLUMN public.tenant_policies.active_materials_mode IS 'Fixed lifecycle vocabulary; active materials remain authorized only until supersession, policy, or deletion.';
COMMENT ON COLUMN public.tenant_policies.autonomous_send_enabled IS 'Fixed false at launch; external autonomous sending is prohibited.';
COMMENT ON COLUMN public.tenant_policies.ai_processing_enabled IS 'Kill-switch prerequisite only; never source, provider, contact, jurisdiction, or approval authority.';
COMMENT ON COLUMN public.tenant_policies.source_research_enabled IS 'Kill-switch prerequisite only; never source, provider, contact, jurisdiction, or approval authority.';
COMMENT ON COLUMN public.tenant_policies.contact_research_enabled IS 'Kill-switch prerequisite only; never source, provider, contact, jurisdiction, or approval authority.';
COMMENT ON COLUMN public.tenant_policies.outreach_drafting_enabled IS 'Kill-switch prerequisite only; never source, provider, contact, jurisdiction, or approval authority.';
COMMENT ON COLUMN public.tenant_policies.copy_export_enabled IS 'Kill-switch prerequisite only; never source, provider, contact, jurisdiction, or approval authority.';
COMMENT ON COLUMN public.tenant_policies.updated_at IS 'Server-maintained timestamp set by the policy guard on every permitted versioned update.';

CREATE INDEX idx_tenant_policies_tenant_updated_at ON public.tenant_policies (tenant_id, updated_at DESC);

CREATE OR REPLACE FUNCTION public.novatrade_tenant_policies_guard_and_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'tenant policy id is immutable'; END IF;
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN RAISE EXCEPTION 'tenant policy tenant_id is immutable'; END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'tenant policy created_at is immutable'; END IF;
  IF NEW.version IS DISTINCT FROM OLD.version + 1 THEN RAISE EXCEPTION 'tenant policy version must advance exactly one'; END IF;
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_novatrade_tenant_policies_guard_and_touch
BEFORE UPDATE ON public.tenant_policies FOR EACH ROW
EXECUTE FUNCTION public.novatrade_tenant_policies_guard_and_touch();

DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.novatrade_tenant_policies_guard_and_touch() FROM PUBLIC';
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.novatrade_tenant_policies_guard_and_touch() FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.novatrade_tenant_policies_guard_and_touch() FROM authenticated';
  END IF;
END;
$$;

/* Comment-only rehearsal: execute manually in a disposable Postgres database after migrations 001..003.
BEGIN;
INSERT INTO public.tenant_policies (tenant_id) VALUES ('00000000-0000-0000-0000-000000000001');
UPDATE public.tenant_policies SET version = 2, copy_export_enabled = true WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
-- Duplicate tenant, invalid range, mode change, send=true, version skip/decrease, and identity rewrites must fail.
ROLLBACK;
*/
