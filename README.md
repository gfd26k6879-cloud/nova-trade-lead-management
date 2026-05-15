# NoSite Leads

For the fastest complete system map, use `docs/ULTRA_SYSTEM_ATLAS.md`. For production deployment, use `docs/VERCEL_SUPABASE_DEPLOYMENT.md`.

**Source of truth:** GitHub and Vercel deploy from `/Users/stevmq/lead-generation`. Do not use similarly named local folders for application changes unless they have first been reconciled into this Git repo.

Private single-user lead discovery and outreach CRM (Customer Relationship Management) for website-sales side hustle operations. Discovers local businesses with weak or missing websites via Google Places API (Application Programming Interface), scores and prioritizes them, and provides outreach tools to convert leads.

## Architecture

```
Next.js App Router (TypeScript)
??? Supabase Postgres in production, SQLite locally without DATABASE_URL
├── Google Places API (New) — lead discovery & enrichment
├── Server Actions — mutations (crawl, leads, settings)
├── API Routes — crawl polling, CSV export, health check
└── Liquid Glass UI — Tailwind CSS custom theme
```

**Data flow:** Dashboard starts a crawl run -> sequential worker processes zip+category units -> Places API text search -> classify website -> compute score -> upsert lead -> UI displays results.

## Tech Stack

- Next.js 16 + React 19 + TypeScript
- Tailwind CSS with Apple Liquid Glass-inspired theme
- Supabase Postgres via `postgres` in production
- SQLite via `better-sqlite3` for local development and migration export
- Zod for server action input validation
- Vitest for unit tests
- Sonner for toast notifications

## Project Structure

```
src/
├── app/
│   ├── (protected)/          # Auth-gated routes
│   │   ├── dashboard/        # Crawl controls, stats, metrics
│   │   ├── coverage/         # Zip-by-zip crawl progress
│   │   ├── leads/            # Leads table + detail pages
│   │   ├── queue/            # Now Queue — top actionable leads
│   │   └── settings/         # Niche weights, hosts, budget
│   ├── api/
│   │   ├── crawl/process-next/  # Crawl worker polling endpoint
│   │   ├── export/csv/          # CSV export endpoint
│   │   └── health/              # Health check
│   ├── login/                # Authentication
│   ├── error.tsx             # Error boundary
│   ├── not-found.tsx         # Custom 404
│   └── layout.tsx            # Root layout + Toaster
├── components/
│   ├── page-shell.tsx        # Reusable page layout
│   ├── nav-header.tsx        # Responsive navigation
│   └── confirm-dialog.tsx    # Reusable confirmation modal
├── lib/
│   ├── db/
?   ?   ??? index.ts          # SQLite/Postgres connection adapter
│   │   ├── schema.ts         # All CREATE TABLE statements
│   │   ├── queries.ts        # Typed data access layer
│   │   └── seed-zips.ts      # Colorado zip code seeder
│   ├── crawl/
│   │   ├── worker.ts         # Sequential crawl unit processor
│   │   └── actions.ts        # Crawl run server actions
│   ├── leads/
│   │   └── actions.ts        # Lead CRUD + outreach server actions
│   ├── settings/
│   │   └── actions.ts        # Settings server actions
│   ├── google-places.ts      # Places API client with retry
│   ├── classify-website.ts   # Website status classifier
│   ├── scoring.ts            # Lead scoring with factor breakdown
│   ├── outreach-package.ts   # Template-based outreach generator
│   ├── auth.ts               # Local cookie-based auth
│   └── __tests__/            # Unit tests
└── data/
    └── colorado-zips.json    # Static zip code dataset
```

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy env template and set Supabase Auth plus API keys:

   ```bash
   cp .env.example .env.local
   ```

   Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `NOSITE_BOOTSTRAP_ADMIN_EMAIL`, and
   `NOSITE_ENCRYPTION_SECRET`. Create the bootstrap admin email/password in
   Supabase Auth before logging in.

3. Get a Google Places API key:

   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a project (or select existing)
   - Enable the "Places API (New)" service
   - Create an API key under Credentials
   - Add it to `.env.local` as `GOOGLE_PLACES_API_KEY=your_key_here`

4. Start the app:

   ```bash
   npm run dev
   ```

5. Visit `http://localhost:3000` and sign in with the credentials from `.env.local`.

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run test` | Run unit tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Run ESLint |
| `npm run test:e2e` | Run Playwright E2E tests |
| `npm run db:export:sqlite` | Export ignored JSON files from local SQLite |
| `npm run db:import:supabase` | Import exported JSON into Supabase Postgres |

## Key Features

### Discovery Engine
- Sequential zip-code-by-zip-code coverage of Colorado
- Google Places API Text Search with pagination
- Deduplication by place_id
- Resume-safe crawl runs with start/pause/resume

### Website Classification
- Categorizes businesses as `none`, `social`, `basic`, or `custom`
- Configurable host lists for social and basic site detection

### Scoring & Ranking
- Formula: `log(1 + reviews) * rating * niche_weight * website_multiplier`
- Explainable score factor breakdown on lead detail
- Recompute all scores when settings change

### CRM & Outreach
- Lead status pipeline: new -> verified -> contacted -> preview_sent -> meeting_set -> closed
- Outreach event logging with timeline
- Now Queue with top 25 actionable leads
- Template-based outreach package generator with copy-to-clipboard
- Reminder dates and conversion tracking

### Budget Controls
- Max API calls per run and per day
- Auto-pause when budget limits are reached
- API cost estimation on dashboard

### Export
- CSV export with filter-aware query parameters

## Database

Local development uses SQLite at `nosite-leads.db` when `DATABASE_URL` is not set. Production uses Supabase Postgres through the `DATABASE_URL` transaction pooler connection string. The current Postgres schema is in `supabase/migrations/202605110001_full_schema.sql`.

Core tables:

- `zip_codes` — Colorado zip codes with city/lat/lng
- `crawl_runs` — Run metadata and status
- `crawl_units` — Individual zip+category processing units
- `leads` — Discovered businesses with scores
- `outreach_events` — Contact history per lead
- `settings` — Configuration (niche weights, hosts, budget)
- `audit_logs` — Key action history
- `place_cache` — Raw API response cache

## Known Limitations

- Single-user only (environment-configured credentials)
- Crawl processing requires browser tab to be open (client-side polling)
- No automated outreach sending (copy-to-clipboard only)
- Colorado zip codes only by default (expandable via data file)
- Single-admin auth remains the v1 production model

## API Compliance

This application uses only official Google Places API (New) endpoints. No scraping of Google Search or Google Maps pages. No review text is stored or displayed.
