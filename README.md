# NoSite Leads

Private single-user lead discovery workspace for website-sales side hustle operations.

## Phase 1 Status

Implemented in this milestone:

- Next.js App Router foundation with TypeScript and Tailwind.
- Supabase authentication baseline (email/password).
- Protected app routes (`/dashboard`, `/coverage`, `/leads`, `/leads/[id]`, `/settings`).
- Foundational Postgres migration and row-level security (RLS) (row-level security) policies.
- Deployment baseline docs, env template, and health endpoint.

Deferred to Phase 2+:

- Sequential crawl unit worker and Google Places API (application programming interface) integration.
- Enrichment/scoring pipelines and queue prioritization logic.
- Demo builder details and model-based scoring.

## Tech Stack

- Next.js 16 + React 19 + TypeScript
- Tailwind CSS (Cascading Style Sheets)
- Supabase Auth + Postgres
- Zod (installed for request/data validation in next phases)

## Project Structure

- `src/app/(protected)` - authenticated app route group and page shells
- `src/app/login` - login page and server actions
- `src/app/api/health/route.ts` - health check endpoint
- `src/lib/supabase` - Supabase client/server/middleware helpers
- `supabase/migrations` - SQL migrations and RLS policies
- `prd.md` - product requirements document
- `prompt.strict-agent.md` - execution planning document

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy env template and set values:

   ```bash
   cp .env.example .env.local
   ```

3. Fill required variables in `.env.local`:

   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

4. Create at least one user in Supabase Auth (email/password).

5. Start the app:

   ```bash
   npm run dev
   ```

6. Visit `http://localhost:3000` and sign in.

## Database and RLS

- Phase 1 migration file:
  - `supabase/migrations/202602190001_phase1_foundations.sql`
- Includes:
  - foundational tables (`searches`, `leads`, `crawl_runs`, `crawl_units`, `settings`, `audit_logs`, etc.)
  - enum types
  - indexes for key query paths
  - RLS policies for user-owned tables

Apply migration using your Supabase workflow (local DB or hosted SQL editor).

## Private Deployment Baseline

Recommended baseline for private always-on usage:

- Host Next.js in a private deployment environment.
- Store secrets in platform secret manager (never client-exposed).
- Use HTTPS-only domain access.
- Restrict access with strong credentials and optional IP allowlist.

## Monitoring and Health

- Health endpoint: `GET /api/health`
- Suggested checks:
  - external uptime monitor ping every 1-5 minutes
  - alert when non-200 or response timeout
- Error monitoring baseline:
  - capture server errors from deployment logs
  - add error tracking service in Phase 2 as needed

## Commands

- `npm run dev` - run local dev server
- `npm run lint` - run ESLint checks
- `npm run build` - production build verification
