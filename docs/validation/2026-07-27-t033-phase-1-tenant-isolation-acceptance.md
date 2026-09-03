# T-033 Phase 1 Tenant-Isolation Acceptance

Date: 2026-07-27

Base SHA: `8225df619a96a088f18ff7f574a36b157d55dd2f`

Decision: **PASS - Phase 2 implementation may begin.**

This is the local acceptance result for T-033 Phase 1. It is not the broader D-015 tenant-isolation exit. D-015 remains pending G-001 through G-025, generalized route/worker/cache/aggregate evidence, and activation approvals.

## Scope and authority

The acceptance covers the applicable Phase 1 surfaces mapped to QG-001, QG-006, QG-007, QG-023, and QG-024. Evidence is from the integrated dirty/uncommitted worktree by design, using synthetic local data only. The acceptance authority is the verified result recorded for this T-033 Phase 1 packet and the gates and packets listed below.

## Evidence matrix

| Surface | Verified result |
| --- | --- |
| Full gates | Typecheck exit 0 in 3.106s; lint exit 0 in 19.201s; `npm test` exit 0 in 16.055s with 122 files passed, 1 skipped, 2,193 tests passed, and 8 skipped; build exit 0 in 32.717s; full-worktree `git diff --check` exit 0 in 0.122s with existing line-ending warnings only. |
| T027 stock PG16 | 39 applied and 2 skipped for scheduler/Vault runtime only; 6/6 pass. The non-owner runtime role is `NOSUPERUSER NOBYPASSRLS`. Coverage includes FORCE RLS, all verbs, tenant/workspace, malformed context, active/suspended/revoked/future membership/binding, member/support/worker/mixed contexts, support scope/permission/data-class/expiry/revocation, and transaction-local cleanup. Container absent. |
| App boundary | 14 files; 1,330 passed, 0 skipped; scoped lint pass. Coverage includes internal worker auth/route, permissions, authorization/context/session/db context, support, logs, audit, lifecycle, limits, e2e safety; no findings. |
| Compatibility and recovery | SQLite packet: 9 files, 96 pass, 2 PG opt-in skips. T028 PG16: 15/15. T029 PG16: 12/12 and 37 hostile-search-path shadows unchanged. DB verifier: 37 tables. All exact containers absent. |
| DoneClaim handling | Only the later captured exit 0 with `FAILURES=none` is accepted; the first DoneClaim was premature. |

## Applicable Phase 1 QG mapping

| QG | Applicable Phase 1 evidence |
| --- | --- |
| QG-001 | T027 cross-tenant all-verbs/context matrix plus app authorization. |
| QG-006 | Compatibility concurrency/replay/idempotency and rollback/no-residue tests. |
| QG-007 | All applicable critical suites pass. |
| QG-023 | Worker/support/log/audit/export/no-send surfaces in the 14-file app lane and focused schema suites. |
| QG-024 | Export/deletion lifecycle and T029 recovery dry-run/rollback. |

## Commands and result shape

Recorded full-gate commands and outcomes:

```text
npm run typecheck                         exit 0   3.106s
npm run lint                              exit 0  19.201s
npm test                                  exit 0  16.055s
npm run build                             exit 0  32.717s
git diff --check (full worktree)           exit 0   0.122s (existing line-ending warnings only)
git diff --check -- docs/validation/2026-07-27-t033-phase-1-tenant-isolation-acceptance.md
                                          exit 0   (duration not recorded)
```

The conductor independently repeated the stable integrated-tree gates: typecheck
exit 0 in 6.7s, lint exit 0 in 25.8s, full test exit 0 in 19.8s, and build exit
0 in 25.3s. A fresh stock-PG16 T027 rehearsal then passed 6/6 in 5.27s after
applying 39 migrations and skipping the same two runtime-only files; its exact
container was removed. The conductor's first T027 harness attempt stopped before
migration because PowerShell treated the expected startup readiness error as
terminating; that container was removed and the corrected non-terminating
readiness loop produced the passing result above.

Sanitized result-shape examples (representative shapes only; no secrets or customer values):

```text
{ status: "PASS", failures: 0, synthetic: true, local: true }
{ role: "non-owner", superuser: false, bypassRls: false }
{ context: "transaction-local", cleanup: "complete" }
{ container: "exact-container-name", present: false }
```

The PG16 acceptance result includes `39 applied`, `2 skipped`, and `6/6 pass`; the later completion capture is the authoritative completion shape because it reports exit 0 and `FAILURES=none`.

Fresh and upgraded SQLite schema/compatibility paths and FK/integrity guards were exercised by the full and focused suites. The focused SQLite packet recorded 96 pass and 2 PG opt-in skips. T030 DB-context evidence is included through the app lane and the existing T030 receipt.

## Migration skips and failure semantics

The two skipped T027 migration files are stock-PG portability skips requiring the `pg_net`/`pg_cron`/Vault runtime. They are not skipped critical isolation logic. The two SQLite compatibility skips are PG opt-in tests. These skips do not change the Phase 1 PASS because the corresponding local acceptance boundaries and PG16 packets passed within their applicable scope.

A gate failure, an unexpected finding, a non-zero exit, an unaccounted skip, or a missing required applicable surface would fail acceptance and block Phase 2. The premature first DoneClaim is excluded; only the later captured exit 0 with `FAILURES=none` is accepted.

## Cleanup and environment

All data was synthetic and local. Transaction-local context cleanup was verified. All exact containers were absent at capture time. No customer data was used, and no Auth, Storage, or Vault restore was performed.

## Limitations and activation blockers

This record does not claim provider, outreach, remote, staging, production, legal, or live verification. It does not claim Auth/Storage/Vault restore coverage. It does not authorize activation. The broader D-015 exit remains blocked on G-001 through G-025, generalized route/worker/cache/aggregate evidence, and activation approvals.

## Checked acceptance checklist

- [x] T-033 Phase 1 local acceptance is PASS.
- [x] Phase 2 may begin within the accepted scope.
- [x] Base SHA is recorded.
- [x] Integrated dirty/uncommitted worktree is recorded as intentional.
- [x] Full gates are exit 0 with recorded durations and counts.
- [x] T027 stock PG16 evidence and runtime-role boundary are recorded.
- [x] App-boundary evidence and no-findings result are recorded.
- [x] SQLite compatibility, T028, T029, DB verifier, and container results are recorded.
- [x] QG-001/QG-006/QG-007/QG-023/QG-024 are mapped only for applicable Phase 1 surfaces.
- [x] Synthetic/local-data limitation and excluded environments are recorded.
- [x] Migration skips and failure semantics are recorded.
- [x] Cleanup, limitations, activation blockers, and DoneClaim correction are recorded.
- [x] No secrets or customer data are included.
