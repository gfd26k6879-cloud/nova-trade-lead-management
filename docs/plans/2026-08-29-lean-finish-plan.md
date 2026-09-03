# Nova Trade Lean Finish Plan

- **Status:** Current execution queue
- **Updated:** 2026-09-03 (re-cut around the tenant-owner journey; see "Decisions")
- **Product source:** `docs/product-requirements-multi-tenant-lead-intelligence-platform.md`
- **Handoff:** `docs/CODEX_HANDOFF.md`
- **Repository:** `https://github.com/gfd26k6879-cloud/nova-trade-lead-management`, branch `main`

This file replaces the execution queue in the historical 318-card plan. Old plans, ledgers, audits, and decision records remain reference material; they are not checklists that must be exhausted.

The 2026-09-03 revision keeps `L-01`, `L-08`, and `L-09` as they were, folds the former "finish the UI" item into every outcome, and rewrites `L-02` to `L-06` as steps a real business owner takes in the browser. Prior scope references are kept in the queue so old receipts still map to the new items.

## Decisions

Recorded 2026-09-03 by the product owner.

1. **Account model.** The first release is invite-only. Self-serve signup is `L-10` and starts immediately after the `L-09` go/no-go, not "when a need appears". Billing stays undecided.
2. **Discovery sources for release one.** A licensed first-party web-search API (new source card), the existing Google Places connector, and look-alike expansion from tenant-provided customer lists. No firmographic data-vendor contract yet. Directories, associations, people-data vendors, and licensed databases stay deferred.
3. **Tenant zero.** Nova Trade itself is the first tenant and the first customer. The product is tailored to Nova Trade's own oil and chemical business first and generalized to other customer types afterwards (`L-11`). Golden fixtures derive from Nova Trade's own materials; until those are uploaded through the real product, the specialty-chemicals benchmark in `docs/product/launch-cohort-contract.md` §4.2 (metalworking-fluid components and packages, epoxy resins, and their formulator, coatings, flooring and civil-engineering, adhesives and composites, pipe-maker, and distributor targets) is the standing assumption.

## Finish line

The first release is done when Nova Trade, operating as an invited tenant on its own materials, can do all of the following in the browser, on desktop and mobile, with keyboard and screen reader, with loading, empty, denied, and failure states covered:

1. Accept an invitation, sign in, and land in an isolated tenant that another tenant cannot read through UI, server actions, API, workers, export, cache, search, or agent context.
2. Describe the business through an AI interview and by uploading its own PDFs, data sheets, catalogs, website URLs, and customer list, then correct, mark unknown, and approve a versioned, cited business understanding.
3. Confirm the kind of customer it wants: review proposed ICPs and lead plays against explained examples and counterexamples, edit, version, approve, activate, and roll back.
4. Run a bounded, budgeted discovery through the approved sources and receive qualified U.S. companies with the evidence for each, the buying-center roles to look for, and a review queue for low-confidence cases.
5. Approve a cited outreach draft for copy or export only, and record what happened afterwards; learning only proposes reversible changes.

Local and staging proof must cover isolation, recovery, migration safety, provider budgets, and fail-closed behavior.

**What "a lead" means in release one.** A qualified company, the evidence for why it fits, the roles to look for inside it, and a cited draft to copy. Named people appear only when they come from official business sources under the contact-use policy; personal email and personal mobile stay blocked; there is no send path.

**Not in release one.** Automatic sending, mailbox or LinkedIn automation, self-serve signup (`L-10`), billing, broad CRM synchronization, generalized workflow builders, non-U.S. policy, people-data vendors, licensed firmographic databases, directory or association crawling, and tailoring for customer types other than Nova Trade (`L-11`).

## Rules

1. Build vertical outcomes, not separate cards for schema, service, UI, tests, review, and documentation. Every outcome below owns its own screens; a page that renders fixture constants does not complete anything.
2. Run focused checks for the slice. Run the full gate only after shared-foundation changes or an end-to-end workflow lands.
3. Use a second reviewer only for tenant isolation, authorization, destructive lifecycle work, migrations, provider policy, source cards, or outreach guardrails.
4. Ask for approval only before external or costly actions: remote migrations, deployment, production or customer data, paid providers, new source-card activation, enrollment, or sending.
5. Keep automatic outreach sending out of scope. All drafts require explicit human approval and only support copy or export.
6. Land code through pull requests against `main`. CI (`npm run release:check`) must pass on every pull request; there are no direct pushes to `main` and no history rewrites.
7. Nova Trade's real materials, customer lists, and credentials are tenant data. They go through the real upload path into a local or staging tenant and never into git. Fixtures committed to the repository stay synthetic (`fixture-account-001` style) as the launch cohort contract requires.
8. Update this plan only when an L-level outcome or a recorded decision changes state. Do not create receipt, dispatch, lineage, lock-release, review-of-review, or per-commit plan tasks.

## Current position

- The repository is standalone (not a fork, no upstream) with `main` as the only long-lived branch and a CI workflow on pull requests and pushes to `main`. GitHub Actions has not executed a run yet; enabling it in the repository settings is a prerequisite for rule 6.
- The existing lead-management code is substantially tenant-hardened. TypeScript, lint, the Vitest suite, and the production build passed on Node 24 at the September 2 checkpoint recorded in `docs/CODEX_HANDOFF.md`.
- `L-01` implementation is complete: `npm run local:seed` provisions the restricted worker lease roles and seeds an admin/researcher tenant foundation; `npm run local:dispatch` drives all five worker routes through durable leases; the env-gated `l01-local-worker-routes-postgres` rehearsal lane proves the full worker path on disposable PostgreSQL 16. The `L-01` completion gate still needs the authenticated admin/researcher browser smoke against a local Supabase Auth stack (Supabase CLI on a machine with Docker).
- Foundations exist as libraries, not as usable workflows: `src/lib/tenancy` (provisioning still reports `OWNER_ACCEPTANCE_REQUIRED`, `INVITATION_RECORD_NOT_IMPLEMENTED`, `INVITATION_DELIVERY_NOT_IMPLEMENTED`, `AUTH_USER_CREATION_NOT_IMPLEMENTED`), `src/lib/documents` and `src/lib/knowledge` (intake, extraction, chunking, claims, citations), `src/lib/understanding` (question ranking and understanding versions, no conversational surface), `src/lib/agent-runtime` (model is `openai-responses-stub`), `src/lib/strategy` (ICP, play, simulation, activation), `src/lib/connectors` (only `google_places_legacy` and `customer_list_csv_upload` adapters are registered), `src/lib/discovery` (plan, run, account resolution), `src/lib/outreach`, and `src/lib/outcomes`.
- `/onboarding` and `/knowledge` render hardcoded fixture data. The public terms page describes the product as "not a self-serve public product", which stays true until `L-10`.
- No deployment, remote migration, staging environment, or paid-provider activation is authorized by this plan.

## Execution queue

`NEXT` items are the immediate integration priorities: `L-01` closes the local runtime gate and `L-02` is the spine every later step needs. `READY` can run concurrently. `WAITING` has unfinished code dependencies. `PAUSED` needs explicit authorization or a later environment. `RETIRED` items are kept only so old references resolve.

| ID | State | Outcome | Depends on | Prior scope |
|---|---|---|---|---|
| L-01 | NEXT | Make the current application work locally | — | F-01 |
| L-02 | NEXT | Nova Trade gets its own tenant by invitation | L-01 for final proof | former L-02; F-02–F-03; shell and tenant-admin screens from F-15–F-17 |
| L-03 | READY | Nova Trade describes its business and approves what the system understood | L-02 for a real tenant; may start on the L-01 seeded tenant | former L-03 and the understanding half of L-04; F-04–F-07 |
| L-04 | READY | Nova Trade confirms the customers it wants (ICPs and lead plays) | L-03 | strategy half of former L-04; F-08 |
| L-05 | READY | Nova Trade finds qualified companies | L-04 for the complete flow; source card, adapters, and account foundations may proceed now | former L-05; F-09–F-12 |
| L-06 | WAITING | Nova Trade approves cited outreach and records outcomes | L-05 | former L-06; F-13–F-14 |
| L-07 | RETIRED | Finish the authenticated product UI — folded into L-02 to L-06 | — | F-15–F-17 |
| L-08 | WAITING | Prove the full application locally | L-01–L-06 | pre-release acceptance |
| L-09 | PAUSED | Rehearse and approve the release candidate | L-08 and user authorization | F-18 |
| L-10 | PAUSED | Self-serve signup | L-09 go/no-go | new (decision 1) |
| L-11 | PAUSED | Generalize beyond Nova Trade | L-09 go/no-go; may overlap L-10 | new (decision 3); launch cohort contract §4.3 |

### L-01 — Make the current application work locally

Complete when local Supabase Auth and PostgreSQL start; migrations apply; admin, tenant, workspace, membership, role, and policy are seeded; restricted worker roles and a dispatcher run all five worker routes; and the authenticated admin/researcher browser smoke passes.

### L-02 — Nova Trade gets its own tenant by invitation

Complete when:

- a platform admin creates the Nova Trade tenant and invites an owner; the owner accepts, receives an auth user, acknowledges the source and outreach policies, and lands in the tenant with the owner role; the four provisioning blockers listed above are gone;
- legacy rows reconcile to a compatibility tenant and tenant-scoped services replace the old paths;
- membership, roles, audit, data export, and deletion work with non-enumerating failures; suspension, quota, and support elevation are minimal but fail closed;
- the authenticated shell and tenant-admin screens (members, roles, policy acknowledgements, export, deletion) run on real services;
- rollback is exercised locally.

### L-03 — Nova Trade describes its business and approves what the system understood

Complete when, starting from a fresh tenant with zero documents:

- the owner completes an AI interview: the agent runtime runs a real model behind versioned prompts, budgets, leases, replay, and injection defenses; the question planner selects only high-value unresolved, conflicting, or stale questions; every answer is stored as client-provided evidence with provenance, so the understanding can cite "you told us" the way it cites a document page;
- the owner uploads Nova Trade's own PDFs, data sheets, catalogs, website URLs, and customer list, which pass private upload, validation, quarantine and scanning, extraction, and chunk and evidence creation on normal and adversarial fixtures;
- the system proposes a versioned business understanding with render-safe citations to interview answers and document locators; the owner corrects, marks unknown, and approves;
- `/onboarding` and `/knowledge` run on real services with no fixture constants;
- an owner with zero documents can finish the interview alone and still receive a draft understanding.

### L-04 — Nova Trade confirms the customers it wants

Complete when:

- from the approved understanding, the system proposes ICPs and at least one lead play for Nova Trade's target segments, starting from the launch-cohort benchmark and replaced by Nova Trade's actual targets as its materials land;
- the owner reviews simulated examples and counterexamples with explanations, edits, versions, approves, activates, and rolls back;
- an activated play carries its source allowlist (decision 2), budget, stop conditions, qualification rubric, review gates, outreach policy, and success metrics;
- the strategy screens run on real services.

### L-05 — Nova Trade finds qualified companies

Complete when:

- a `licensed_web_search_api` source card exists in `docs/product/source-connector-allowlist.md` with owner, allowed operations, stored fields, retention, jurisdiction, budget, terms-review state, credential class, freshness, and kill behavior; the provider is a first-party search API under its own terms, because a proxy that scrapes search-engine result pages is `bypass_scraping` and stays blocked;
- the web-search adapter and an official-company-website verification adapter (`public_official_company_website` / `tenant_authorized_urls`) are registered beside `google_places_legacy` and `customer_list_csv_upload`;
- look-alike expansion turns Nova Trade's resolved customer list into positive examples and query seeds and excludes existing customers from results;
- an approved play runs a bounded, budgeted, resumable discovery through the approved sources with a cost preview and stop conditions; observations resolve into reversible canonical U.S. accounts with merge history;
- qualification is play-specific, explainable, reproducible, and freshness-aware; low-confidence and conflicting cases route to a review queue;
- buying-center role hypotheses are shown separately from verified people; contacts come only from official business sources and carry source, consent, and freshness state;
- the owner sees the ranked accounts, the evidence behind each, and the review queue in the browser.

### L-06 — Nova Trade approves cited outreach and records outcomes

Complete when:

- for a qualified account, the system drafts outreach using only approved Nova Trade facts and account evidence, with claim citations;
- unsupported or prohibited claims and any suppression state other than `clear` fail closed;
- a human approves the exact versions and copies or exports; there is no send path;
- outcomes (sent elsewhere, replied, meeting, disqualified, won, lost, opt-out) are recorded and correctable, and learning only proposes reversible changes;
- the outreach and outcome screens run on real services.

### L-08 — Prove the full application locally

One automated local happy path walks the Nova Trade journey (`L-02` to `L-06`) on the golden fixture set, and critical degraded paths prove tenant isolation, worker recovery, idempotency, migration and rollback, lifecycle cleanup, logging, budgets, kill switches, and no-send behavior.

### L-09 — Rehearse and approve the release candidate

The `L-08` suite passes in staging, production configuration is reviewed, backup and restore is rehearsed, and the named owner records one go/no-go decision. Deployment remains a separate explicit action.

### L-10 — Self-serve signup

Complete when a business owner can create an account and tenant without an invitation: email verification, policy and source and outreach acknowledgements, per-tenant AI and provider spend caps, abuse controls, and updated public terms copy. Billing remains a separate decision.

### L-11 — Generalize beyond Nova Trade

Complete when a second, non-industrial synthetic fixture family exercises the same interview, understanding, ICP, play, discovery, and outreach contracts with different questions, signals, and claim classes, and everything tailored to Nova Trade in `L-03` to `L-06` has become tenant configuration rather than code.

## Concurrency

Use one integration owner and put every remaining slot on a ready, non-overlapping slice. Do not wait for a wave to finish.

Good parallel starting lanes are:

- L-01: local Supabase, bootstrap, worker dispatcher, authenticated smoke;
- L-02: invitation acceptance, auth user creation, owner acceptance, tenant-admin screens;
- L-03: interview surface over the agent runtime; upload-to-citation vertical slice;
- L-04: ICP and play review screens over the existing strategy contracts;
- L-05: `licensed_web_search_api` source card and adapter; official-website verification adapter; look-alike expansion; account foundations.

Only serialize actual shared writes:

- one writer at a time in `supabase/migrations/` and the SQLite schema;
- one writer at a time in `src/lib/db/queries.ts` or tenant transaction plumbing;
- one writer at a time in `src/lib/connectors/adapter-contract.ts` and the source-policy registry;
- the producer owns a shared contract while consumers use adapters;
- the integration owner handles `package.json`, lockfiles, and global test and build configuration.

A worker handoff is one short report: objective, changed files, checks run, and real blockers. No conductor hierarchy, permanent packet ledger, path-claim ceremony, worktree, or extra review task is required unless an actual collision occurs.

## Verification

For a slice, run the smallest relevant tests plus typecheck and lint for touched code. At a shared-foundation or workflow boundary, run:

```bash
npx -y node@24 ./node_modules/typescript/bin/tsc --noEmit
npx -y node@24 ./node_modules/eslint/bin/eslint.js .
npx -y node@24 ./node_modules/vitest/vitest.mjs run
npx -y node@24 ./node_modules/next/dist/bin/next build
git diff --check
```

`L-01` and `L-08` additionally require real authenticated browser and worker execution. `L-02` to `L-06` each require a real authenticated browser walkthrough of their step of the Nova Trade journey; passing unit tests alone, or a screen rendered from fixture constants, does not complete them.

## Deferred

Defer automatic sending, mailboxes, LinkedIn automation, autonomous campaigns, live bidirectional CRM sync, billing, people-data vendors, licensed firmographic databases (revisit when a paying customer justifies the contract), directory and association crawling, non-U.S. policy, non-English or legacy binary media ingestion, custom roles, generalized workflow builders, and performance tuning without a measured failing workload.

Deferred work does not block `L-09` and should not be added to this queue without a concrete customer or operational need.
