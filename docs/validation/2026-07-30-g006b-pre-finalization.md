# G-006B-B1 SQLite pre-finalization repair validation

Date: 2026-07-30

Branch: `codex/nova-platform-tenancy`

Historical rejected repair parent: `bbe51bfa7d76e0bcb44e4c1523e2a20fecb00f58`

Historical runtime-repair rejection control: `262b7391c67b0ad749503d6e845383adb9a9f23e`

Historical runtime-repair launch control: `1c4e33ab54f8006e62c2936d8caadb606958a97d`

Final acceptance-review launch control: `f3d285e88844eb26e456e17bec72271ea2f78e6a`

Evidence-matrix rejection control: `bdba0cd65c52edc78ac39844f662a50041075b45`

Immutable evidence-only delta parent: `485308076395bc426d61ca3c975e50bdb7ecdef3`

Authority remains local legacy-only B1 preparation. This delta does not authorize startup activation, journal-mode transition, WAL checkpointing, provider execution, restore, deployment, production mutation, or final schema upgrade.

## Result

This evidence-only delta closes the final quality rejection without changing the production TypeScript or PowerShell helper. Both archive-parent rows now issue and count a replacement challenge during every one of the 38 distinct child write/publication intervals, bind those 38 challenged temporary paths to the exact final tree, and preserve the retained parent directory FileId. Every restart row now asserts the parent kind/FileId, exact visible-final set, and every preexisting final's kind, bytes, and FileId. Successful execute/resume rows additionally compare each newly created PREPARED/COMMITTED artifact with the exact known golden bytes.

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
| Final archive-parent ownership | 2 (new and exact preexisting), 38 distinct child intervals each | 2/2 issue exactly 38 unique parent-replacement challenges, bind every challenged child to the exact final 38-entry tree, and preserve the retained parent directory FileId. |
| Terminal tree drift | 1 injected extra child after COMMITTED | Returns committed-unverified; all 41 registered files preserve exact bytes/FileIds, the extra survives, database is prepared, and no lock/temp remains. |
| Recovery acquisition loss | 1 child detached immediately before archive-parent retention | Source-absent/detached-present is proven before the broker command; resume returns recovery-required and preserves the detached bytes/FileId plus every other final. |
| WAL last-close movement | 1 scoped real `VACUUM` at authority-connection close | Volume/FileId remain equal while settled size or SHA changes; logical post-close verifier accepts the settled identity and wrong journal pins remain evidence-drift. |
| Pre-ready lock death | 512 MiB sparse database | No ready acknowledgement; second broker exits 16 while first lives; hard death leaves only the database and no lock/temp/process residue. |
| Stable standalone inspection | 512 MiB file, 20 rename/write pairs | A non-mutating `r+` probe proves write sharing before spawn, denial while the helper is alive, and availability after exit; all attacks are denied and exact bytes/FileId/path/size return. |
| Restart state table | 27 (`accepted/prepared/other` x PREPARED `absent/valid/invalid` x COMMITTED `absent/valid/invalid`) | 27/27 match execute/resume/replay rules; every row asserts the archive-parent directory kind/FileId, exact visible-final set, database FileId, and every preexisting final's kind/bytes/FileId. Successful execute/resume rows prove newly created PREPARED/COMMITTED exact golden bytes; all rows retain the exact 38-entry tree and leave zero lock/temp residue. |
| Pin/replay coverage | 17 (2 handoff, 4 binding/path/envelope, 10 source/evidence, 1 successful replay) | Every row snapshots database, archive parent, and every visible final and proves the exact set, bytes, and FileIds are unchanged with zero lock/temp residue. |
| Tamper coverage | 14 raw, malformed, missing/extra, trailing-byte, and independently self-rehashed semantic subrows | Every rejected row snapshots database, archive parent, and every visible final and proves no published evidence was rewritten; genuine pre-read acquisition loss is recovery-required and later semantic/content/tree drift remains evidence-drift. |
| Hard broker death after move but before ready | 4 (backup, archive child, PREPARED, COMMITTED) | 4/4 preserve the exact visible destination and return published- or committed-unverified. |
| Parent EOF during application writes | 5 (backup, archive staging, archive child, PREPARED, COMMITTED) | 5/5 remove exact sentinels and lock without deleting prior finals. |
| Exact-existing publication and derived resources | 12 destination challenges plus 5 preexisting temp/staging occupants | All exact-existing destinations are retained and revalidated; every derived-resource occupant preserves exact bytes/FileId. |
| Released-final process loss | 2 (EOF and hard death after three publication-release acknowledgements) | Every released final preserves exact bytes/FileId; no lock/temp remains. |

The restart table authorizes only fresh execute; resume with valid PREPARED, absent COMMITTED, and an accepted or prepared database; and replay with valid PREPARED/COMMITTED plus the prepared database. No stale lock is broken, missing PREPARED is reconstructed, or automatic restore occurs.

## Validation evidence

Environment: Windows, Node 24.13.1, better-sqlite3 12.9.0, SQLite 3.53.0.

- Current evidence-only targeted gate: `npx vitest run src/lib/__tests__/sqlite-g006b-pre-finalization.test.ts -t "retains the .* final archive parent|dynamically closes the 3x3x3" --reporter=dot` - 3/3 affected cases passed, 68 skipped, exactly 71 enumerated, exit 0; 181.8 seconds tool wall time and 179.91 seconds Vitest duration (178.80 seconds test time).

The immutable `485308076395bc426d61ca3c975e50bdb7ecdef3` parent recorded these inherited source gates; they were not rerun before this evidence-only receipt freeze:

- Frozen authoritative full gate: 71/71 passed, 1/1 file, exit 0; 974.1 seconds tool wall time and 957.10 seconds Vitest duration (951.97 seconds test time).
- Earlier post-readiness pre-freeze full gate: 71/71 passed, 1/1 file, exit 0; 977.75 seconds total and 976.69 seconds test time.
- Affected pin/tamper/inspection gate: 17/17 passed with 54 skipped, exit 0; 240.50 seconds total.
- Standalone 512 MiB readiness probe: three consecutive isolated runs passed 1/1 each, exit 0; test times 1.20, 1.22, and 1.16 seconds.
- Related compatibility/data-transfer/schema gate: 4/4 files passed, 76 passed, 2 environment-gated PostgreSQL tests skipped, exit 0; 33.31 seconds total.
- `npm run typecheck` and `npm run lint` passed; lint reported zero warnings.
- `npm run build` passed with Next.js 16.2.6; compilation completed in 6.4 seconds, TypeScript in 12.2 seconds, and 11/11 static pages were generated.
- `npm run db:verify:recovery` passed the exact 37-application-table recovery contract.
- PowerShell parsing reported 0 errors and the normalized helper hash exactly matched the TypeScript pin.

The 71-case file combines operation tests and direct Windows host probes; it is not a production or deployed end-to-end test. The two inherited related-test skips require PostgreSQL environment configuration and are not counted as passes. Related tests, recovery verification, and the build were not rerun for this locked evidence-only delta because shared and production code did not change. Current post-receipt typecheck, zero-warning lint, helper parser/hash/pin, diff/scope/residue checks, and the frozen authoritative full run are reported only from observed output in the producer handoff rather than preclaimed here. No external service, authenticated production environment, push, deploy, or production mutation was used.

## Remaining boundary

This is a fail-closed Windows/NTFS durability and restart-reconciliation boundary. It does not claim cross-file ACID atomicity or physical-media survival across every controller/storage power-loss mode. It does not self-accept the integration rejection or authorize launch.

The exact stale synthetic root `C:\Users\Masih\AppData\Local\Temp\g006b-identity-cleanup-qjkSgV` was reverified before repair work as the earlier task-owned root containing only `broker.db`, `broker.db.g006b.lock`, and `owned.tmp`, with no subdirectories or owning process. Local destructive-action policy rejected its exact guarded removal, so it remains untouched and recoverable and is not counted as residue from this repair run.

## G-006B-B2 finalization repair receipt

Date: 2026-07-31

Branch: `codex/nova-g006b-finalization-resume`

Checkpoint carry commit: `88f71cb`

This append-only receipt covers the local prepared-legacy `6000` to canonical
final `6002` boundary only. It does not authorize startup activation, provider
execution, a later G-006 card, push, deployment, remote migration, paid
activity, or production mutation.

The repaired B2 state machine authenticates the B1 PREPARED/COMMITTED pair,
publishes a separate B2 PREPARED record, and transfers only an opaque,
unforgeable, one-shot handoff to the coordinator. The coordinator owns its
exact-path root lease, database connection, `BEGIN IMMEDIATE`, fixed rebuild,
commit, close, and independent reopen. No raw database, lease, callback, SQL,
or caller mutation plan crosses the boundary. A recognized handoff is burned
before its evidence is inspected; a plain frozen object is rejected by both
the private consumer and the coordinator entry point.

The Windows broker's database lease and lock remain owned by G-006B across the
handoff. Pre-coordinator verification uses non-settling native inspection under
that lease. The single one-shot `settle` occurs only after coordinator commit,
so the helper's settled read handle cannot block the writer and no second
settle can fail after mutation. B2 temporary artifacts retain the publisher's
existing `.g006b.tmp.<token>` sibling contract. The PowerShell publisher is
byte-unchanged.

Source-driven catalog comparison established that the canonical final schema
requires 19 table rebuilds: the 17 transform tables plus
`tenant_policies` and `compatibility_backfill_receipts`. The coordinator
permits only `crawl_units.location_mode` to be added with the literal
`legacy_zip`, and only the authenticated transitional
`tenant_policies.compatibility_policy_hash` to be removed. Before removal, the
policy id, tenant id, and compatibility hash must match the sole completed
T-028 receipt. Every other column boundary is exact. All defined application
indexes and triggers are dropped and recreated from the pinned canonical
schema inside the same transaction; SQLite autoindexes remain SQLite-owned.

The independent post-commit verifier hashes every canonical baseline column
and every table. It allows only the authenticated compatibility hash column to
be absent and excludes final-only `location_mode` from the legacy T-028
content projection. Execute, pre-mutation resume, post-commit
committed-unverified resume, and replay all end in the exact 37-table final
state at `user_version=6002`, 32/32 target columns, `legacy_zip` location mode,
healthy integrity/foreign keys, and one settle. Raw B2 PREPARED trailing-byte
tampering is rejected before mutation.

Observed local validation on Windows with Node 24.13.1:

- Focused B2/coordinator matrix: 3/3 selected tests passed across 2 files; 108 skipped; exit 0; 41.14 seconds.
- Complete B2/B1 and coordinator regression: 111/111 tests passed across 2 files; exit 0; 1051.90 seconds Vitest duration and 1052.9 seconds command wall time.
- TypeScript: `tsc --noEmit --pretty false` passed, exit 0.
- Focused ESLint over the four changed TypeScript files passed with no output, exit 0.
- `git diff --check` passed.

The complete run includes the inherited B1 Windows broker, restart, FileId,
WAL, retained-final, publication-death, and 512 MiB race coverage plus the new
B2 execute/resume/replay and direct-forgery rows. No external service,
authenticated environment, customer data, push, deploy, production system, or
paid call was used. Build and broader application suites were not rerun for
this receipt and are not claimed.

## G-006B-B2 rejected-source repair delta

The immutable source
`5d246fa477fffd9abb8615862f76e8836c1b0f7a` was rejected by all three
independent read-only reviews and remains preserved as rejected history. The
architecture review found that the final verifier projected away
`tenant_policies.compatibility_policy_hash` but compared only the remaining
column names and row count, allowing changed retained policy payloads to pass.
The security review also found that a same-file write admitted by the outer
Windows share mode could occur after B1 verification but before the
coordinator transaction because the authenticated B1 preservation aggregate
was not reproved under the coordinator's writer lock. The quality review
confirmed both findings and requested stronger pin and forgery coverage.

The repair computes the compatibility-column-excluded tenant-policy payload
from the retained B1 backup after verifying its accepted physical state and
complete preservation baseline. B2 PREPARED authenticates that projection.
Execute, resume, and replay re-derive it from the same retained backup before
accepting PREPARED. The coordinator receives only its pinned payload digest
through the opaque one-shot handoff.

Inside the coordinator-owned `BEGIN IMMEDIATE` and before any mutation, the
complete 37-table B1 preservation aggregate is recomputed with only the four
B1-added `source_card_id` columns projected back out. It must match the
authenticated B1 aggregate. The coordinator's B2 preservation snapshot must
also match the PREPARED tenant-policy payload digest. After commit and the
single native settle, the final verifier hashes the complete retained
tenant-policy projection and compares it with the PREPARED pin.

Additional negative rows prove that wrong B2 PREPARED and COMMITTED handoff
pins are rejected before replay, retained tenant-policy payload tampering is
reported as committed-unverified recovery required without publishing B2
COMMITTED, and null-prototype, frozen plain-object, and proxy handoffs cannot
enter either the private consumer or coordinator.

Observed repair validation on Windows:

- Focused repaired matrix: 3/3 selected tests passed across 2 files;
  108 skipped; exit 0; 50.70 seconds.
- Complete B2/B1 and coordinator regression: 111/111 tests passed across
  2 files; exit 0; 1001.88 seconds Vitest duration and 1003.1 seconds command
  wall time.
- Node 24.13.1 with Vitest 4.0.18; TypeScript no-emit passed.
- Focused ESLint over the four changed TypeScript files passed with no output.
- `git diff --check` passed.

The protected Windows publisher and canonical schema-v1 source remain
byte-unchanged. No external service, authenticated environment, customer data,
later implementation card, push, deploy, remote migration, production system,
or paid call was used.
