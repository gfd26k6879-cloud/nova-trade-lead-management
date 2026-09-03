# UI-000 design approval receipt — draft

**Date:** 2026-08-23

**Task:** UI-000 — approve the future visual and interaction specification

**Status:** **DRAFT AWAITING product/design/accessibility/engineering/security signoff**
**Approval:** Not approved. This receipt records a review candidate only and does not authorize UI-001–UI-040 implementation.

## Review packet

| Artifact | Purpose | Draft check |
|---|---|---|
| [`../design/multi-tenant-platform-ui-spec.md`](../design/multi-tenant-platform-ui-spec.md) | shell, visual system, responsive behavior, journeys, states, accessibility and security presentation | present |
| [`../design/ui-000-screen-component-state-matrix.md`](../design/ui-000-screen-component-state-matrix.md) | exact UI-001–UI-040 inventory and named references | present |
| [`../design/wireframes/desktop-shell-onboarding.svg`](../design/wireframes/desktop-shell-onboarding.svg) | desktop 1440×1100 shell/onboarding | XML-valid candidate |
| [`../design/wireframes/desktop-research-workbench.svg`](../design/wireframes/desktop-research-workbench.svg) | desktop 1440×1100 discovery/account workbench | XML-valid candidate |
| [`../design/wireframes/mobile-onboarding.svg`](../design/wireframes/mobile-onboarding.svg) | mobile 390×900 onboarding | XML-valid candidate |
| [`../design/wireframes/mobile-account-review.svg`](../design/wireframes/mobile-account-review.svg) | mobile 390×900 evidence review | XML-valid candidate |

## Draft verification record

- Scope is limited to seven documentation/wireframe artifacts; no application code, dependency, external service, generated image, or `.commandcode` change is part of UI-000.
- Direction preserves the repository’s warm terracotta/ink glass language, Geist type, current semantic tokens, `NavHeader` disclosure/focus-restoration patterns, and `PageShell` operational hierarchy.
- D-001 scope and lifecycle, D-002 permission-aware navigation, PRD §8 journeys, and every implementation task from UI-001 through UI-040 are referenced.
- Required flows cover onboarding/business understanding, evidence review, ICP/play design, discovery preview/run, account/buying-center/contact workbench, unified review, human-approved draft/copy/export outreach, reporting/learning, and administration/governance.
- `ASYNC-01-GALLERY` fully defines the canonical `STATE-*` vocabulary, specimen contexts, semantics, announcements, authority, retained-input behavior, and safe unknown-discriminator fallback; every UI-001–UI-040 row cites exact canonical IDs.
- Current `/explore`, `/queue`, `/leads`, `/statistics`, and `/users` ownership is mapped explicitly to planned `/discovery`, `/accounts`, `/reports`, and `/admin/members` capabilities with preservation, redirect, filter, identifier, and collision rules.
- D-002 separation of duty and the distinct audited one-person owner/admin confirmation are specified for every consequential family in UI-013, UI-019, UI-021, UI-026, UI-028, UI-030, and UI-033; non-consequential actions remain clearly separated.
- Keyboard, focus restoration, screen-reader announcements, reduced motion, 200% zoom/reflow, non-color state cues, mobile reading order, and destructive-action semantics are specified.
- Focus tokens are opaque, theme-specific values with recorded WCAG adjacent-surface contrast math (all ratios at least 3:1); the two mobile wireframes have unique shell instance IDs and include brand, scope, notifications, and menu.
- D-001 tenant-wide document/source semantics, launch-deferred/not-permitted Trade directory labeling, onboarding invitations, and “Request another question round” are explicit.
- Wireframes are self-contained text/vector SVGs with named root and screen/state IDs. They are design references, not proof of rendered implementation fidelity.

## Repair verification evidence (not approval)

Authoring-time rerun on 2026-08-23 produced:

- XML: 4/4 SVGs parse with `xmllint`; unsafe active/external SVG elements or attributes: 0; duplicate IDs within a document: 0.
- Inventory: exactly 40 unique task rows, `UI-001` through `UI-040`; canonical state definitions: 32; used canonical states: 32; undefined IDs or prose aliases in exceptional-state cells: 0.
- Contracts: all 9 required current/planned route strings present; all 7 specified D-002 consequential families present; 2 unique mobile shell instance IDs present.
- WCAG math: 10 light/dark adjacent surfaces recalculated with sRGB relative luminance; minimum focus-indicator contrast is 8.16:1.
- Mobile target geometry and semantics: both 390×900 wireframes visibly bound scope at 96×44, notifications at 60×44, and menu at 48×44; mobile onboarding also bounds Choose permitted files at 326×52, Add link and Add note at 96×44, Policy at 118×44, See supported formats at 174×44, Back at 112×48, and Continue at 234×48; mobile account review bounds View citation at 132×44, the collapsed History and conflicts disclosure at 358×74, Reject at 82×48, Request research at 112×48, and Confirm at 144×48. All 18 targets have unique semantic group IDs, roles, accessible names, at-least-44-pixel hit boxes, and no target overlap; the disclosure records `aria-expanded="false"`.
- Visual render: desktop SVGs render at 1440×1100 and mobile SVGs at 390×900; inspection found no clipping or hidden correction text.
- Whitespace: all 7 untracked files produce no `--check` diagnostics; each returns the expected no-index content-difference status `1`.
- Approval guard: status remains DRAFT AWAITING, with 5 blank human-review rows and no agent or automated approval.

## Required signoffs

Five real human reviewers—one for each discipline below—must each record name, date, decision, and blocking comments in a future authorized update. Blank rows, agent checks, automated results, and this repair are intentionally not approval or a substitute for any signoff.

| Discipline | Reviewer | Date | Decision | Required review |
|---|---|---|---|---|
| Product | — | — | AWAITING | journey completeness, terminology, operator priority, launch boundary |
| Design | — | — | AWAITING | hierarchy, density, responsive patterns, visual continuity |
| Accessibility | — | — | AWAITING | WCAG 2.2 AA critical journeys, keyboard/focus, reflow, semantics, reduced motion |
| Engineering | — | — | AWAITING | route/DTO feasibility, primitive reuse, state authority, performance |
| Security | — | — | AWAITING | tenant leakage, permission presentation, evidence access, secret/error handling, consequence gates |

## Approval gate

UI-000 may be marked approved only after all five disciplines explicitly approve the same artifact revisions and all blocking comments are resolved. Any material screen, component, state, responsive, or permission change after signoff requires affected reviewers to reconfirm. Until then, downstream work may estimate or review against this draft but must not cite it as an approved visual contract.

## Validation commands for reviewers

```sh
xmllint --noout docs/design/wireframes/*.svg
rg -o 'UI-0(0[1-9]|[1-3][0-9]|40)' docs/design/ui-000-screen-component-state-matrix.md | sort -u
rg -n 'ASYNC-01-GALLERY|STATE-SEPARATION-OF-DUTY|/explore|/discovery|--ui-focus-indicator' docs/design/multi-tenant-platform-ui-spec.md docs/design/ui-000-screen-component-state-matrix.md
rg -n 'DRAFT AWAITING product/design/accessibility/engineering/security signoff' docs/validation/2026-08-23-ui-000-design-approval.md
git diff --no-index --check /dev/null docs/design/multi-tenant-platform-ui-spec.md
git diff --no-index --check /dev/null docs/design/ui-000-screen-component-state-matrix.md
git diff --no-index --check /dev/null docs/design/wireframes/desktop-shell-onboarding.svg
git diff --no-index --check /dev/null docs/design/wireframes/desktop-research-workbench.svg
git diff --no-index --check /dev/null docs/design/wireframes/mobile-onboarding.svg
git diff --no-index --check /dev/null docs/design/wireframes/mobile-account-review.svg
git diff --no-index --check /dev/null docs/validation/2026-08-23-ui-000-design-approval.md
```

For an untracked file, each `git diff --no-index --check /dev/null FILE` invocation normally exits `1` because the whole file is a content difference; whitespace defects are reported in its output. Reviewers must require empty output, not exit `0`. Once these files are tracked, the follow-up is `git diff --check -- <the same seven paths>`, which must exit `0`. Results above and in the worker handoff are verification evidence only, not signoff.
