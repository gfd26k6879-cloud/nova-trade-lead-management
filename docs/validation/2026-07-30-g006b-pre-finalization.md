# G-006B-B1 SQLite pre-finalization validation

Date: 2026-07-30

Branch: `codex/nova-platform-tenancy`

Repair parent: `6c8c2dcbb6ca4cee0f575471ede8e3ffc9dde218`

Binding controls: `2f42e50cbbc5ecdea783b637e263fb9e5a89b8a9`, `b48d0bcf3680d564300416a237e72d5b1c781aa6`

Authority: local legacy-only B1 preparation. No startup activation, journal-mode transition, WAL checkpoint, provider use, external activity, restore, deployment, or final schema upgrade is authorized.

## Result

The B1 boundary is closed and restart-reconcilable for the exact accepted T-028 legacy SQLite state. Its only database mutation is one `BEGIN IMMEDIATE` transaction that adds nullable `source_card_id TEXT` to `place_cache`, `places_master`, `place_observations`, and `api_usage_events`, fills only null values with `google_places_legacy`, and sets `user_version` to `6000`.

The public input is an exact discriminated union:

- `execute` accepts the database plus explicit final backup/archive/PREPARED/COMMITTED destinations and all evidence pins;
- `resume` additionally requires the exact expected PREPARED handoff ID; and
- `replay` additionally requires the exact expected COMMITTED handoff ID.

The caller cannot supply the PowerShell executable, helper path/hash, lock path, temporary paths, or archive staging path. Validation is descriptor-first and rejects accessors, proxies, symbols, sparse arrays, malformed paths, and extra authority before reading nested values. It snapshots the validated manifest/seed with `structuredClone`, derives unpredictable names from a fresh 24-byte token per invocation, and deep-freezes the internal authority record before the first asynchronous boundary. Results are deep-frozen mode/status unions.

## Transaction and evidence order

The operation acquires a native retained FileId lease and create-new database lock before opening SQLite. For execute/resume mutation, one writer remains in `BEGIN IMMEDIATE` across exact prechecks, the SQLite online backup, archive publication, PREPARED publication, both native FileId rechecks, all four DDL/backfill steps, and `COMMIT` invocation. PREPARED is therefore durable before mutation becomes reachable.

The backup is reopened and checked against the accepted catalog, T-028 receipt, and all-37-table type-tagged preservation evidence. The schema-3 archive is exactly 37 table JSON files plus `manifest.json`. Replay regenerates every expected schema-3 byte sequence from the pinned backup, so a semantically altered archive is rejected even if an attacker recomputes its file hashes, manifest, tree hash, PREPARED envelope, COMMITTED link, and binding hash. Backup, every archive entry, PREPARED, and COMMITTED use the retained native no-replace/write-through publisher. Owned staging cleanup is create-time handle/FileId-bound; caller-selected cleanup targets do not exist in the API, and a swapped path occupant is never treated as owned.

Once `COMMIT` is invoked, the writer is closed before settled main-file bytes are captured. Any commit error is reconciled against a fresh post-state; any unresolved commit, verification, publication, lease-release, or cleanup failure is reported as `G006B_COMMITTED_UNVERIFIED_RECOVERY_REQUIRED` with the original failure and ordered cleanup diagnostics.

Fresh post verification uses one read transaction and a same-connection `data_version` bracket. After that connection closes, the retained settled native lease must report the same main-file FileId and SHA-256 before COMMITTED publication.

## DELETE and WAL behavior

The operation accepts only the already-persisted `delete/normal` or `wal/normal` boundary. It reads `PRAGMA journal_mode`; it never assigns journal mode and never issues `wal_checkpoint`.

On this pinned Windows host (Node 24.13.1, better-sqlite3 12.9.0, SQLite 3.53.0), last-writer close in WAL mode can checkpoint engine-owned frames, keep FileId, change main-file SHA-256, and remove WAL/SHM. For that reason no pre-close main SHA is claimed as the committed physical identity. The writer closes while the original no-delete FileId lease remains held. A second main-file handle with share-read only then denies write transactions while allowing the read-only verifier.

Before the settled lease is acquired, any nonzero WAL is rejected. A read-only verification connection may leave an exact zero-byte WAL and a validated local NTFS/non-cloud SHM; this is accepted, while any nonzero WAL/frame is rejected. The final receipt records the preserved journal mode and the settled post-close main identity. The contract does not claim no engine-owned page movement or fixed pre-close main bytes.

## Native Windows boundary

The internal helper is invoked only through absolute `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe` with `shell: false`. Its repository-relative canonical path and normalized UTF-8/no-BOM SHA-256 (`ea20039471215830d3b6fe12be233aabccd8fb947fe78016f51815f0fed73cda`) are pinned and rechecked around native calls. Hostile `PATH` content and a modified helper copy cannot redirect execution.

The helper uses retained native handles and direct Windows APIs for FileId/volume/attributes/final-path inspection, hashing, `FlushFileBuffers`, rooted no-replace `NtSetInformationFile(FileRenameInformation)`, handle disposition cleanup, fixed-local-NTFS checks, and Cloud Files rejection. Files and directories are created atomically with native create-new semantics and recorded in a create-time identity ledger. It rejects UNC/device/ADS/traversal aliases, reparse/offline/cloud-recall paths, hard-linked files, noncanonical final paths, broad parent ACLs, untrusted ownership, mismatched destination races, and unexpected native outcomes. Exact-existing races reconcile only byte-identical destinations; differing bytes fail closed. Once a no-replace move succeeds, all later uncertainty exits as published-unverified (native exit 14); visible final destinations are retained and never deleted.

The long-lived broker protocol retains the database, lock, parent, created-resource, and published-destination handles through Node challenge/inspect/release. It supports handle-derived identity rechecks, adds the settled share-read-only database handle after writer close, and deletes only identities recorded as owned on normal release or protocol failure/EOF. Preexisting derived names are refused, post-registration replacement occupants survive, and two-publisher identical/different-byte races reconcile deterministically.

The public inspection API uses the same native database/lock lease, rejects nonzero WAL before and after inspection, opens one read-write connection, enters `BEGIN IMMEDIATE`, captures T-028/G-023/all-row evidence and `data_version` inside that stable snapshot, rolls back and closes, settles the main-file identity, and only then returns deep-frozen pins including `journalMode`.

## Restart rules

- `execute` requires both handoff records absent.
- `resume` requires PREPARED present, COMMITTED absent, and an exact expected PREPARED handoff ID.
- `replay` requires both records and both exact expected handoff IDs.
- Resume with accepted pre-state performs the one mutation; resume with exact prepared post-state does not repeat it.
- Replay performs no mutation and compares COMMITTED with a newly reopened stable snapshot.
- Any other closed sidecar/database pairing is rejected as evidence/state/recovery-required before mutation. Missing COMMITTED with valid PREPARED plus exact prepared database state resumes idempotently; missing PREPARED never reconstructs authority. No stale lock is broken and no automatic restore occurs.

## B1 mandatory matrix

| ID | Proof |
| --- | --- |
| B1-01 | Exact descriptor-safe public union rejects accessors, proxies, symbols, extra authority, and malformed mode-specific handoff fields. |
| B1-02 | Caller-supplied helper/temp/lock authority is rejected; a nominated victim file remains byte-exact. |
| B1-03 | Raw nested input mutated immediately after invocation cannot alter the validated immutable snapshot. |
| B1-04 | Native create-new lock refusal and missing-PREPARED resume both occur before mutation. |
| B1-05 | Crash boundary after durable PREPARED leaves the database in exact accepted pre-state. |
| B1-06 | Wrong expected PREPARED/COMMITTED handoff IDs fail closed. |
| B1-07 | Precommit writer primary error preserves ordered rollback/cleanup diagnostics. |
| B1-08 | Post-commit verifier failure is committed-unverified, never an ordinary failure. |
| B1-09 | Post-commit lease-release/cleanup failure is committed-unverified and retains published evidence. |
| B1-10 | WAL mode survives B1; source contains no checkpoint pragma or journal-mode assignment. |
| B1-11 | Post-close stable lease keeps main FileId/SHA exact across read verification, rejects nonzero WAL, and denies write transactions. |
| B1-12 | Explicit pinned replay returns a deep-frozen `mode: replay`, `status: replayed` result. |

Additional adversarial coverage binds every source/T-028/G-023/preservation/journal evidence pin; rejects byte-identical database replacement with a different FileId; covers every preexisting and swapped derived resource; exercises identical and different-byte two-publisher races; enumerates closed restart combinations; and rejects raw plus self-rehashed PREPARED, COMMITTED, and archive tampering.

## Validation evidence

Current repair validation:

- `npm run typecheck` - exit 0.
- `npm run lint` - exit 0, zero warnings.
- `npm run build` - Next.js 16.2.6 production build passed, exit 0.
- `npx vitest run src/lib/__tests__/sqlite-g006b-pre-finalization.test.ts` - 36/36 passed in 174.69 seconds (173.80 seconds test time).
- Related compatibility/play/transfer/schema regression set - 76 passed, 2 environment-gated PostgreSQL tests skipped, exit 0.
- `npm run db:verify:recovery` - exact 37-table recovery contract passed, exit 0.
- PowerShell parser and normalized helper hash/pin comparison - exit 0. Host-level broker tests cover native create refusal, retained cleanup, post-registration swaps, exact-existing publication, fresh no-replace publication, publication challenge/release, exit-14 EOF, and replacement-safe fallback cleanup.
- Independent WAL host proof - retained writer preserved main/WAL bytes across backup/read close; last-writer close preserved FileId but could change main SHA; mode remained `wal`; trace contained no checkpoint or journal-mode assignment.
- Independent settled-lease proof - readonly snapshot succeeded with stable main FileId/SHA; write transaction failed `SQLITE_READONLY`; verifier could leave zero-byte WAL plus SHM.

The native protocol is a fail-closed Windows/NTFS durability and restart-reconciliation boundary. It does not claim cross-file ACID atomicity or physical-media survival across every controller/storage power-loss mode.
