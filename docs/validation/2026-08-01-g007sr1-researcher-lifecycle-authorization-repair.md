# G-007SR1 researcher lifecycle authorization repair

Date: 2026-08-01

## Result

G-007SR1 is accepted at implementation commit
`726765ad7f1eeb9df91dcf7648e837561cda7792`. It closes the independently
reproduced P1 compatibility authorization defect without a schema migration,
tenant cutover, hosted operation, or UI redesign.

Researcher inventory and object access now have separate fail-closed policies:

- owned Leads and Explore are clamped to active, nonexcluded inventory;
- owned Leads are restricted to the current researcher, while Explore remains
  unassigned and market-visible;
- direct `status=excluded`, `includeExcluded=true`, and archived selectors
  cannot broaden either researcher list;
- detail, metadata, notes, and ordinary mutations require an owned, active,
  nonexcluded, market-visible lead;
- claim is a distinct unassigned, active, nonexcluded, market-visible
  capability;
- the researcher claim SQL repeats unassigned and lifecycle predicates in one
  atomic update and rejects already-self claims;
- the admin action selects the preserved legacy unassigned-or-self SQL path,
  including retained archived/excluded inventory; and
- a denied atomic claim race returns the generic not-found result without an
  owner lookup or audit event.

The protected lead-detail metadata path was added to the packet after
independent review proved that it emitted the lead name before the page-body
object check. Metadata now authenticates and applies the same canonical read
policy before emitting an identity.

## Exact write set

- `src/lib/lead-access.ts`
- claim-only behavior in `src/lib/leads/actions.ts`
- claim-only SQL in `src/lib/db/queries.ts`
- `src/app/(protected)/leads/[id]/page.tsx` metadata authorization
- focused access, action, query, Explore page/map, and metadata tests

No migration or dependency changed. Migration inventory remains 54 discovered,
52 applied, and two runtime-only skips. Sequence `202607310010` remains free.
The G-007 index crosswalk remains 43 classified and 19 unclassified (G-003
20/19, G-002 13/0). Parent G-007 remains open; P34 is not opened by this
receipt.

## Validation

All authoritative commands used Node 24.13.1 and npm 11.8.0 through `mise`.
Root independently obtained:

- focused behavior: 83/83 across ten files;
- TypeScript: pass;
- focused ESLint over all ten packet files: pass;
- `git diff --check`: pass;
- recovery contract: 37 application tables;
- Fedora-portable coordinator: 12 passed, 26 Windows-native skipped;
- production build: 11/11 static pages;
- fresh PostgreSQL 16.14 G-002: 2/2;
- fresh PostgreSQL 16.14 G-003: 6/6;
- disposable PostgreSQL 16.14 G-004A/P20A: 2/2;
- disposable PostgreSQL 16.14 G-005: 1/1; and
- fresh PostgreSQL 16.14 T-029: 19/19 at 54/52/2.

Independent test/evidence review passed 72/72 across nine files. Independent
architecture/security rereview passed 64/64 across eight files. Both reviewers
accept with no remaining P0, P1, or P2; the implementer did not accept its own
work.

## Invalid and unrelated invocations

The following are excluded from acceptance evidence and recorded truthfully:

- the first scope-amendment commit attempt stopped because no Git identity was
  configured; the exact staged documents were committed with the established
  author identity through one-command Git configuration, without changing
  account settings;
- implementer tests first exposed an explicit-`undefined` mock-call mismatch
  and an incomplete admin fixture; both were corrected and rerun;
- root's unfiltered full `npm test` incorrectly entered the paused Windows-only
  G-006 lane on Fedora and failed because `powershell.exe` is absent;
- the handoff's older single-file exclusion still entered two downstream
  Windows-dependent G-006 compatibility suites and was also rejected;
- excluding exactly those three Windows-dependent files produced 2,296 passes
  and one unrelated unchanged failure in
  `tenant-deletion-job-schema.test.ts`: its test computes `now + 7 years`
  immediately before a later default `created_at`, so the exact lower-bound
  check can be milliseconds short. Isolated replay was 18/19 with the same
  failure. No G-007SR1 file or behavior is involved; and
- the first G-002 command used a database name outside the test's mandatory
  prefix and stopped before database work. A new correctly named database was
  created and passed 2/2.

No Fedora result replaces the historical Windows 111/111 evidence.

## Cleanup and boundaries

The root PostgreSQL container, its isolated databases, loopback listener, and
all G-004A/G-005 harness containers are removed. No task process or failed-run
G-006 temporary directory remains. No hosted Supabase, remote migration,
provider call, production/staging/customer-data access, deployment, push, pull
request, credential change, outreach, or other external action occurred.

`main` remains `8225df619a96a088f18ff7f574a36b157d55dd2f`. The handoff tag
object remains `a3f8278f600be87962642842a3fdd7600242cffd`, peeling to
`0c48035ef4a44b64580716b04d3b629f0c3b5b47`.
