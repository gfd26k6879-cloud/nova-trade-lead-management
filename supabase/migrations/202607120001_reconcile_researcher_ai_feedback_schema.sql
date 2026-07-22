-- Forward-only reconciliation for researcher AI feedback data.
-- Production historically recorded equivalent changes under remote migration
-- 20260610045957, whose SQL is not present in this repository. Keep that
-- history discrepancy explicit; this idempotent migration makes a fresh
-- tracked migration run reproduce the current application schema.

ALTER TABLE public.lead_ai_artifacts
  ADD COLUMN IF NOT EXISTS requested_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.lead_ai_artifacts
  ADD COLUMN IF NOT EXISTS request_source text;

ALTER TABLE public.ai_lead_verifications
  ADD COLUMN IF NOT EXISTS requested_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.ai_lead_verifications
  ADD COLUMN IF NOT EXISTS request_source text;

ALTER TABLE public.ai_usage_events
  ADD COLUMN IF NOT EXISTS actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.ai_usage_events
  ADD COLUMN IF NOT EXISTS request_source text;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS researcher_ai_daily_run_cap integer NOT NULL DEFAULT 10;
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS researcher_ai_daily_budget_usd double precision NOT NULL DEFAULT 2.0;
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS researcher_ai_monthly_budget_usd double precision NOT NULL DEFAULT 25.0;

CREATE TABLE IF NOT EXISTS public.ai_feedback_events (
  id text PRIMARY KEY,
  lead_id text NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  verification_id text REFERENCES public.ai_lead_verifications(id) ON DELETE SET NULL,
  artifact_id text REFERENCES public.lead_ai_artifacts(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  feedback_kind text NOT NULL CHECK (feedback_kind IN ('verification','pitch')),
  verdict text NOT NULL CHECK (verdict IN ('correct','incorrect','uncertain','useful','not_useful')),
  corrected_website_url text,
  reason text,
  metadata_json text NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_actor_created
  ON public.ai_usage_events(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_verifications_requester_created
  ON public.ai_lead_verifications(requested_by_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_ai_artifacts_requester_created
  ON public.lead_ai_artifacts(requested_by_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_events_lead_created
  ON public.ai_feedback_events(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_events_actor_created
  ON public.ai_feedback_events(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_events_kind_verdict
  ON public.ai_feedback_events(feedback_kind, verdict, created_at DESC);

ALTER TABLE public.ai_feedback_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_feedback_events FROM anon, authenticated;
