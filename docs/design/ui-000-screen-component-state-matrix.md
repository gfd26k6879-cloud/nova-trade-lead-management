# UI-000 screen, component, and state matrix

**Status:** DRAFT — approval pending.

**Spec:** [`multi-tenant-platform-ui-spec.md`](multi-tenant-platform-ui-spec.md)
**Coverage rule:** every UI-001–UI-040 task has named screens, reusable components, responsive behavior, and exceptional states. Every exceptional-state cell uses only exact canonical IDs from the complete `ASYNC-01-GALLERY` contract in [`multi-tenant-platform-ui-spec.md` §7](multi-tenant-platform-ui-spec.md#7-async-01-gallery-and-canonical-state-contract); prose aliases such as “error,” “blocked,” or “mixed partial” are not state identifiers. The IDs are design references, not implemented routes.

## Complete implementation inventory

| Task | Named screen references | Required component references | Desktop → mobile behavior | Required exceptional states |
|---|---|---|---|---|
| UI-001 | all named screens (DTO vocabulary) | `C-STATUS-CHIP`, `C-VERSION-BADGE`, `C-ASYNC-STATE` | discriminated data remains equivalent | `STATE-LOADING`, `STATE-EMPTY`, `STATE-ERROR-RETRY`, `STATE-ERROR-TERMINAL`, `STATE-FORBIDDEN`, `STATE-SUSPENDED`, `STATE-STALE`, `STATE-PARTIAL`, `STATE-OFFLINE` |
| UI-002 | `SHELL-DESKTOP-DEFAULT`, `SHELL-MOBILE-DEFAULT` | `C-SCOPE-SWITCHER`, `C-PAGE-HEADER` | inline scope → separate scope disclosure | `STATE-NO-SCOPE`, `STATE-PENDING`, `STATE-DISABLED`, `STATE-SUSPENDED`, `STATE-ERROR-RETRY` |
| UI-003 | `SHELL-DESKTOP-DEFAULT`, `SHELL-MOBILE-DEFAULT` | grouped nav, count badge, disclosure, legacy label | inline groups → menu sheet | `STATE-FORBIDDEN`, `STATE-EMPTY`, `STATE-READY` |
| UI-004 | `ASYNC-01-GALLERY` | `C-ASYNC-STATE` | inline/card → full-width state | `STATE-LOADING`, `STATE-EMPTY`, `STATE-ERROR-RETRY`, `STATE-ERROR-TERMINAL`, `STATE-FORBIDDEN`, `STATE-SUSPENDED`, `STATE-STALE`, `STATE-PARTIAL`, `STATE-OFFLINE` |
| UI-005 | `KNOW-04-FACT-REVIEW`, `REVIEW-02-DECISION` | `C-EVIDENCE-ROW`, `C-CLAIM-CARD`, `C-CITATION-DRAWER`, `C-DECISION-BAR` | side pane → ordered accordion/full-screen drawer | `STATE-INACCESSIBLE`, `STATE-EXPIRED`, `STATE-CONFLICT`, `STATE-NOT-FOUND`, `STATE-UNKNOWN`, `STATE-STALE` |
| UI-006 | `ONB-01-SCOPE` | `C-STEP-FRAME`, scope summary, saved indicator | two-pane intro/form → stacked step | `STATE-PENDING`, `STATE-EXPIRED`, `STATE-FORBIDDEN`, `STATE-VALIDATION` |
| UI-007 | `ONB-02-POLICY` | acknowledgement group, version badge, policy links | side summary → inline summary | `STATE-STALE`, `STATE-VALIDATION`, `STATE-ERROR-RETRY` |
| UI-008 | `ONB-03-MATERIALS` | intake dropzone/button, URL/note form, item queue | split intake/queue → stacked queue | `STATE-PENDING`, `STATE-RUNNING`, `STATE-DUPLICATE`, `STATE-UNSUPPORTED`, `STATE-VALIDATION`, `STATE-ERROR-RETRY`, `STATE-READY`, `STATE-PARTIAL` |
| UI-009 | `ONB-04-PROGRESS`, `ONB-05-COMPLETE` | progress summary, unit list, retry controls | stats + units → stacked counts/cards | `STATE-PENDING`, `STATE-RUNNING`, `STATE-PARTIAL`, `STATE-ERROR-RETRY`, `STATE-DEGRADED`, `STATE-COMPLETE` |
| UI-010 | `KNOW-01-LIBRARY` | `C-FILTER-BAR`, `C-DATA-GRID`, source status | grid → source cards | `STATE-LOADING`, `STATE-EMPTY`, `STATE-PARTIAL`, `STATE-ERROR-RETRY` |
| UI-011 | `KNOW-02-SOURCE` | source header, extraction viewer, `C-EVIDENCE-ROW` | metadata + viewer → accordion | `STATE-INACCESSIBLE`, `STATE-UNSUPPORTED`, `STATE-STALE`, `STATE-ERROR-RETRY` |
| UI-012 | `KNOW-03-UNDERSTANDING` | domain cards, coverage meter, `C-VERSION-BADGE` | card grid → list | `STATE-EMPTY`, `STATE-PENDING`, `STATE-CONFLICT`, `STATE-STALE`, `STATE-PARTIAL` |
| UI-013 | `KNOW-04-FACT-REVIEW` | claim/evidence/decision/history primitives, `C-SELF-APPROVAL-GATE` | 2/3 + 1/3 → ordered review stack | `STATE-FORBIDDEN`, `STATE-CONFLICT`, `STATE-STALE`, `STATE-INACCESSIBLE`, `STATE-SEPARATION-OF-DUTY` |
| UI-014 | `KNOW-05-QUESTIONS` | question card, rationale, answer composer, session progress | question + context → stacked | `STATE-EMPTY`, `STATE-PENDING`, `STATE-UNKNOWN`, `STATE-COMPLETE`, `STATE-STALE`, `STATE-ERROR-RETRY` |
| UI-015 | `STRAT-01-ICP-LIST` | filter, version/status, history disclosure | table → version cards | `STATE-EMPTY`, `STATE-PENDING`, `STATE-ARCHIVED`, `STATE-FORBIDDEN` |
| UI-016 | `STRAT-02-ICP-EDITOR` | builder sections, evidence picker, activation diff | rail/form/summary → progress select/form/dock | `STATE-VALIDATION`, `STATE-UNSAVED`, `STATE-CONFLICT`, `STATE-STALE`, `STATE-ARCHIVED` |
| UI-017 | `STRAT-03-PLAY-LIST` | overlap indicator, version/status, filters | table → play cards | `STATE-EMPTY`, `STATE-ERROR-RETRY`, `STATE-PAUSED`, `STATE-ARCHIVED` |
| UI-018 | `STRAT-04-PLAY-EDITOR` | generic play sections, budget/source/policy controls | rail/form/summary → one section + dock | `STATE-BLOCKED`, `STATE-VALIDATION`, `STATE-UNSAVED`, `STATE-STALE` |
| UI-019 | `STRAT-05-SIMULATION`, `STRAT-06-ACTIVATION` | explanation grid, diff, `C-POLICY-GATE`, hash, `C-SELF-APPROVAL-GATE` | compare grid → example cards/diff accordions | `STATE-RUNNING`, `STATE-EMPTY`, `STATE-BLOCKED`, `STATE-STALE`, `STATE-PARTIAL`, `STATE-SEPARATION-OF-DUTY` |
| UI-020 | `DISC-01-HOME` | play picker, market scope, capability cards | 2-column setup → stack | `STATE-BLOCKED`, `STATE-FORBIDDEN`, `STATE-EMPTY` |
| UI-021 | `DISC-02-PREVIEW` | plan sections, `C-COST-BUDGET`, `C-POLICY-GATE`, `C-SELF-APPROVAL-GATE` | plan + confirmation rail → sections + bottom action | `STATE-LOADING`, `STATE-BLOCKED`, `STATE-STALE`, `STATE-PARTIAL`, `STATE-ERROR-RETRY`, `STATE-SEPARATION-OF-DUTY` |
| UI-022 | `DISC-03-RUN` | durable progress, unit table, activity, retry/cancel | dashboard grid → status cards/unit list | `STATE-PENDING`, `STATE-RUNNING`, `STATE-PAUSED`, `STATE-PARTIAL`, `STATE-ERROR-RETRY`, `STATE-CANCELLED`, `STATE-DEGRADED` |
| UI-023 | `ACCT-01-QUEUE` | filter, account grid/cards, assignment, score/evidence indicators | table → account cards | `STATE-EMPTY`, `STATE-PARTIAL`, `STATE-STALE`, `STATE-FORBIDDEN` |
| UI-024 | `ACCT-02-OVERVIEW` | account identity header, subnav, next action, summary cards | tabs + modules → scrollable tabs/cards | `STATE-CONFLICT`, `STATE-ARCHIVED`, `STATE-LOADING`, `STATE-FORBIDDEN` |
| UI-025 | `ACCT-03-EVIDENCE` | observation timeline, conflict compare, merge history | timeline + detail pane → cards/drawer | `STATE-CONFLICT`, `STATE-PENDING`, `STATE-INACCESSIBLE`, `STATE-EXPIRED`, `STATE-PARTIAL` |
| UI-026 | `ACCT-04-BUYING-CENTER` | role map, hypothesis/person card, decision controls, `C-SELF-APPROVAL-GATE` | columns/map → labeled role list | `STATE-PENDING`, `STATE-READY`, `STATE-ARCHIVED`, `STATE-STALE`, `STATE-BLOCKED`, `STATE-SEPARATION-OF-DUTY` |
| UI-027 | `ACCT-05-CONTACTS` | contact table/cards, use-status, freshness/suppression | table → contact cards | `STATE-EMPTY`, `STATE-NOT-FOUND`, `STATE-UNKNOWN`, `STATE-STALE`, `STATE-SUPPRESSED`, `STATE-BLOCKED` |
| UI-028 | `CONTACT-01-DETAIL` | identity compare, source/evidence, use review, decision, `C-SELF-APPROVAL-GATE` | split review → ordered stack | `STATE-CONFLICT`, `STATE-FORBIDDEN`, `STATE-STALE`, `STATE-BLOCKED`, `STATE-ERROR-RETRY`, `STATE-SUPPRESSED`, `STATE-SEPARATION-OF-DUTY` |
| UI-029 | `REVIEW-01-QUEUE` | type filter, priority/SLA, assignment, bulk-safe select | table → review cards | `STATE-EMPTY`, `STATE-ERROR-TERMINAL`, `STATE-STALE`, `STATE-PARTIAL` |
| UI-030 | `REVIEW-02-DECISION` | comparison, evidence drawer, `C-DECISION-BAR`, reason form, `C-SELF-APPROVAL-GATE` | evidence beside proposal → ordered stack | `STATE-FORBIDDEN`, `STATE-VALIDATION`, `STATE-STALE`, `STATE-ERROR-RETRY`, `STATE-SEPARATION-OF-DUTY` |
| UI-031 | `OUT-01-DRAFT-QUEUE` | draft state, recipient use-state, coverage, filters | table → draft cards | `STATE-EMPTY`, `STATE-BLOCKED`, `STATE-SUPPRESSED`, `STATE-STALE` |
| UI-032 | `OUT-02-EDITOR` | editor, inline claim markers, citation list, policy panel | editor + 360 px panel → editor/accordions/dock | `STATE-UNSUPPORTED`, `STATE-BLOCKED`, `STATE-STALE`, `STATE-ERROR-RETRY` |
| UI-033 | `OUT-03-APPROVAL` | approval checklist, `C-POLICY-GATE`, hash/version, copy/export receipt, `C-SELF-APPROVAL-GATE` | checklist + preview → ordered review | `STATE-BLOCKED`, `STATE-STALE`, `STATE-SEPARATION-OF-DUTY`, `STATE-ERROR-RETRY` |
| UI-034 | `OUT-04-OUTCOME` | outcome form, activity receipt, suppression banner | modal/detail → full-screen sheet | `STATE-SUPPRESSED`, `STATE-BLOCKED`, `STATE-DUPLICATE`, `STATE-STALE`, `STATE-ERROR-RETRY` |
| UI-035 | `REPORT-01-FUNNEL` | metric definition, filters, chart + table, cohort summary | dashboard grid → stacked charts/tables | `STATE-EMPTY`, `STATE-DEGRADED`, `STATE-PARTIAL`, `STATE-ERROR-RETRY` |
| UI-036 | `LEARN-01-PROPOSALS` | proposal diff, evidence, history, decision | list + detail → cards/drawer | `STATE-EMPTY`, `STATE-STALE`, `STATE-FORBIDDEN`, `STATE-ARCHIVED`, `STATE-PENDING` |
| UI-037 | `ADMIN-01-TENANT` | lifecycle status, workspace list, `C-DANGER-ZONE` | settings grid → sections | `STATE-PENDING`, `STATE-SUSPENDED`, `STATE-ARCHIVED`, `STATE-FORBIDDEN` |
| UI-038 | `ADMIN-02-MEMBERS` | membership table, role/scope editor, owner guard | table + side panel → cards/full-screen editor | `STATE-PENDING`, `STATE-EXPIRED`, `STATE-DISABLED`, `STATE-OWNER-GUARD`, `STATE-FORBIDDEN`, `STATE-CONFLICT` |
| UI-039 | `ADMIN-03-CONNECTORS` | connector capability, health, budget, kill switch | registry grid → connector cards | `STATE-ERROR-RETRY`, `STATE-DEGRADED`, `STATE-DISABLED`, `STATE-BLOCKED`, `STATE-STALE` |
| UI-040 | `ADMIN-04-GOVERNANCE` | retention, export/delete jobs, audit, support grants, danger zone | tabbed console → sections/cards | `STATE-PENDING`, `STATE-ERROR-RETRY`, `STATE-EXPIRED`, `STATE-FORBIDDEN`, `STATE-PARTIAL` |

## Named screen index

| Family | IDs |
|---|---|
| Shell/system | `SHELL-DESKTOP-DEFAULT`, `SHELL-MOBILE-DEFAULT`, `ASYNC-01-GALLERY` |
| Onboarding | `ONB-01-SCOPE`, `ONB-02-POLICY`, `ONB-03-MATERIALS`, `ONB-04-PROGRESS`, `ONB-05-COMPLETE` |
| Knowledge | `KNOW-01-LIBRARY`, `KNOW-02-SOURCE`, `KNOW-03-UNDERSTANDING`, `KNOW-04-FACT-REVIEW`, `KNOW-05-QUESTIONS` |
| Strategy | `STRAT-01-ICP-LIST`, `STRAT-02-ICP-EDITOR`, `STRAT-03-PLAY-LIST`, `STRAT-04-PLAY-EDITOR`, `STRAT-05-SIMULATION`, `STRAT-06-ACTIVATION` |
| Discovery | `DISC-01-HOME`, `DISC-02-PREVIEW`, `DISC-03-RUN` |
| Accounts/review | `ACCT-01-QUEUE`, `ACCT-02-OVERVIEW`, `ACCT-03-EVIDENCE`, `ACCT-04-BUYING-CENTER`, `ACCT-05-CONTACTS`, `CONTACT-01-DETAIL`, `REVIEW-01-QUEUE`, `REVIEW-02-DECISION` |
| Outreach | `OUT-01-DRAFT-QUEUE`, `OUT-02-EDITOR`, `OUT-03-APPROVAL`, `OUT-04-OUTCOME` |
| Reports/admin | `REPORT-01-FUNNEL`, `LEARN-01-PROPOSALS`, `ADMIN-01-TENANT`, `ADMIN-02-MEMBERS`, `ADMIN-03-CONNECTORS`, `ADMIN-04-GOVERNANCE` |

## State composition rules

1. Page state and row state are independent: a partially loaded page uses `STATE-PARTIAL` while each failed row retains its exact error.
2. Empty means a successful authoritative query with zero eligible records; forbidden and error never masquerade as empty.
3. Stale disables only actions whose version/policy dependency changed, but identifies unaffected read-only content.
4. Partial never receives success styling or completion copy. Counts name completed, failed, pending, and unknown units.
5. Loading skeletons preserve final geometry and contain no realistic business values.
6. Mobile preserves every consequential field and action; it may reorder or disclose them, never silently omit them.

## Wireframe ID cross-check

| File | Required root/screen IDs |
|---|---|
| `wireframes/desktop-shell-onboarding.svg` | `WF-DESKTOP-SHELL-ONBOARDING`, `SHELL-DESKTOP-DEFAULT`, `ONB-03-MATERIALS` |
| `wireframes/desktop-research-workbench.svg` | `WF-DESKTOP-RESEARCH-WORKBENCH`, `DISC-02-PREVIEW`, `ACCT-04-BUYING-CENTER` |
| `wireframes/mobile-onboarding.svg` | `WF-MOBILE-ONBOARDING`, `SHELL-MOBILE-ONBOARDING`, `ONB-03-MATERIALS-MOBILE` |
| `wireframes/mobile-account-review.svg` | `WF-MOBILE-ACCOUNT-REVIEW`, `SHELL-MOBILE-ACCOUNT-REVIEW`, `REVIEW-02-DECISION-MOBILE` |
