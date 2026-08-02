# G-007SR5 researcher-AI lifecycle fixture repair

Date: 2026-08-01

Opening commit: `748371621172d80a16254b5a01beed1a78b79df2`

Implementation commit: `c6933af531f31bfc23d1ac0e76eb0afc6dc88bf6`

Status: accepted test-only repair; no production behavior change

## Result

P39's first broad portable invocation passed its 13 exact source/query files
75/75, while all six adjacent researcher-AI action tests failed on the clean
baseline. Two independent source/history reviews proved that the old synthetic
claimed-lead fixture omitted `archived_at` and `is_excluded` after lifecycle
hardening commit `726765ad7f1eeb9df91dcf7648e837561cda7792`.

Production correctly requires researcher-visible leads to be active and
explicitly nonexcluded. Real query rows normalize these fields, while the mock
bypassed normalization and therefore correctly failed closed. This was a P2
test-maintenance defect, not a product, access-policy, or P39 index defect.

The one-file repair adds `archived_at: null` and `is_excluded: false` to the
canonical claimed fixture and adds explicit archived and excluded denial cases.
Both denials retain the generic not-found response and prove that no AI worker
is invoked. No production, access-policy, schema, migration, dependency, data,
index, sequence, or Windows-lane change occurred.

## Validation

Under Node 24.13.1 and npm 11.8.0:

- implementer and root each passed 59/59 across researcher-AI actions, lead
  access, and lead-ownership actions;
- researcher-AI actions now pass 8/8, including the two lifecycle denials;
- the full repaired 14-file P39 portable suite passes 83/83;
- implementer and root TypeScript and focused ESLint passed; and
- `git diff --check` and the post-commit worktree were clean.

An independent test/evidence reviewer accepts with no P0/P1/P2. The implementer
did not self-accept.

## Closeout

Inventory remains 54/52/2, crosswalk remains 48/14 (G-003 25/14, G-002 13/0),
sequence `202607310010` remains free, and parent G-007 remains open. P39 remains
open and its PostgreSQL audit may resume after SR5 lineage releases the
test/durable-document reservation. No push or external action occurs.

## Lineage receipt

Acceptance commit `bbe261295bbe39ec1cf36f90990d6afbae766a0b` records the
validated repair. This lineage-only receipt releases every SR5 lock and
unblocks final P39 evidence work.
