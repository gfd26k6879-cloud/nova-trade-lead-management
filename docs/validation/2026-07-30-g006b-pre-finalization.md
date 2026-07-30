# G-006B-B1 SQLite pre-finalization repair validation

Date: 2026-07-30

Branch: `codex/nova-platform-tenancy`

Immutable rejected repair parent: `bbe51bfa7d76e0bcb44e4c1523e2a20fecb00f58`

Integration rejection control: `262b7391c67b0ad749503d6e845383adb9a9f23e`

Launch control: `1c4e33ab54f8006e62c2936d8caadb606958a97d`

Authority remains local legacy-only B1 preparation. This delta does not authorize startup activation, journal-mode transition, WAL checkpointing, provider execution, restore, deployment, production mutation, or final schema upgrade.

## Result

The rejected B1 tip is repaired by extending the long-lived Windows broker's native ownership through the complete operation boundary. Publication acknowledgement now transfers the exact backup, 38 archive children, PREPARED, COMMITTED, and final archive-parent handles into a retained-final registry. The broker challenges each final and its parent before acknowledgement, re-inspects the exact terminal set, requires the archive directory to contain exactly its 38 registered children, flushes parent handles, and releases finals only with the database lease. EOF, transport, and error paths inspect and release handles but never delete published finals. Drift or release uncertainty after COMMIT is committed-unverified.

Resume and replay retain PREPARED (and COMMITTED for replay) before reading either handoff. They then retain the backup, strict archive parent, and all 38 archive children before validation. A real acquisition loss is recovery-required; malformed or semantically invalid retained records preserve the established input/evidence taxonomy. An explicit pre-COMMIT `SqliteG006bError` primary is not masked by cleanup-only publication uncertainty.

The lock is marked delete-on-close immediately after kernel creation and before flush, hash, inspection, or ready output. A broker death before ready therefore removes the lock while an active first broker still excludes a second broker. Standalone `InspectFile` denies write/delete sharing for its entire hash, then rechecks exact identity, size, attributes, link count, and final path before returning.

The public execute/resume/replay union, T-028 receipt contract, G-023 binding, 37-table preservation evidence, schema-3 archive, four-table nullable `source_card_id` mutation, `user_version = 6000`, journal-mode pin, hostile-PATH protection, and error taxonomy remain intact. The independent test oracle implements test-local canonical JSON, domain SHA-256, archive-tree hashing, envelope rehashing, and binding rehashing rather than using production exports for rejection expectations.

## WAL and native identity boundary

The operation accepts only the already-persisted `delete/normal` or `wal/normal` boundary. It reads `PRAGMA journal_mode`; the implementation contains no journal-mode assignment and no WAL checkpoint.

Inspection captures catalog, physical manifest, accepted state, T-028 row and replay, G-023 binding/configuration, 37-table preservation, journal mode, and a `data_version` bracket inside `BEGIN IMMEDIATE`. After rollback and connection close, the broker settles the main file and captures sidecars. A read-only verifier reopens under the settled no-write/delete lease and must reproduce the captured logical evidence before close. The broker then re-inspects sidecars and the main handle and returns that post-close native identity. A real WAL last-close probe preserves volume/FileId while changing main-file size or SHA and is accepted only after this logical revalidation.

All native inspection derives final path, filesystem, and cloud-sync decisions from the retained handle. Standalone native calls, broker command writes, response reads, and exit waits are bounded. The helper is invoked only with absolute `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`, `shell: false`, and the repository-relative canonical helper path.

Final normalized UTF-8/no-BOM helper SHA-256 and TypeScript pin:

`d56b9450dccb8da2877ef12078b78d1887b6ab77ae6d4f181f16b3c33b3e4a27`

## Dynamic matrix

The final test file contains 71 executable Vitest cases. Important dynamic rows inside those cases are:

| Matrix | Rows | Executable assertion |
| --- | ---: | --- |
| Retained final lifetime | 41 exact finals at PREPARED; 42 at terminal (backup, archive parent, 38 children, PREPARED, then COMMITTED) | Every file denies raw write/delete/rename and preserves bytes/FileId; the parent denies rename at PREPARED and terminal; terminal release succeeds only after exact-set inspection. |
| Final archive-parent ownership | 2 (new and exact preexisting) | 2/2 deny parent replacement throughout child publication and finish with the exact 38-entry tree. |
| Terminal tree drift | 1 injected extra child after COMMITTED | Returns committed-unverified; all 41 registered files preserve exact bytes/FileIds, the extra survives, database is prepared, and no lock/temp remains. |
| Recovery acquisition loss | 1 child detached immediately before archive-parent retention | Source-absent/detached-present is proven before the broker command; resume returns recovery-required and preserves the detached bytes/FileId plus every other final. |
| WAL last-close movement | 1 scoped real `VACUUM` at authority-connection close | Volume/FileId remain equal while settled size or SHA changes; logical post-close verifier accepts the settled identity and wrong journal pins remain evidence-drift. |
| Pre-ready lock death | 512 MiB sparse database | No ready acknowledgement; second broker exits 16 while first lives; hard death leaves only the database and no lock/temp/process residue. |
| Stable standalone inspection | 512 MiB file, 20 rename/write pairs | A non-mutating `r+` probe proves write sharing before spawn, denial while the helper is alive, and availability after exit; all attacks are denied and exact bytes/FileId/path/size return. |
| Restart state table | 27 (`accepted/prepared/other` x PREPARED `absent/valid/invalid` x COMMITTED `absent/valid/invalid`) | 27/27 match execute/resume/replay rules; every row preserves database FileId and every preexisting final's bytes/FileId, successful rows have PREPARED/COMMITTED plus 38 children, and all rows leave zero lock/temp residue. |
| Pin/replay coverage | 17 (2 handoff, 4 binding/path/envelope, 10 source/evidence, 1 successful replay) | Every row snapshots database, archive parent, and every visible final and proves the exact set, bytes, and FileIds are unchanged with zero lock/temp residue. |
| Tamper coverage | 14 raw, malformed, missing/extra, trailing-byte, and independently self-rehashed semantic subrows | Every rejected row snapshots database, archive parent, and every visible final and proves no published evidence was rewritten; genuine pre-read acquisition loss is recovery-required and later semantic/content/tree drift remains evidence-drift. |
| Hard broker death after move but before ready | 4 (backup, archive child, PREPARED, COMMITTED) | 4/4 preserve the exact visible destination and return published- or committed-unverified. |
| Parent EOF during application writes | 5 (backup, archive staging, archive child, PREPARED, COMMITTED) | 5/5 remove exact sentinels and lock without deleting prior finals. |
| Exact-existing publication and derived resources | 12 destination challenges plus 5 preexisting temp/staging occupants | All exact-existing destinations are retained and revalidated; every derived-resource occupant preserves exact bytes/FileId. |
| Released-final process loss | 2 (EOF and hard death after three publication-release acknowledgements) | Every released final preserves exact bytes/FileId; no lock/temp remains. |

The restart table authorizes only fresh execute; resume with valid PREPARED, absent COMMITTED, and an accepted or prepared database; and replay with valid PREPARED/COMMITTED plus the prepared database. No stale lock is broken, missing PREPARED is reconstructed, or automatic restore occurs.

## Validation evidence

Environment: Windows, Node 24.13.1, better-sqlite3 12.9.0, SQLite 3.53.0.

- Post-readiness pre-freeze full gate: `npx vitest run src/lib/__tests__/sqlite-g006b-pre-finalization.test.ts --reporter=dot` - 71/71 passed, 1/1 file, exit 0; 977.75 seconds total and 976.69 seconds test time.
- Affected pin/tamper/inspection gate: the focused 17-case command passed 17/17 with 54 skipped, exit 0; 240.50 seconds total.
- Standalone 512 MiB readiness probe: three consecutive isolated runs passed 1/1 each, exit 0; test times 1.20, 1.22, and 1.16 seconds.
- `npx vitest run src/lib/__tests__/compatibility-play.test.ts src/lib/__tests__/compatibility-tenant-backfill.test.ts src/lib/__tests__/data-transfer-contract.test.ts src/lib/__tests__/sqlite-schema-coordinator.test.ts --reporter=dot` - 4/4 files passed, 76 passed, 2 environment-gated PostgreSQL tests skipped, exit 0; 33.31 seconds total.
- `npm run typecheck` - exit 0.
- `npm run lint` - exit 0, zero warnings.
- `npm run build` - Next.js 16.2.6 production build passed, exit 0; compiled in 6.4 seconds, TypeScript completed in 12.2 seconds, 11/11 static pages generated.
- `npm run db:verify:recovery` - exact 37-application-table recovery contract passed, exit 0.
- PowerShell parser and helper hash/pin comparison - 0 parser errors; helper hash exactly equals the TypeScript pin above, exit 0.

The 71-case file combines operation tests and direct Windows host probes; it is not a production or deployed end-to-end test. The two skipped related tests require PostgreSQL environment configuration and are not counted as passes. No external service, authenticated production environment, push, deploy, or production mutation was used. The post-receipt frozen authoritative rerun is reported from observed output in the producer handoff rather than preclaimed here.

## Remaining boundary

This is a fail-closed Windows/NTFS durability and restart-reconciliation boundary. It does not claim cross-file ACID atomicity or physical-media survival across every controller/storage power-loss mode. It does not self-accept the integration rejection or authorize launch.

The exact stale synthetic root `C:\Users\Masih\AppData\Local\Temp\g006b-identity-cleanup-qjkSgV` was reverified before repair work as the earlier task-owned root containing only `broker.db`, `broker.db.g006b.lock`, and `owned.tmp`, with no subdirectories or owning process. Local destructive-action policy rejected its exact guarded removal, so it remains untouched and recoverable and is not counted as residue from this repair run.
