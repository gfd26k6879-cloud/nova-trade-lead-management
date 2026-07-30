# G-006B-B1 SQLite pre-finalization repair validation

Date: 2026-07-30

Branch: `codex/nova-platform-tenancy`

Immutable repair parent: `9dc6742baf0cb5472871449c0b409b55f189ec67`

Integration rejection control: `752f17a1e0190b2a2cde67359f004df9ed0af647`

Launch control: `f4e5390cf6f39088c87bb9f565f5989fe9f38f76`

Authority remains local legacy-only B1 preparation. This delta does not authorize startup activation, journal-mode transition, WAL checkpointing, provider execution, restore, deployment, production mutation, or final schema upgrade.

## Result

The rejected B1 tip is repaired by making the long-lived Windows broker the sole writer and lifecycle owner for backup, archive, PREPARED, and COMMITTED staging files. Each file is created with a retained native handle, written in bounded chunks through that same handle, flushed, inspected, and moved with no-replace semantics without a Node path reopen. The backup bytes come from `better-sqlite3` serialization while the existing `BEGIN IMMEDIATE` transaction remains held.

The final archive directory is retained through all 38 child publications, its parent is flushed through the broker, and its complete tree is validated before release. A newly created final directory is persistent rather than cleanup-owned; an exact preexisting final directory is retained as a non-owning resource. Cleanup-owned resources are finalized in reverse creation order, so children precede parents. Persistent and non-owning resources are released, not deleted. The exact lock identity is deleted and its parent flushed after resource cleanup. Cleanup failures remain ordered diagnostics.

After any publication command loses the broker, Node independently inspects the exact recorded source and destination. An exact source identity with exact bytes is an ordinary failure only when no earlier publication occurred. A missing, replaced, or changed source is publication-uncertain; the destination is preserved, exact fallback cleanup is attempted only against recorded identities, and the exact lock receives the same identity-safe fallback. A moved destination is never deleted. Once `COMMIT` has been invoked, all unresolved verification, publication, transport, lease-release, or cleanup outcomes are committed-unverified.

The public execute/resume/replay union, T-028 receipt contract, G-023 binding, 37-table preservation evidence, schema-3 archive, four-table nullable `source_card_id` mutation, `user_version = 6000`, journal-mode pin, hostile-PATH protection, and error taxonomy remain intact. Error details are normalized so a G006B code is not duplicated when one G006B error wraps another.

## WAL and native identity boundary

The operation accepts only the already-persisted `delete/normal` or `wal/normal` boundary. It reads `PRAGMA journal_mode`; the implementation contains no journal-mode assignment and no WAL checkpoint.

Zero-WAL inspection is performed while `BEGIN IMMEDIATE` excludes a valid competing writer. After writer close, the broker acquires the settled main-file handle, then captures WAL/SHM through retained metadata handles derived from their final paths. It rejects a nonzero WAL, later WAL appearance, sidecar disappearance or replacement, and size growth. It rechecks the retained sidecars after the read-only verifier before releasing them. The settled main identity is authoritative; the repair does not claim unsupported equality between pre-close and post-close main-file size/SHA.

All native inspection derives the final path, filesystem, and cloud-sync decision from the retained handle. Standalone native calls, broker command writes, response reads, and exit waits are bounded. The helper is invoked only with absolute `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`, `shell: false`, and a repository-relative canonical helper path.

Final normalized UTF-8/no-BOM helper SHA-256 and TypeScript pin:

`30ed26bdb82a104412a35e4dc2251e19f92b6a42d670aba63cbec04c522c0e75`

## Dynamic matrix

The final test file contains 64 Vitest cases: 49 operation/contract cases using temporary SQLite fixtures and 15 direct Windows broker/host cases. Important dynamic rows executed inside those cases were:

| Matrix | Rows | Result |
| --- | ---: | --- |
| Application-write substitution attempts | 79 retained paths covering backup, both archive stages, PREPARED, and COMMITTED | 79/79 rename and competing path-write attempts denied; zero temporary residue |
| Final archive parent ownership | 2 (new and exact preexisting) | 2/2 retained through all 38 child publications; exact 38-entry tree |
| Hard broker death after move but before ready | 4 (backup, archive child, PREPARED, COMMITTED) | 4/4 preserved the exact visible destination and returned published- or committed-unverified |
| Parent EOF during application writes | 5 (backup, archive staging, archive child, PREPARED, COMMITTED) | 5/5 removed exact sentinels and lock without deleting prior finals |
| Restart state table | 27 (`accepted/prepared/other` x PREPARED `absent/valid/invalid` x COMMITTED `absent/valid/invalid`) | 27/27 matched the explicit execute/resume/replay rules; rejected rows preserved exact database bytes and left zero temp/lock residue |
| Source identity pins | 4 (volume serial, FileId, size, SHA-256) | 4/4 rejected before mutation |
| Other evidence pins | 6 (accepted digest, T-028 row, G-023 binding, G-023 configuration, preservation, journal mode) | 6/6 rejected before mutation |
| Exact-existing publication | 12 destination challenges | 12/12 retained and revalidated exact bytes |
| Preexisting derived resources | 5 (backup temp, archive staging, archive child temp, PREPARED temp, COMMITTED temp) | 5/5 refused and preserved the occupant |
| Retained sidecar races | 3 (replacement/disappearance, captured growth, appearance after absent capture) | 3/3 denied or rejected with exact lock cleanup |
| Tamper coverage | PREPARED/COMMITTED missing, extra, raw alteration, self-rehashed semantic alteration; archive missing, extra, altered, self-rehashed semantic alteration; backup byte alteration | All rows rejected; published evidence not rewritten |
| Binding/conflict coverage | operation ID, archive path, envelope hash, committed binding hash, nonidentical COMMITTED destination | All rows rejected; conflicting COMMITTED bytes preserved and reported committed-unverified |
| Broker lifecycle | EOF child-before-parent cleanup, persistent release, exact lock deletion, two-broker exclusion, identical/different two-publisher races, real cleanup FileId mismatch | All rows passed; replacement occupants survived |

The restart table authorizes only fresh execute; resume with valid PREPARED, absent COMMITTED, and an accepted or prepared database; and replay with valid PREPARED/COMMITTED plus the prepared database. No stale lock is broken, missing PREPARED is not reconstructed, and no automatic restore occurs.

## Validation evidence

Environment used for the final local gates: Windows, Node 24.13.1, better-sqlite3 12.9.0, SQLite 3.53.0.

- `npx vitest run src/lib/__tests__/sqlite-g006b-pre-finalization.test.ts --reporter=dot` - 64/64 passed, 1/1 file, exit 0; 648.61 seconds total and 647.69 seconds test time; no declared test or command timeout fired.
- `npx vitest run src/lib/__tests__/compatibility-play.test.ts src/lib/__tests__/compatibility-tenant-backfill.test.ts src/lib/__tests__/data-transfer-contract.test.ts src/lib/__tests__/sqlite-schema-coordinator.test.ts --reporter=dot` - 4/4 files passed, 76 passed, 2 environment-gated PostgreSQL tests skipped, exit 0.
- `npm run typecheck` - exit 0.
- `npm run lint` - exit 0, zero warnings.
- `npm run build` - Next.js 16.2.6 production build passed, exit 0; compiled in 6.0 seconds, TypeScript completed in 11.3 seconds, 11/11 static pages generated.
- `npm run db:verify:recovery` - exact 37-application-table recovery contract passed, exit 0.
- PowerShell parser and helper hash/pin comparison - 0 parser errors; helper hash exactly equals the TypeScript pin above, exit 0.

The 64-case file includes both operation-level tests and direct host probes; it is not described as a production or deployed end-to-end test. The two skipped related tests require PostgreSQL environment configuration and are not counted as passes. No external service, authenticated production environment, push, deploy, or production mutation was used.

## Remaining boundary

This is a fail-closed Windows/NTFS durability and restart-reconciliation boundary. It does not claim cross-file ACID atomicity or physical-media survival across every controller/storage power-loss mode. It does not self-accept the integration rejection or authorize launch.
