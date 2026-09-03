-- F-01: enforce tenant isolation for the legacy lead/CRM aggregate.
--
-- The application runtime role is provisioned outside migration history. It
-- must be NOSUPERUSER/NOBYPASSRLS and receives only explicit table/function
-- grants. PUBLIC is the policy target so the same policies cover that named
-- runtime role without granting PUBLIC, anon, or authenticated any SQL access.

REVOKE ALL ON TABLE
  public.leads,
  public.lead_notes,
  public.outreach_events,
  public.admin_requests,
  public.demos
FROM PUBLIC;

DO $f01_revoke_data_api_roles$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE
      public.leads,
      public.lead_notes,
      public.outreach_events,
      public.admin_requests,
      public.demos
    FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE
      public.leads,
      public.lead_notes,
      public.outreach_events,
      public.admin_requests,
      public.demos
    FROM authenticated;
  END IF;
END;
$f01_revoke_data_api_roles$;

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads FORCE ROW LEVEL SECURITY;
ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_notes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.admin_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.demos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demos FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS f01_leads_member_select ON public.leads;
CREATE POLICY f01_leads_member_select ON public.leads
  FOR SELECT TO PUBLIC
  USING (
    public.novatrade_rls_member_context()
    AND tenant_id::text = pg_catalog.current_setting('app.tenant_id', true)
  );
DROP POLICY IF EXISTS f01_leads_member_insert ON public.leads;
CREATE POLICY f01_leads_member_insert ON public.leads
  FOR INSERT TO PUBLIC
  WITH CHECK (
    public.novatrade_rls_member_context()
    AND tenant_id::text = pg_catalog.current_setting('app.tenant_id', true)
  );
DROP POLICY IF EXISTS f01_leads_member_update ON public.leads;
CREATE POLICY f01_leads_member_update ON public.leads
  FOR UPDATE TO PUBLIC
  USING (
    public.novatrade_rls_member_context()
    AND tenant_id::text = pg_catalog.current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    public.novatrade_rls_member_context()
    AND tenant_id::text = pg_catalog.current_setting('app.tenant_id', true)
  );
DROP POLICY IF EXISTS f01_leads_member_delete ON public.leads;
CREATE POLICY f01_leads_member_delete ON public.leads
  FOR DELETE TO PUBLIC
  USING (
    public.novatrade_rls_member_context()
    AND tenant_id::text = pg_catalog.current_setting('app.tenant_id', true)
  );

DROP POLICY IF EXISTS f01_lead_notes_member_select ON public.lead_notes;
CREATE POLICY f01_lead_notes_member_select ON public.lead_notes
  FOR SELECT TO PUBLIC
  USING (
    public.novatrade_rls_member_context()
    AND tenant_id::text = pg_catalog.current_setting('app.tenant_id', true)
    AND (
      coalesce(pg_catalog.current_setting('app.workspace_id', true), '') = ''
      OR workspace_id::text = pg_catalog.current_setting('app.workspace_id', true)
    )
  );
DROP POLICY IF EXISTS f01_lead_notes_member_insert ON public.lead_notes;
CREATE POLICY f01_lead_notes_member_insert ON public.lead_notes
  FOR INSERT TO PUBLIC
  WITH CHECK (
    public.novatrade_rls_member_context()
    AND tenant_id::text = pg_catalog.current_setting('app.tenant_id', true)
    AND (
      coalesce(pg_catalog.current_setting('app.workspace_id', true), '') = ''
      OR workspace_id::text = pg_catalog.current_setting('app.workspace_id', true)
    )
  );
DROP POLICY IF EXISTS f01_lead_notes_member_update ON public.lead_notes;
CREATE POLICY f01_lead_notes_member_update ON public.lead_notes
  FOR UPDATE TO PUBLIC
  USING (
    public.novatrade_rls_member_context()
    AND tenant_id::text = pg_catalog.current_setting('app.tenant_id', true)
    AND (
      coalesce(pg_catalog.current_setting('app.workspace_id', true), '') = ''
      OR workspace_id::text = pg_catalog.current_setting('app.workspace_id', true)
    )
  )
  WITH CHECK (
    public.novatrade_rls_member_context()
    AND tenant_id::text = pg_catalog.current_setting('app.tenant_id', true)
    AND (
      coalesce(pg_catalog.current_setting('app.workspace_id', true), '') = ''
      OR workspace_id::text = pg_catalog.current_setting('app.workspace_id', true)
    )
  );
DROP POLICY IF EXISTS f01_lead_notes_member_delete ON public.lead_notes;
CREATE POLICY f01_lead_notes_member_delete ON public.lead_notes
  FOR DELETE TO PUBLIC
  USING (
    public.novatrade_rls_member_context()
    AND tenant_id::text = pg_catalog.current_setting('app.tenant_id', true)
    AND (
      coalesce(pg_catalog.current_setting('app.workspace_id', true), '') = ''
      OR workspace_id::text = pg_catalog.current_setting('app.workspace_id', true)
    )
  );

DROP POLICY IF EXISTS f01_outreach_events_member_select ON public.outreach_events;
CREATE POLICY f01_outreach_events_member_select ON public.outreach_events
  FOR SELECT TO PUBLIC
  USING (
    public.novatrade_rls_member_context()
    AND tenant_id::text = pg_catalog.current_setting('app.tenant_id', true)
    AND (
      coalesce(pg_catalog.current_setting('app.workspace_id', true), '') = ''
      OR workspace_id::text = pg_catalog.current_setting('app.workspace_id', true)
    )
  );
DROP POLICY IF EXISTS f01_outreach_events_member_insert ON public.outreach_events;
CREATE POLICY f01_outreach_events_member_insert ON public.outreach_events
  FOR INSERT TO PUBLIC
  WITH CHECK (
    public.novatrade_rls_member_context()
    AND tenant_id::text = pg_catalog.current_setting('app.tenant_id', true)
    AND (
      coalesce(pg_catalog.current_setting('app.workspace_id', true), '') = ''
      OR workspace_id::text = pg_catalog.current_setting('app.workspace_id', true)
    )
  );
DROP POLICY IF EXISTS f01_outreach_events_member_update ON public.outreach_events;
CREATE POLICY f01_outreach_events_member_update ON public.outreach_events
  FOR UPDATE TO PUBLIC
  USING (
    public.novatrade_rls_member_context()
    AND tenant_id::text = pg_catalog.current_setting('app.tenant_id', true)
    AND (
      coalesce(pg_catalog.current_setting('app.workspace_id', true), '') = ''
      OR workspace_id::text = pg_catalog.current_setting('app.workspace_id', true)
    )
  )
  WITH CHECK (
    public.novatrade_rls_member_context()
    AND tenant_id::text = pg_catalog.current_setting('app.tenant_id', true)
    AND (
      coalesce(pg_catalog.current_setting('app.workspace_id', true), '') = ''
      OR workspace_id::text = pg_catalog.current_setting('app.workspace_id', true)
    )
  );
DROP POLICY IF EXISTS f01_outreach_events_member_delete ON public.outreach_events;
CREATE POLICY f01_outreach_events_member_delete ON public.outreach_events
  FOR DELETE TO PUBLIC
  USING (
    public.novatrade_rls_member_context()
    AND tenant_id::text = pg_catalog.current_setting('app.tenant_id', true)
    AND (
      coalesce(pg_catalog.current_setting('app.workspace_id', true), '') = ''
      OR workspace_id::text = pg_catalog.current_setting('app.workspace_id', true)
    )
  );

DROP POLICY IF EXISTS f01_admin_requests_member_select ON public.admin_requests;
CREATE POLICY f01_admin_requests_member_select ON public.admin_requests
  FOR SELECT TO PUBLIC
  USING (
    public.novatrade_rls_member_context()
    AND tenant_id::text = pg_catalog.current_setting('app.tenant_id', true)
    AND (
      coalesce(pg_catalog.current_setting('app.workspace_id', true), '') = ''
      OR workspace_id::text = pg_catalog.current_setting('app.workspace_id', true)
    )
  );
DROP POLICY IF EXISTS f01_admin_requests_member_insert ON public.admin_requests;
CREATE POLICY f01_admin_requests_member_insert ON public.admin_requests
  FOR INSERT TO PUBLIC
  WITH CHECK (
    public.novatrade_rls_member_context()
    AND tenant_id::text = pg_catalog.current_setting('app.tenant_id', true)
    AND (
      coalesce(pg_catalog.current_setting('app.workspace_id', true), '') = ''
      OR workspace_id::text = pg_catalog.current_setting('app.workspace_id', true)
    )
  );
DROP POLICY IF EXISTS f01_admin_requests_member_update ON public.admin_requests;
CREATE POLICY f01_admin_requests_member_update ON public.admin_requests
  FOR UPDATE TO PUBLIC
  USING (
    public.novatrade_rls_member_context()
    AND tenant_id::text = pg_catalog.current_setting('app.tenant_id', true)
    AND (
      coalesce(pg_catalog.current_setting('app.workspace_id', true), '') = ''
      OR workspace_id::text = pg_catalog.current_setting('app.workspace_id', true)
    )
  )
  WITH CHECK (
    public.novatrade_rls_member_context()
    AND tenant_id::text = pg_catalog.current_setting('app.tenant_id', true)
    AND (
      coalesce(pg_catalog.current_setting('app.workspace_id', true), '') = ''
      OR workspace_id::text = pg_catalog.current_setting('app.workspace_id', true)
    )
  );
DROP POLICY IF EXISTS f01_admin_requests_member_delete ON public.admin_requests;
CREATE POLICY f01_admin_requests_member_delete ON public.admin_requests
  FOR DELETE TO PUBLIC
  USING (
    public.novatrade_rls_member_context()
    AND tenant_id::text = pg_catalog.current_setting('app.tenant_id', true)
    AND (
      coalesce(pg_catalog.current_setting('app.workspace_id', true), '') = ''
      OR workspace_id::text = pg_catalog.current_setting('app.workspace_id', true)
    )
  );

DROP POLICY IF EXISTS f01_demos_member_select ON public.demos;
CREATE POLICY f01_demos_member_select ON public.demos
  FOR SELECT TO PUBLIC
  USING (
    public.novatrade_rls_member_context()
    AND tenant_id::text = pg_catalog.current_setting('app.tenant_id', true)
    AND (
      coalesce(pg_catalog.current_setting('app.workspace_id', true), '') = ''
      OR workspace_id::text = pg_catalog.current_setting('app.workspace_id', true)
    )
  );
DROP POLICY IF EXISTS f01_demos_member_insert ON public.demos;
CREATE POLICY f01_demos_member_insert ON public.demos
  FOR INSERT TO PUBLIC
  WITH CHECK (
    public.novatrade_rls_member_context()
    AND tenant_id::text = pg_catalog.current_setting('app.tenant_id', true)
    AND (
      coalesce(pg_catalog.current_setting('app.workspace_id', true), '') = ''
      OR workspace_id::text = pg_catalog.current_setting('app.workspace_id', true)
    )
  );
DROP POLICY IF EXISTS f01_demos_member_update ON public.demos;
CREATE POLICY f01_demos_member_update ON public.demos
  FOR UPDATE TO PUBLIC
  USING (
    public.novatrade_rls_member_context()
    AND tenant_id::text = pg_catalog.current_setting('app.tenant_id', true)
    AND (
      coalesce(pg_catalog.current_setting('app.workspace_id', true), '') = ''
      OR workspace_id::text = pg_catalog.current_setting('app.workspace_id', true)
    )
  )
  WITH CHECK (
    public.novatrade_rls_member_context()
    AND tenant_id::text = pg_catalog.current_setting('app.tenant_id', true)
    AND (
      coalesce(pg_catalog.current_setting('app.workspace_id', true), '') = ''
      OR workspace_id::text = pg_catalog.current_setting('app.workspace_id', true)
    )
  );
DROP POLICY IF EXISTS f01_demos_member_delete ON public.demos;
CREATE POLICY f01_demos_member_delete ON public.demos
  FOR DELETE TO PUBLIC
  USING (
    public.novatrade_rls_member_context()
    AND tenant_id::text = pg_catalog.current_setting('app.tenant_id', true)
    AND (
      coalesce(pg_catalog.current_setting('app.workspace_id', true), '') = ''
      OR workspace_id::text = pg_catalog.current_setting('app.workspace_id', true)
    )
  );
