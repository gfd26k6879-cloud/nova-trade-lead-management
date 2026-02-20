-- Phase 1 foundations: schema + RLS for private single-user deployment.

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'search_status') then
    create type public.search_status as enum ('queued', 'running', 'done', 'error');
  end if;

  if not exists (select 1 from pg_type where typname = 'lead_status') then
    create type public.lead_status as enum (
      'new',
      'verified',
      'contacted',
      'preview_sent',
      'meeting_set',
      'closed_won',
      'closed_lost'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'website_status') then
    create type public.website_status as enum ('none', 'social', 'basic', 'custom');
  end if;

  if not exists (select 1 from pg_type where typname = 'crawl_run_mode') then
    create type public.crawl_run_mode as enum ('coverage', 'manual', 'refresh');
  end if;

  if not exists (select 1 from pg_type where typname = 'crawl_run_status') then
    create type public.crawl_run_status as enum ('queued', 'running', 'paused', 'done', 'error');
  end if;

  if not exists (select 1 from pg_type where typname = 'crawl_unit_status') then
    create type public.crawl_unit_status as enum ('pending', 'running', 'retry_wait', 'done', 'failed');
  end if;

  if not exists (select 1 from pg_type where typname = 'outreach_channel') then
    create type public.outreach_channel as enum ('call', 'text', 'email', 'walkin', 'other');
  end if;
end $$;

create table if not exists public.searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  location_text text,
  categories text[] not null default '{}',
  keywords text,
  max_results int not null default 200,
  status public.search_status not null default 'queued',
  discovered_count int not null default 0,
  enriched_count int not null default 0,
  error_count int not null default 0,
  last_error text,
  created_at timestamptz not null default now()
);

create table if not exists public.zip_codes (
  zip text primary key,
  city text not null,
  state text not null,
  lat numeric,
  lng numeric,
  is_active boolean not null default true
);

create table if not exists public.crawl_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode public.crawl_run_mode not null default 'coverage',
  status public.crawl_run_status not null default 'queued',
  started_at timestamptz,
  ended_at timestamptz,
  discovered_count int not null default 0,
  enriched_count int not null default 0,
  error_count int not null default 0,
  last_error text,
  created_at timestamptz not null default now()
);

create table if not exists public.crawl_units (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  crawl_run_id uuid references public.crawl_runs(id) on delete set null,
  zip text not null references public.zip_codes(zip),
  category text not null,
  keyword text,
  status public.crawl_unit_status not null default 'pending',
  next_page_token text,
  attempt_count int not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  place_id text not null,
  name text,
  address text,
  phone text,
  categories text[] not null default '{}',
  rating numeric,
  review_count int,
  website_uri text,
  website_status public.website_status not null default 'none',
  maps_uri text,
  business_status text,
  score numeric,
  status public.lead_status not null default 'new',
  notes text,
  reminder_date date,
  discovered_at timestamptz,
  first_contacted_at timestamptz,
  first_reply_at timestamptz,
  meeting_booked_at timestamptz,
  last_contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_user_place_unique unique (user_id, place_id)
);

create table if not exists public.outreach_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  channel public.outreach_channel not null,
  note text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.demos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  slug text not null unique,
  template_id text,
  config_json jsonb not null default '{}'::jsonb,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  niche_weights jsonb not null default '{}'::jsonb,
  social_hosts text[] not null default '{facebook.com,instagram.com,linktr.ee,tiktok.com,yelp.com}',
  basic_hosts text[] not null default '{business.site,sites.google.com}',
  rate_limit_ms int not null default 500,
  max_calls_per_day int,
  max_calls_per_run int,
  max_monthly_api_spend numeric,
  stop_on_budget_limit boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists leads_user_score_idx on public.leads(user_id, score desc);
create index if not exists leads_user_status_idx on public.leads(user_id, status);
create index if not exists crawl_units_status_zip_idx on public.crawl_units(status, zip);
create index if not exists outreach_events_lead_created_idx on public.outreach_events(lead_id, created_at desc);
create index if not exists audit_logs_user_created_idx on public.audit_logs(user_id, created_at desc);

alter table public.searches enable row level security;
alter table public.crawl_runs enable row level security;
alter table public.crawl_units enable row level security;
alter table public.leads enable row level security;
alter table public.outreach_events enable row level security;
alter table public.demos enable row level security;
alter table public.settings enable row level security;
alter table public.audit_logs enable row level security;
alter table public.zip_codes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'zip_codes' and policyname = 'authenticated_can_read_zip_codes'
  ) then
    create policy authenticated_can_read_zip_codes
      on public.zip_codes
      for select
      to authenticated
      using (true);
  end if;
end $$;

create or replace function public.is_owner(target_user_id uuid)
returns boolean
language sql
stable
as $$
  select auth.uid() = target_user_id
$$;

do $$
declare
  tbl text;
  policy_name text;
begin
  foreach tbl in array array['searches', 'crawl_runs', 'crawl_units', 'leads', 'outreach_events', 'demos', 'settings', 'audit_logs']
  loop
    policy_name := format('%s_owner_select', tbl);
    if not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = tbl and policyname = policy_name
    ) then
      execute format('
        create policy %I on public.%I
        for select to authenticated
        using (public.is_owner(user_id));', policy_name, tbl);
    end if;

    policy_name := format('%s_owner_insert', tbl);
    if not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = tbl and policyname = policy_name
    ) then
      execute format('
        create policy %I on public.%I
        for insert to authenticated
        with check (public.is_owner(user_id));', policy_name, tbl);
    end if;

    policy_name := format('%s_owner_update', tbl);
    if not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = tbl and policyname = policy_name
    ) then
      execute format('
        create policy %I on public.%I
        for update to authenticated
        using (public.is_owner(user_id))
        with check (public.is_owner(user_id));', policy_name, tbl);
    end if;

    policy_name := format('%s_owner_delete', tbl);
    if not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = tbl and policyname = policy_name
    ) then
      execute format('
        create policy %I on public.%I
        for delete to authenticated
        using (public.is_owner(user_id));', policy_name, tbl);
    end if;
  end loop;
end $$;
