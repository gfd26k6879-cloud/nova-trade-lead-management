-- F-01: the export ledger is readable only through an exact, live member
-- context. Runtime privileges remain an explicit deployment concern; this
-- migration grants no table or function authority.

REVOKE ALL ON TABLE public.tenant_export_jobs FROM PUBLIC;

DO $$
BEGIN
  IF pg_catalog.to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public.tenant_export_jobs FROM anon';
  END IF;
  IF pg_catalog.to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public.tenant_export_jobs FROM authenticated';
  END IF;
END;
$$;

ALTER TABLE public.tenant_export_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_export_jobs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS f01_export_jobs_member_select ON public.tenant_export_jobs;
CREATE POLICY f01_export_jobs_member_select ON public.tenant_export_jobs
  FOR SELECT TO PUBLIC
  USING (
    public.novatrade_rls_member_context()
    AND pg_catalog.current_setting('app.role', true) IN ('owner', 'admin')
    AND tenant_id::text = pg_catalog.current_setting('app.tenant_id', true)
    AND coalesce(workspace_id::text, '') =
      coalesce(pg_catalog.current_setting('app.workspace_id', true), '')
  );

DROP POLICY IF EXISTS f01_export_jobs_deny_all_mutations ON public.tenant_export_jobs;
CREATE POLICY f01_export_jobs_deny_all_mutations ON public.tenant_export_jobs
  FOR ALL TO PUBLIC
  USING (false)
  WITH CHECK (false);

COMMENT ON POLICY f01_export_jobs_member_select ON public.tenant_export_jobs IS
  'F-01 exact-scope owner/admin metadata read through the T-027 transaction-local member context.';
COMMENT ON POLICY f01_export_jobs_deny_all_mutations ON public.tenant_export_jobs IS
  'F-01 deny-by-default mutation boundary; F-03 must introduce separately authorized operations.';
