# Nova Trade Lean Finish Plan

- **Status:** Current execution queue
- **Updated:** 2026-09-03 (Phase A internal tool first; see "Decisions")
- **Product source:** `docs/product-requirements-multi-tenant-lead-intelligence-platform.md`
- **Handoff:** `docs/CODEX_HANDOFF.md`
- **Repository:** `https://github.com/gfd26k6879-cloud/nova-trade-lead-management`, branch `main`

This file replaces the execution queue in the historical 318-card plan. Old plans, ledgers, audits, and decision records remain reference material; they are not checklists that must be exhausted.

The work is split into two phases. **Phase A** turns the application into Nova Trade's own internal lead-intelligence tool, built to production quality and used daily by Nova Trade's team on Nova Trade's own materials. **Phase B** is the external launch to other customers and is parked: nothing in it is scheduled, and none of its gates apply to Phase A.

## Decisions

Recorded 2026-09-03 by the product owner.

1. **Phase A is an internal tool.** Nova Trade is the only tenant and the only customer. Launch-oriented gates (legal and privacy sign-off, cohort enrollment, jurisdiction policy, terms and privacy copy, tenant lifecycle administration) are Phase B. Production quality still applies: fail-closed authorization, audited mutations, rehearsed migrations, backups before production changes, recoverable workers, provider budgets and kill switches, and the full local gate before every merge.
2. **Environments.** No local Supabase stack. The hosted Supabase project behind the current site is the production database and Auth for the internal tool. Every migration is rehearsed first on a disposable PostgreSQL 16 database (the repository's existing rehearsal lanes already replay the portable migrations this way) and applied to the live project only after a backup and with the owner's go-ahead. A second hosted project for development is optional and recommended, not required.
3. **CI.** GitHub Actions stays off until Phase B. Until then every pull request runs `npm run release:check` (or the equivalent Node 24 commands below) locally before merge, and the PR description states that it did.
4. **Account model.** Phase A members are Nova Trade staff, added by an admin. Self-serve signup is Phase B.
5. **Discovery sources for Phase A.** A first-party web-search API (new source card), the existing Google Places connector, and look-alike expansion from Nova Trade's own customer list. No firmographic data-vendor contract. Directories, associations, people-data vendors, and licensed databases stay deferred.
6. **Outreach posture.** The product drafts; people send from their own tools. There is no send path, no mailbox integration, and no automation. Opt-out, do-not-contact, and bounce records are honored because they cost nothing and protect Nova Trade; consent-basis and jurisdiction gating are Phase B.
7. **Tenant zero fixtures.** Golden fixtures derive from Nova Trade's own materials. Until those are uploaded through the real product, the specialty-chemicals benchmark in `docs/product/launch-cohort-contract.md` §4.2 (metalworking-fluid components and packages, epoxy resins, and their formulator, coatings, flooring and civil-engineering, adhesives and composites, pipe-maker, and distributor targets) is the standing assumption. Generalizing to other customer types is Phase B.

## Phase A finish line

Phase A is done when Nova Trade's team uses the tool daily for Nova Trade's own pipeline, and every step below works in the browser on desktop and mobile, with keyboard and screen reader, with loading, empty, denied, and failure states covered:

1. An admin adds a team member; the member signs in and lands in the Nova Trade tenant with the right role.
2. The team describes the business through an AI interview and by uploading Nova Trade's PDFs, data sheets, catalogs, website URLs, and customer list, then corrects, marks unknown, and approves a versioned, cited business understanding.
3. The team confirms the customers it wants: reviews proposed ICPs and lead plays against explained examples and counterexamples, edits, versions, approves, activates, and rolls back.
4. The team runs a bounded, budgeted discovery through the approved sources and receives qualified U.S. companies with the evidence for each, the buying-center roles to look for, and a review queue for low-confidence cases.
5. The team approves a cited outreach draft, copies or exports it, sends it from its own tools, and records what happened; learning only proposes reversible changes.

Proof covers migration rehearsal and rollback, worker recovery, idempotency, provider budgets, kill switches, fail-closed authorization, backup and restore, and no-send behavior. Multi-tenant boundaries stay in the code and the existing tests because Phase B needs them, but Phase A has exactly one tenant and no isolation rehearsal ceremony.

**What "a lead" means in Phase A.** A qualified company, the evidence for why it fits, the roles to look for inside it, and a cited draft to copy. Named people appear only when they come from official business sources; personal mobile numbers stay out; there is no send path.

**Not in Phase A.** Automatic sending, mailbox or LinkedIn automation, self-serve signup, billing, CRM synchronization, workflow builders, legal or privacy sign-off gates, cohort enrollment, jurisdiction policy, tenant suspension, quota, support elevation and deletion administration, people-data vendors, licensed firmographic databases, directory or association crawling, and tailoring for customer types other than Nova Trade.

## Rules

1. Build vertical outcomes, not separate cards for schema, service, UI, tests, review, and documentation. Every outcome below owns its own screens; a page that renders fixture constants does not complete anything.
2. Run focused checks for the slice. Run the full gate only after shared-foundation changes or an end-to-end workflow lands, and always before merging a pull request.
3. Use a second reviewer only for authorization, destructive lifecycle work, migrations, provider policy, source cards, or outreach guardrails.
4. Ask for approval before anything that touches the live Supabase project (migrations, seeding, data changes), before deployment, before enabling a paid provider or raising its budget, and before anything that could send a message.
5. Keep automatic outreach sending out of scope. All drafts require explicit human approval and only support copy or export.
6. Land code through pull requests against `main`. No direct pushes to `main` and no history rewrites. Until GitHub Actions is enabled, the PR author runs the local gate and says so in the PR.
7. Nova Trade's real materials, customer lists, and credentials are tenant data. They go through the real upload path into the hosted tenant and never into git. Fixtures committed to the repository stay synthetic (`fixture-account-001` style).
8. Update this plan only when an L-level outcome or a recorded decision changes state. Do not create receipt, dispatch, lineage, lock-release, review-of-review, or per-commit plan tasks.

## Current position

- The repository is standalone (not a fork, no upstream) with `main` as the only long-lived branch. GitHub Actions is off by decision 3; the CI workflow file stays in place for Phase B.
- The existing lead-management code is substantially tenant-hardened. TypeScript, lint, the Vitest suite, and the production build passed on Node 24 at the September 2 checkpoint recorded in `docs/CODEX_HANDOFF.md`.
- The hosted Supabase project's migration history has not been verified since July 2026. The repository has 65 migrations (63 portable plus two Supabase-only cron and Vault migrations); the July baseline in `docs/architecture/migration-baseline.md` recorded 31, and `docs/DATA_RECOVERY.md` records a remote-only migration `20260610045957` with a forward-only reconciliation migration in the repository. Expect roughly 34 unapplied migrations plus one history repair. Nothing has been applied remotely by this plan.
- `L-01` tooling is complete: `npm run local:seed` provisions the restricted worker lease roles and seeds an admin/researcher tenant foundation (it refuses non-loopback targets unless `LOCAL_SEED_ALLOW_REMOTE=1` is set deliberately); `npm run local:dispatch` drives all five worker routes through durable leases; the env-gated `l01-local-worker-routes-postgres` rehearsal lane proves the full worker path on disposable PostgreSQL 16. What remains is running this against the hosted project and passing the authenticated browser smoke.
- Foundations exist as libraries, not as usable workflows: `src/lib/tenancy` (provisioning still reports `OWNER_ACCEPTANCE_REQUIRED`, `INVITATION_RECORD_NOT_IMPLEMENTED`, `INVITATION_DELIVERY_NOT_IMPLEMENTED`, `AUTH_USER_CREATION_NOT_IMPLEMENTED`), `src/lib/documents` and `src/lib/knowledge` (intake, extraction, chunking, claims, citations), `src/lib/understanding` (question ranking and understanding versions, no conversational surface), `src/lib/agent-runtime` (model is `openai-responses-stub`), `src/lib/strategy` (ICP, play, simulation, activation), `src/lib/connectors` (only `google_places_legacy` and `customer_list_csv_upload` adapters are registered), `src/lib/discovery` (plan, run, account resolution), `src/lib/outreach`, and `src/lib/outcomes`.
- `/onboarding` and `/knowledge` render hardcoded fixture data.
- No deployment, live migration, or paid-provider activation is authorized by this plan without the approval in rule 4.

## Execution queue

`NEXT` items are the immediate priorities: `L-01` puts the application on the hosted project and `L-02` is the spine every later step needs. `READY` can run concurrently. `WAITING` has unfinished code dependencies. `PAUSED` needs explicit authorization. `RETIRED` items are kept only so old references resolve. Phase B items are listed separately and are not scheduled.

| ID | State | Outcome | Depends on | Prior scope |
|---|---|---|---|---|
| L-01 | NEXT | Run the current application on the hosted Supabase project | owner approval for the backup, history repair, and migration apply | F-01; former "work locally" |
| L-02 | NEXT | Nova Trade's team gets into its own tenant | L-01 for final proof | former L-02; F-02–F-03; shell and admin screens from F-15–F-17 |
| L-03 | READY | Nova Trade describes its business and approves what the system understood | L-02 for real members; may start on the seeded tenant | former L-03 and the understanding half of L-04; F-04–F-07 |
| L-04 | READY | Nova Trade confirms the customers it wants (ICPs and lead plays) | L-03 | strategy half of former L-04; F-08 |
| L-05 | READY | Nova Trade finds qualified companies | L-04 for the complete flow; source card, adapters, and account foundations may proceed now | former L-05; F-09–F-12 |
| L-06 | WAITING | Nova Trade approves cited outreach and records outcomes | L-05 | former L-06; F-13–F-14 |
| L-07 | RETIRED | Finish the authenticated product UI — folded into L-02 to L-06 | — | F-15–F-17 |
| L-08 | WAITING | Prove the internal tool end to end | L-01–L-06 | pre-release acceptance |
| L-09 | PAUSED | Put the internal tool into daily use | L-08 and owner approval | F-18, without launch gates |

### L-01 — Run the current application on the hosted Supabase project

Complete when:

- the live project's migration history is read (`supabase migration list --linked`) and the remote-only `20260610045957` entry is reconciled with the repository's forward-only migration, with the repair recorded in `docs/DATA_RECOVERY.md`;
- a backup of the live project is taken and its restore is verified on a disposable PostgreSQL 16 database before anything is applied;
- all repository migrations replay green on disposable PostgreSQL 16 (the existing rehearsal lanes), then apply to the live project in order with the owner's go-ahead;
- Auth, database, worker, and provider configuration lives in ignored `.env.local` (and later in the hosting platform), never in git;
- the Nova Trade tenant, an admin, and a researcher are seeded on the live project with `LOCAL_SEED_ALLOW_REMOTE=1` set deliberately for that run; the restricted worker lease roles are provisioned and the dispatcher drives all five worker routes;
- the authenticated admin/researcher browser smoke passes against the live project.

### L-02 — Nova Trade's team gets into its own tenant

Complete when:

- an admin creates the Nova Trade tenant and adds a member; the member receives an auth user and an invitation, accepts it, and lands in the tenant with the assigned role; the four provisioning blockers listed above are gone;
- legacy rows reconcile to the Nova Trade tenant and tenant-scoped services replace the old paths;
- membership, roles, and audit work with non-enumerating failures; data export works for the tenant;
- the authenticated shell and the members and roles screens run on real services;
- rollback of the reconciliation is exercised on the disposable rehearsal database.

Suspension, quota, support elevation, and tenant deletion are Phase B.

### L-03 — Nova Trade describes its business and approves what the system understood

Complete when, starting from a fresh tenant with zero documents:

- a member completes an AI interview: the agent runtime runs a real model behind versioned prompts, budgets, leases, replay, and injection defenses; the question planner selects only high-value unresolved, conflicting, or stale questions; every answer is stored as client-provided evidence with provenance, so the understanding can cite "you told us" the way it cites a document page;
- the team uploads Nova Trade's own PDFs, data sheets, catalogs, website URLs, and customer list, which pass private upload, validation, scanning, extraction, and chunk and evidence creation on normal and adversarial fixtures;
- the system proposes a versioned business understanding with render-safe citations to interview answers and document locators; the team corrects, marks unknown, and approves;
- `/onboarding` and `/knowledge` run on real services with no fixture constants;
- a member with zero documents can finish the interview alone and still receive a draft understanding.

The model, provider, and per-day budget for the interview and understanding agents are proposed in the first `L-03` pull request and approved by the owner before any paid call.

### L-04 — Nova Trade confirms the customers it wants

Complete when:

- from the approved understanding, the system proposes ICPs and at least one lead play for Nova Trade's target segments, starting from the benchmark in decision 7 and replaced by Nova Trade's actual targets as its materials land;
- the team reviews simulated examples and counterexamples with explanations, edits, versions, approves, activates, and rolls back;
- an activated play carries its source allowlist (decision 5), budget, stop conditions, qualification rubric, review gates, and success metrics;
- the strategy screens run on real services.

### L-05 — Nova Trade finds qualified companies

Complete when:

- a `web_search_api` source card exists in `docs/product/source-connector-allowlist.md` with allowed operations, stored fields, retention, budget, credential class, freshness, and kill behavior; the provider is a first-party search API used under its own terms (Brave Search API, Google Programmable Search JSON API, or Exa class), because a proxy that scrapes search-engine result pages is `bypass_scraping` and stays blocked;
- the web-search adapter and an official-company-website verification adapter (`public_official_company_website` / `tenant_authorized_urls`) are registered beside `google_places_legacy` and `customer_list_csv_upload`;
- look-alike expansion turns Nova Trade's resolved customer list into positive examples and query seeds and excludes existing customers from results;
- an approved play runs a bounded, budgeted, resumable discovery through the approved sources with a cost preview and stop conditions; observations resolve into reversible canonical U.S. accounts with merge history;
- qualification is play-specific, explainable, reproducible, and freshness-aware; low-confidence and conflicting cases route to a review queue;
- buying-center role hypotheses are shown separately from verified people; contacts come only from official business sources and carry source and freshness state;
- the team sees the ranked accounts, the evidence behind each, and the review queue in the browser.

### L-06 — Nova Trade approves cited outreach and records outcomes

Complete when:

- for a qualified account, the system drafts outreach using only approved Nova Trade facts and account evidence, with claim citations;
- unsupported claims and any opt-out, do-not-contact, or bounce record fail closed;
- a member approves the exact versions and copies or exports; there is no send path;
- outcomes (sent from own tools, replied, meeting, disqualified, won, lost, opt-out) are recorded and correctable, and learning only proposes reversible changes;
- the outreach and outcome screens run on real services.

### L-08 — Prove the internal tool end to end

One automated happy path walks the Nova Trade journey (`L-02` to `L-06`) on the golden fixture set against a disposable database, and critical degraded paths prove worker recovery, idempotency, migration and rollback, budgets, kill switches, fail-closed authorization, and no-send behavior.

### L-09 — Put the internal tool into daily use

The `L-08` suite is green; the production configuration for the hosting platform and the hosted Supabase project is reviewed; backup and restore has been rehearsed once more against the current schema; the deployment is made with the owner's explicit approval; and Nova Trade's team is added and using the tool. No legal sign-off, cohort ceremony, or external-launch gate applies here.

## Phase B — external launch (parked)

Nothing below is scheduled. It becomes a queue only when the owner opens Phase B after `L-09`.

- Self-serve signup: email verification, policy acknowledgements, per-tenant spend caps, abuse controls, updated public terms and privacy copy (the terms page currently says "not a self-serve public product", which is correct for Phase A).
- Generalize beyond Nova Trade: a second, non-industrial synthetic fixture family (`docs/product/launch-cohort-contract.md` §4.3) exercising the same contracts; everything Nova Trade-specific in `L-03` to `L-06` becomes tenant configuration.
- GitHub Actions on every pull request and push to `main`.
- Legal and privacy review of contact use and copy/export for the launch jurisdictions; activation of the launch-cohort, contact-use, and outreach-policy contracts as gates; jurisdiction and consent-basis suppression states.
- Tenant lifecycle administration: suspension, quota, support elevation with time-bound audited access, tenant deletion and retention.
- Cross-tenant isolation rehearsal as a release gate, staging rehearsal, and a formal go/no-go.
- Billing, and any data-vendor or licensed-database contract that a paying customer justifies.

## Concurrency

Use one integration owner and put every remaining slot on a ready, non-overlapping slice. Do not wait for a wave to finish.

Good parallel starting lanes are:

- L-01: migration history check, backup and restore rehearsal, migration replay, hosted seeding, authenticated smoke;
- L-02: member creation and invitation acceptance, auth user creation, owner acceptance, members and roles screens;
- L-03: interview surface over the agent runtime; upload-to-citation vertical slice;
- L-04: ICP and play review screens over the existing strategy contracts;
- L-05: `web_search_api` source card and adapter; official-website verification adapter; look-alike expansion; account foundations.

Only serialize actual shared writes:

- one writer at a time in `supabase/migrations/` and the SQLite schema;
- one writer at a time in `src/lib/db/queries.ts` or tenant transaction plumbing;
- one writer at a time in `src/lib/connectors/adapter-contract.ts` and the source-policy registry;
- the producer owns a shared contract while consumers use adapters;
- the integration owner handles `package.json`, lockfiles, and global test and build configuration.

A worker handoff is one short report: objective, changed files, checks run, and real blockers. No conductor hierarchy, permanent packet ledger, path-claim ceremony, worktree, or extra review task is required unless an actual collision occurs.

## Verification

For a slice, run the smallest relevant tests plus typecheck and lint for touched code. At a shared-foundation or workflow boundary, and before every merge while GitHub Actions is off, run:

```bash
npx -y node@24 ./node_modules/typescript/bin/tsc --noEmit
npx -y node@24 ./node_modules/eslint/bin/eslint.js .
npx -y node@24 ./node_modules/vitest/vitest.mjs run
npx -y node@24 ./node_modules/next/dist/bin/next build
git diff --check
```

`L-01` and `L-08` additionally require real authenticated browser and worker execution. `L-02` to `L-06` each require a real authenticated browser walkthrough of their step of the Nova Trade journey; passing unit tests alone, or a screen rendered from fixture constants, does not complete them.

## Deferred

Defer automatic sending, mailboxes, LinkedIn automation, autonomous campaigns, live bidirectional CRM sync, billing, people-data vendors, licensed firmographic databases, directory and association crawling, non-English or legacy binary media ingestion, custom roles, generalized workflow builders, and performance tuning without a measured failing workload. Everything in Phase B is deferred by definition.

Deferred work does not block `L-09` and should not be added to this queue without a concrete operational need at Nova Trade.
