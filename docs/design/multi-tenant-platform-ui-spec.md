# Nova Trade multi-tenant platform UI specification

**Artifact:** UI-000 draft visual and interaction specification

**Status:** DRAFT — awaiting product, design, accessibility, engineering, and security signoff

**Target viewports:** desktop `1440 × 1100`; mobile `390 × 900`
**Authority:** D-001 tenant/workspace contract, D-002 RBAC matrix, PRD §8 journeys, and UI-000–UI-040 implementation plan. This document specifies presentation and interaction; server authority, permissions, policy versions, and audit rules remain controlling.

## 1. Product character and screen job

Nova Trade is a dense, evidence-first operating console. Its job is to let a tenant member move from approved business knowledge to bounded research and human-reviewed outreach while keeping scope, provenance, policy, and irreversible consequences visible. Preserve the current warm terracotta/ink glass language and Geist typography: calm, precise, tactile, and operational rather than decorative.

The design extends existing tokens and primitives in `src/app/globals.css`, `NavHeader`, and `PageShell`. It adds no library and does not prescribe application code. Glass is a hierarchy device: heavy glass for scope and page headers, regular glass for work surfaces, muted surfaces for secondary context. Never blur dense table text or place multiple translucent layers behind body copy.

## 2. Information architecture and shell

### 2.1 Route groups

Permission-aware navigation exposes capabilities, never role-name shortcuts. Unknown permission or scope denies and hides mutation actions.

| Group | Destinations | Persistent cue |
|---|---|---|
| Strategy | Knowledge, ICPs, lead plays | version/status and unresolved count |
| Research | Discovery, accounts, contacts, review queue | active run/review counts |
| Engagement | Drafts, approvals, outcomes | “draft/copy/export only”; never “sent” without recorded outcome |
| Reports | Funnel, evidence, cost, learning | filters and denominator |
| Administration | Tenant/workspaces, members, connectors, governance, audit/support | scope, health, dangerous-operation gates |
| Legacy compatibility | Existing Dashboard, Leads, Explore, Queue, Coverage and operational pages | explicit “Legacy” label and unchanged reachability |

#### Current-to-planned route IA and migration contract

The current protected routes remain authoritative until their planned replacements have capability parity, tenant-isolation evidence, and an independently approved redirect. Planned routes MUST NOT capture a current path merely because the labels sound similar. Redirects preserve the query string and fragment only when the destination defines the same filter keys and object identity; otherwise the legacy page stays reachable and offers an explicit, audited cross-link. Nested paths never fall through to a different tenant or object, and an unknown/colliding identifier returns `STATE-FORBIDDEN` or `STATE-ERROR-TERMINAL`, never a best-effort match.

| Current route | Current job / capability | Planned route | Planned capability | Launch migration, preservation, and collision rule |
|---|---|---|---|---|
| `/explore` | Legacy place/map exploration; `legacy:lead_read`, `account:read` | `/discovery` | Play-driven plan and run setup; `source:plan` / `source:approve` / `source:execute` | Preserve `/explore` under **Legacy**. No redirect: “explore” inventory and a bounded discovery plan are not equivalent. Cross-link only after an active play and permitted source scope exist. |
| `/queue` | Legacy assigned call/follow-up workbench; `legacy:lead_read`, `queue:read`, `queue:operate` | `/accounts` and `/reviews` | Tenant account queue (`account:read`) and typed human review (`review:read` / `review:decide`) | Preserve `/queue`; never guess between accounts and reviews. Provide two explicit destinations with current filters translated only when an exact mapping exists. |
| `/leads` | Legacy lead inventory/detail; `legacy:lead_read` plus bounded legacy mutation permissions | `/accounts` | Canonical tenant accounts and contacts; `account:read` / `account:edit` | Preserve `/leads` and its IDs. No automatic ID redirect because a legacy lead is not necessarily a canonical account; show a planned account link only after an audited resolution record exists. |
| `/statistics` | Legacy pipeline statistics; current view/crawl gate | `/reports` | Defined, tenant-safe metrics; `report:read` (and `report:manage` for saved definitions) | Preserve `/statistics` until every visible metric has denominator/date/scope parity. Then an approved redirect may preserve only mapped filters; unmatched filters remain on Legacy with an explanation. |
| `/users` | Legacy global-user administration; current `users:manage` | `/admin/members` | Tenant memberships, fixed roles, workspace assignment; `membership:read`, `membership:invite`, `membership:manage`, `role:assign` | Preserve `/users` for the compatibility tenant until identity/profile and membership migration is complete. Never redirect a global user ID into a membership ID. After parity, redirect the collection route only; detail links require an explicit membership mapping. |
| — | No current equivalent | `/discovery`, `/accounts`, `/reports`, `/admin/members` | New tenant-aware capabilities above | Planned paths remain feature-gated and fail closed until their backend contracts exist. They do not alias current routes during draft UI work. |

### 2.2 Desktop shell — `SHELL-DESKTOP-DEFAULT`

- Sticky 64 px top bar: brand at left; tenant/workspace scope switcher next; grouped product navigation; review/activity indicators; theme, account, and admin disclosure at right.
- Scope switcher always names tenant, workspace or “Tenant-wide,” and effective role. Switching first invalidates scoped data, then displays a blocking scoped loading surface; prior-scope content must not remain visible.
- Body max width 1360 px with 24 px gutters. A 240 px contextual rail is allowed for section navigation; workbench layouts use `minmax(0, 1fr) 360px` evidence/context split. Dense lists can consume the full width.
- Page header derives from `PageShell`: breadcrumb/eyebrow, 24 px title, concise description, authoritative status and up to four stat pills. Primary action sits at the trailing edge; one clear primary action per screen.
- Tables keep header and identity column sticky only when necessary. Horizontal scrolling is contained and labeled; consequential columns do not disappear without an equivalent row-detail view.

### 2.3 Mobile shell — `SHELL-MOBILE-DEFAULT`

- Sticky 56 px bar: brand, compact scope button, notifications, menu. Scope and product navigation open separate full-width disclosures; Escape closes and restores focus.
- 16 px page gutters; content is single column. Tables become cards or a labeled horizontal region only when comparison is essential.
- A bottom action dock may hold one primary and one secondary action. It must not obscure focused controls, system zoom, or the final content row; include safe-area padding.
- Workbench context becomes ordered accordions: decision → proposal → evidence → history. Preserve evidence beside the decision conceptually, with direct “View citation” anchors and a return-to-decision link.

### 2.4 Scope and authorization states

Within either shell contract, `STATE-NO-SCOPE`, `STATE-PENDING`, `STATE-DISABLED`, `STATE-SUSPENDED`, and `STATE-ERROR-RETRY` replace the page body; no separate `SHELL-*` aliases exist. Suspended/archived tenants remain readable only where D-001/D-002 permit. A forbidden action is absent; a forbidden deep link renders `STATE-FORBIDDEN` with scope, required capability phrased in plain language, and a safe back destination. Never expose other tenant IDs, names, counts, cached content, or provider errors.

## 3. Visual system

### 3.1 Existing token contract

- Canvas: `--background` (`#f0eae4` light / `#141412` dark); ink: `--text-primary`; supporting ink: `--text-secondary`, `--text-tertiary`.
- Brand/action: `--accent` terracotta `#b5533d`, hover `--accent-hover`, subtle `--accent-light`. Accent denotes selection or primary action, not status.
- Surfaces: `--glass-bg`, `--glass-bg-heavy`, `--surface-card`, `--surface-muted`; borders use the matching existing border tokens.
- Semantic status uses existing success/warning/danger/info and score tokens with icon plus text. Color alone never carries state. Do not invent green/red meanings that conflict with these tokens.
- Dark theme is supported by the current variables, not separate component rules. Verify both themes for contrast and translucency.

### 3.2 Typography and density

Use Geist Sans and Geist Mono from the current root layout. Default body is 14/20; dense metadata 12/16; labels 11/14 with restrained uppercase; page title 24/30; section title 18/24; key metric 24/28. IDs, hashes, versions, costs, timestamps, and code-like locators use Geist Mono. Minimum interactive target is 44 × 44 px on mobile and 36 px high on desktop; dense rows are 44–48 px.

### 3.3 Spacing, shape, and elevation

Base spacing unit is 4 px. Use 4, 8, 12, 16, 20, 24, 32, and 48. Page gaps are 20–24; card padding 16–20; control gaps 8. Controls use 8–10 px radii, cards 12–16, page glass 16. Use `--glass-shadow` for floating menus/cards and `--glass-shadow-lg` only for dialogs/drawers. Dividers, alignment, and whitespace carry hierarchy before shadows.

### 3.4 Core components and named states

| Component ID | Contract |
|---|---|
| `C-SCOPE-SWITCHER` | Stable-ID selection; tenant/workspace/role visible; pending invalidates content; no free-form tenant input. |
| `C-PAGE-HEADER` | Breadcrumb, title, description, status, stat strip, primary action. |
| `C-FILTER-BAR` | Shareable filters, search, saved view, reset, result count; horizontal containment on mobile. |
| `C-DATA-GRID` | Sort labels, selection count, sticky identity, keyboard row actions, card alternative. |
| `C-STATUS-CHIP` | Icon + text + semantic token; exposes full state name. |
| `C-VERSION-BADGE` | Immutable version, active/draft/superseded status, effective time. |
| `C-EVIDENCE-ROW` | source kind/name, locator, retrieved time, grade, freshness, access state. |
| `C-CLAIM-CARD` | observed/client-provided/inferred/not-found/unknown, confidence, conflicts, review status. |
| `C-CITATION-DRAWER` | Focus-trapped dialog/drawer, resolvable excerpt/structured field, source metadata, inaccessible reason, close restores focus. |
| `C-DECISION-BAR` | Approve/edit/reject/request research/defer/unknown, allowed by permission and state; required reason association. |
| `C-ASYNC-STATE` | Loading/empty/error/forbidden/stale/partial/suspended variants defined in §7. |
| `C-STEP-FRAME` | resumable onboarding progress, saved status, current step, next/back; URL cannot skip authority. |
| `C-ACTIVITY-TIMELINE` | immutable versions, decisions, audit-friendly actor/time/reason; no secret values. |
| `C-POLICY-GATE` | pass/warn/block, evaluated version/hash, exact remediations; block disables consequential action. |
| `C-COST-BUDGET` | estimate/range, currency, source limits, stop condition, actual-to-budget after run. |
| `C-DANGER-ZONE` | consequence, permission, reauthentication/confirmation when required, asynchronous job receipt. |
| `C-SELF-APPROVAL-GATE` | D-002 one-person owner/admin exception only: a second, distinct confirmation after the ordinary action, exact object/version/hash/scope/policy, required reason, unchecked acknowledgement, and durable audit before the side effect. |

## 4. Journey specifications

### 4.1 Onboarding and business understanding

`ONB-01-SCOPE` establishes the authoritative invited tenant, optional workspace, role, locale/timezone, and policies; IDs are never editable. It also covers the PRD invite journey: an eligible owner/admin can open “Invite teammates,” choose one fixed role and optional same-tenant workspace, review capability impact, and create a pending invitation. Pending/expired invitations have no tenant-data access; resend/revoke is rate-limited and audited, and the final-owner guard remains controlling. `ONB-02-POLICY` shows discrete, versioned source and outreach responsibilities with no prechecked blanket consent. `ONB-03-MATERIALS` accepts permitted files, URLs, notes, customer lists, and connector references in one intake queue. Documents, source evidence, canonical accounts/contacts, and business knowledge are tenant-wide by D-001 unless a server-authoritative resource explicitly declares a workspace-optional scope; the UI never calls tenant-wide material “workspace-owned.” Each item shows validation, upload, scan, extraction, duplicate, unsupported, failed, or ready independently. `ONB-04-PROGRESS` shows stage totals, current work, failures and resumable partial completion. `ONB-05-COMPLETE` summarizes authoritative sources and routes to Knowledge.

`KNOW-01-LIBRARY` is a filterable source inventory. `KNOW-02-SOURCE` presents metadata, extraction quality and exact locators without raw storage URLs. `KNOW-03-UNDERSTANDING` groups generic fact domains and open questions; it must work for chemical and non-industrial fixtures. Its exact-version summary offers both “Approve understanding” and the PRD’s distinct “Request another question round.” Requesting another round is non-approval: it records the current understanding version and rationale, opens a resumable `KNOW-05-QUESTIONS` session, and leaves the version unapproved until a later explicit decision. `KNOW-04-FACT-REVIEW` places the claim and decision in the main pane and evidence/conflicts/history in the 360 px side pane. `KNOW-05-QUESTIONS` presents one high-value question at a time, why it matters, what it unlocks, and answer/correct/defer/unknown controls. Approval names the exact understanding version.

Wireframe references: `desktop-shell-onboarding.svg#ONB-03-MATERIALS` and `mobile-onboarding.svg#ONB-03-MATERIALS-MOBILE`.

### 4.2 ICP and lead-play builder

`STRAT-01-ICP-LIST` and `STRAT-03-PLAY-LIST` show version, status, owner, overlap and last evaluation. Editors `STRAT-02-ICP-EDITOR` and `STRAT-04-PLAY-EDITOR` use a left section index, central structured form, and right completeness/evidence summary. Sections cover objective, segment/use case, positive signals, disqualifiers, triggers, geography, economics, buying roles, sources/query hypotheses, scoring, budgets, stop conditions, review and outreach gates. No industry, Google, website, rating, or geography is universal.

`STRAT-05-SIMULATION` compares examples and counterexamples in an explanation table: outcome, factor contributions, citations, uncertainty, and why pass/fail. `STRAT-06-ACTIVATION` shows immutable before/after diff, plan/version hash, budgets, policies, and missing blockers. Active versions cannot be edited; edit creates a draft successor.

### 4.3 Discovery planning and execution

`DISC-01-HOME` selects an active play, market scope, and only allowed connector capabilities. `DISC-02-PREVIEW` exposes query families, geographic/market scope, source terms, cost range, row/call/time budgets, dedupe method, review thresholds and stop rules before confirmation. If any dependency changes, `STATE-STALE` blocks execution and offers “Refresh plan.”

`DISC-03-RUN` is a durable progress dashboard: queued/running/completed/failed/cancelled units, partial account yield, spend, retries, worker health, and last heartbeat. Retry/cancel language explicitly preserves completed evidence. Progress announcements are throttled and available in an `aria-live="polite"` summary; no continuously changing focus.

Wireframe: `desktop-research-workbench.svg#DISC-02-PREVIEW`.

### 4.4 Account, buying-center, contact, and review workbench

`ACCT-01-QUEUE` is a play-specific account list with fit, evidence, freshness, conflict, owner, next action and review status. `ACCT-02-OVERVIEW` uses modular subroutes: Overview, Evidence, Buying center, Contacts, Activity. Identity and active scope persist across subroutes. `ACCT-03-EVIDENCE` reconstructs observations, conflicts, aliases and merge history; original records remain distinguishable.

`ACCT-04-BUYING-CENTER` visually separates verified people from role hypotheses. Cards expose role, responsibility, influence, confidence and evidence; confirm/edit/reject/request research is audited. `ACCT-05-CONTACTS` and `CONTACT-01-DETAIL` foreground identity confidence, role, source, freshness, consent/legal basis, suppression, opt-out/bounce and permitted-use state before drafting.

`REVIEW-01-QUEUE` unifies registered review types while preserving type labels, SLA/age, impact and reason. `REVIEW-02-DECISION` places proposal/current value in a comparison pane, evidence beside it, and an anchored decision bar. A stale version rejects submission and returns the user to the changed fields.

Wireframes: `desktop-research-workbench.svg#ACCT-04-BUYING-CENTER` and `mobile-account-review.svg#REVIEW-02-DECISION-MOBILE`.

### 4.5 Human-approved outreach

`OUT-01-DRAFT-QUEUE` separates proposed, needs evidence, policy blocked, ready for review, approved, copied/exported, and outcome-recorded. None implies delivery. `OUT-02-EDITOR` shows recipient/use state, editable message, inline claim markers, citation list and policy panel. Editing a material claim invalidates prior checks and approval.

`OUT-03-APPROVAL` shows exact recipient/contact version, content hash, evidence coverage, policy version, opt-out language, channel/quiet-hours rules, separation-of-duty state and audit consequence. Only allowed, current items can be approved, copied or exported. There is no send action or send-like icon. `OUT-04-OUTCOME` records external outcomes; opt-out immediately updates every contact and draft surface with a blocking suppression state.

### 4.6 Reports, learning, and administration

`REPORT-01-FUNNEL` defines numerator, denominator, cohort, date basis and scope for every metric; empty cohorts show “No eligible records,” never 0% success. Tabs cover funnel, evidence/trust, source/cost, operations, and outcomes. Breakdowns are tenant-safe and filterable by workspace, play version, source, market, segment, researcher and contact role.

`LEARN-01-PROPOSALS` shows proposed rule/config changes, evidence, expected effect, version diff and accept/edit/schedule/reject. A stale target blocks action; approval creates a new version and never rewrites history.

`ADMIN-01-TENANT`, `ADMIN-02-MEMBERS`, `ADMIN-03-CONNECTORS`, and `ADMIN-04-GOVERNANCE` cover D-001 lifecycle, D-002 memberships/roles, connector health/budgets/kill switches, retention/export/delete/audit/support. Dangerous changes use `C-DANGER-ZONE`; export/delete display asynchronous job state and receipt. Support elevation is time-bound, reason-coded and audited, and never grants default content visibility. Secrets are write-only/masked and never returned to the browser.

## 5. Responsive rules

| Pattern | Desktop 1440 × 1100 | Mobile 390 × 900 |
|---|---|---|
| Navigation | inline groups + disclosures | menu sheet; scope separate |
| Page header | title/action/stat strip in one glass block | title then actions; 2-column stat tiles or horizontal region |
| Master/detail | 240–360 px secondary pane | ordered cards/accordions; route or drawer detail |
| Evidence review | proposal 2/3 + evidence 1/3 | decision, proposal, evidence, history; citation drawer full screen |
| Builder | section rail + form + summary | progress select + one section + sticky action dock |
| Data grid | sticky header/identity, contained overflow | semantic cards; compare-only grid scroll |
| Filters | inline, wrap once | disclosure with active-filter chips |
| Dialog | max 640–880 px, focus trapped | near-full-screen sheet with safe areas |

At 200% zoom, desktop behavior may collapse to mobile patterns. No fixed-height business-content region; only bounded drawers, tables, and code excerpts scroll internally. Long tenant names, localized labels, hashes, URLs, and 4× text expansion must wrap or truncate with an accessible full value.

## 6. Interaction and accessibility

- Meet WCAG 2.2 AA for critical journeys. Use semantic headings, landmarks, lists, tables, fieldsets, labels and native controls before ARIA.
- A skip link targets the main page heading. Focus order follows reading order. All visible hover actions are also focus-visible and persist while focused.
- Focus uses explicit UI-000 design tokens, not the current translucent input tokens: light `--ui-focus-indicator: #7a2715` and `--ui-focus-separator: #ffffff`; dark `--ui-focus-indicator: #ffb4a2` and `--ui-focus-separator: #141412`. Render `outline: 3px solid var(--ui-focus-indicator); outline-offset: 2px` with `box-shadow: 0 0 0 2px var(--ui-focus-separator)`; keep the indicator outside the component border and never clip it. Using sRGB relative luminance after alpha-compositing each surface over `--background`, light `#7a2715` is 8.27:1 on `#f0eae4`, 9.09:1 on glass `#f9f5f0`, 9.34:1 on heavy glass `#fcf8f4`, 9.01:1 on card `#f8f4ef`, and 8.85:1 on muted `#f6f2ec`; dark `#ffb4a2` is 10.81:1 on `#141412`, 9.22:1 on glass `#232321`, 8.16:1 on heavy glass `#2e2c29`, 8.97:1 on card `#262523`, and 9.34:1 on muted `#222220`. The opaque separator prevents the indicator blending with the control edge; every measured boundary exceeds WCAG 2.2 Focus Appearance’s 3:1 adjacent-color requirement.
- Escape closes the topmost nonmodal disclosure or modal; closing and completed mutations restore focus to the invoking control or the updated heading. Dialogs trap focus; route navigation moves focus to the page `h1`/`h2` and announces title.
- Roving arrow keys are reserved for true tabs, radio groups, menus, and grids. Lists and cards use Tab. `Enter`/`Space` activate native controls; do not make whole rows the sole action target.
- Validation errors are associated with fields and summarized with focus on failed submission. Destructive confirmations name the object and consequence.
- Status is text + icon + color. Confidence includes number/label; charts have table/text alternatives. Time shows timezone; relative time has an exact accessible value.
- `prefers-reduced-motion: reduce` removes mesh drift, parallax, shimmer, smooth scroll and transform transitions. Keep instant opacity/state changes and progress text. Standard motion is 120–180 ms for controls, 180–240 ms for sheets, ease-out; no looping motion except determinate progress where essential.
- Live regions announce saved, failed, partial, completed, policy changed and scope changed once. Do not announce every worker tick.

### 6.1 D-002 consequential decisions and the one-person exception

Ordinary separation of duty remains the default. If the approver authored the object, the server returns `STATE-SEPARATION-OF-DUTY`; only an eligible owner/admin in a tenant with exactly one active human membership may proceed, and only when tenant policy permits. The UI then opens `C-SELF-APPROVAL-GATE` as a second interaction distinct from Save/Approve/Confirm. It names the consequence, tenant/workspace, object and immutable version/hash, policy version, actor, and required reason; its acknowledgement starts unchecked and its button reads “Confirm one-person self-approval.” The server rechecks membership count, role, policy, lifecycle, evidence/suppression, and hash, writes the durable audit event, then performs the side effect. A support actor, stale/blocked/suppressed object, dual-approval policy, missing hash/reason, or audit failure cannot use the exception.

| Task/action family | Consequential action that uses the distinct gate when same-actor | Explicitly non-consequential interactions |
|---|---|---|
| `UI-013` | approve/correct a fact into the exact business-understanding version or approve/supersede that version | open evidence/history, add an uncommitted note, defer, mark unknown, request research/question round |
| `UI-019` | approve an ICP or activate an exact lead-play version/hash | run/read a simulation, inspect examples/counterexamples, save an inactive draft |
| `UI-021` | approve and start the exact discovery/source plan hash | edit inputs, refresh an estimate, inspect terms/cost, abandon preview |
| `UI-026` | confirm a buying-center role/person or approve a qualification/score override | view evidence, edit an uncommitted hypothesis, reject, request research |
| `UI-028` | approve contact use or remove a suppression/block under separately permitted policy | view sources/history, edit an uncommitted observation, reject, request research, add suppression |
| `UI-030` | execute any registered review decision whose underlying action is one of D-002’s consequential families | inspect/assign the review, add notes, navigate to evidence, defer/request research where the registry marks it non-consequential |
| `UI-033` | approve the exact outreach draft or authorize copy/export of its exact recipient/content/policy version | inspect claims/citations, edit draft (which invalidates approval), cancel, download a prior authorized receipt; there is no send action |

## 7. `ASYNC-01-GALLERY` and canonical state contract

`ASYNC-01-GALLERY` is the normative component gallery for every canonical `STATE-*` ID below. It renders each state in page, section, row/card, dialog, and mobile full-width contexts in both themes, at 200% zoom and with 4× text expansion. Every specimen includes the exact heading/body/action hierarchy, icon + text status, keyboard focus target, accessible name/description, live-region behavior, retained-input rule, and an authority fixture showing which server discriminator produced it. The gallery contains no realistic tenant values, raw provider errors, hidden cross-tenant counts, automatic retry, or success-colored partial state. Unknown discriminators map only to `STATE-ERROR-TERMINAL` and emit safe telemetry; they never silently choose the closest visual state.

| Canonical State ID | Visual/semantic and announcement contract | Available action / authority |
|---|---|---|
| `STATE-LOADING` | skeleton matching final geometry; heading says what is loading; no fake values | cancel only if operation supports it |
| `STATE-EMPTY` | explains valid zero state and filters/scope; no celebratory success | context-specific create/import/reset-filter |
| `STATE-ERROR-RETRY` | plain-language failure, safe correlation ID, retained user input | retry and safe back |
| `STATE-ERROR-TERMINAL` | consequence and escalation path; no raw provider/PII detail | return/support reference |
| `STATE-FORBIDDEN` | no protected content; scope and missing access explanation | back/request access if policy supports |
| `STATE-SUSPENDED` | tenant/workspace state and read-only boundaries | allowed lifecycle/help action |
| `STATE-STALE` | warning banner plus changed version/time; consequential action disabled | refresh/review changes |
| `STATE-PARTIAL` | successful and failed units counted separately; never styled as complete | inspect failures/retry eligible units |
| `STATE-OFFLINE` | last confirmed timestamp and unsaved-change warning | reconnect/retry; no optimistic approval |
| `STATE-PENDING` | neutral waiting state with actor-independent next condition and exact submitted time | refresh/status only; server lifecycle authority |
| `STATE-NO-SCOPE` | no effective tenant/workspace context and no prior-scope content | choose an authorized scope or sign out |
| `STATE-DISABLED` | disabled membership/connector/control with consequence and permitted read boundary | authorized remediation; never enable optimistically |
| `STATE-ARCHIVED` | retained read-only object with archived time/reason and no active styling | view history/export where authorized |
| `STATE-BLOCKED` | named policy, lifecycle, budget, evidence, or capability blocker | exact remediation; consequential control disabled |
| `STATE-CONFLICT` | two or more authoritative candidates shown without silent merge | compare, resolve, or request review |
| `STATE-VALIDATION` | field-associated errors plus focused summary; input retained | correct and resubmit idempotently |
| `STATE-UNSAVED` | local edits are named and navigation risk is explicit | save/discard/stay; no success announcement |
| `STATE-RUNNING` | determinate/indeterminate work with started time and throttled counts | safe cancel/pause only if server permits |
| `STATE-PAUSED` | no new work is executing; completed evidence remains intact | resume/cancel if authorized |
| `STATE-CANCELLED` | terminal cancellation names preserved results and non-run units | inspect preserved evidence or explicit replay |
| `STATE-COMPLETE` | authoritative terminal success with completed time and receipt | continue/view receipt; never inferred from client progress |
| `STATE-READY` | prerequisites are current and the exact next action is available | context action with server recheck |
| `STATE-DUPLICATE` | matched immutable identity/hash and consequence of reuse are visible | inspect existing or keep separate if permitted |
| `STATE-UNSUPPORTED` | unsupported type/action and supported alternatives are named | replace input or safe back |
| `STATE-NOT-FOUND` | scoped search found no matching observation; explicitly not proof of nonexistence | refine/request research |
| `STATE-UNKNOWN` | value is not known and no unsupported inference is substituted | provide evidence, defer, or leave unknown |
| `STATE-SUPPRESSED` | contact/action is blocked with non-sensitive reason and scope | no outreach; authorized suppression review only |
| `STATE-INACCESSIBLE` | permitted record metadata only; protected content is not disclosed | request access if policy supports it |
| `STATE-EXPIRED` | exact expiry and invalidated action are named | obtain current invite/evidence/artifact |
| `STATE-DEGRADED` | service remains boundedly usable; unavailable capabilities and freshness are explicit | use permitted fallback or retry later |
| `STATE-OWNER-GUARD` | operation would violate the final-active-owner invariant | select verified replacement/cancel |
| `STATE-SEPARATION-OF-DUTY` | same-actor approval blocked; never implies the one-person exception is eligible | second approver, or server-offered `C-SELF-APPROVAL-GATE` only |

Errors retain safe form input, filters and scroll anchor when possible. Retry is idempotent and never suggests a result succeeded before authoritative reload. Correlation IDs are copyable but do not reveal tenant internals.

## 8. Security and trust presentation

Scope is context, never proof of authorization. UI visibility does not replace server enforcement. All mutations show authoritative post-reload state, exact version where consequential, and audit receipt where required. Prompt/document content is visually separated from system instructions; untrusted source text cannot render active markup. Evidence access failures do not leak source existence beyond the actor’s permitted view. Copy/export gates re-evaluate policy and contact use; stale or partial policy checks block.

## 9. Implementation reference map

The complete UI-000–UI-040 mapping is in [`ui-000-screen-component-state-matrix.md`](ui-000-screen-component-state-matrix.md). Wireframes are intentionally self-contained text/vector references, not pixel-perfect application output:

- [`wireframes/desktop-shell-onboarding.svg`](wireframes/desktop-shell-onboarding.svg)
- [`wireframes/desktop-research-workbench.svg`](wireframes/desktop-research-workbench.svg)
- [`wireframes/mobile-onboarding.svg`](wireframes/mobile-onboarding.svg)
- [`wireframes/mobile-account-review.svg`](wireframes/mobile-account-review.svg)

This draft cannot authorize UI implementation or claim design approval. Signoff status is recorded only in [`../validation/2026-08-23-ui-000-design-approval.md`](../validation/2026-08-23-ui-000-design-approval.md).
