-- The application uses server-side database access and deliberately revokes
-- all direct anon/authenticated table privileges. Keep the automatic RLS event
-- trigger unavailable to API roles as well: it is a SECURITY DEFINER helper
-- and is not part of the application RPC surface.
DO $$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC';

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE 'REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM anon';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM authenticated';
    END IF;
  END IF;
END
$$;

-- Cover foreign keys that are traversed during cascade/delete checks and are
-- currently reported by the production performance advisor as unindexed.
CREATE INDEX IF NOT EXISTS idx_ai_feedback_events_artifact_id
  ON public.ai_feedback_events(artifact_id);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_events_verification_id
  ON public.ai_feedback_events(verification_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_lead_id
  ON public.ai_usage_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_verification_id
  ON public.ai_usage_events(verification_id);
CREATE INDEX IF NOT EXISTS idx_app_users_created_by
  ON public.app_users(created_by);
CREATE INDEX IF NOT EXISTS idx_demos_lead_id
  ON public.demos(lead_id);
