# G-006B-B1 SQLite pre-finalization validation

Date: 2026-07-30

Branch: `codex/nova-platform-tenancy`

Repair parent: `07a21296e5a5fb3758165415ba94355da874a77f`

Binding integration-control revision: `b55b19a`

Authority: local legacy-only B1 preparation. No startup activation, journal-mode transition, WAL checkpoint, provider use, external activity, restore, deployment, or final schema upgrade is authorized.

## Result

The B1 boundary is closed and restart-reconcilable for the exact accepted T-028 legacy SQLite state. Its only database mutation is one `BEGIN IMMEDIATE` transaction that adds nullable `source_card_id TEXT` to `place_cache`, `places_master`, `place_observations`, and `api_usage_events`, fills only null values with `google_places_legacy`, and sets `user_version` to `6000`.

The public input is an exact discriminated union:

- `execute` accepts the database plus explicit final backup/archive/PREPARED/COMMITTED destinations and all evidence pins;
- `resume` additionally requires the exact expected PREPARED handoff ID; and
- `replay` additionally requires the exact expected COMMITTED handoff ID.

The caller cannot supply the PowerShell executable, helper path/hash, lock path, temporary paths, or archive staging path. Validation accepts only enumerable data properties, recursively validates manifest/seed content, snapshots it with `structuredClone`, derives private resource names, and deep-freezes the internal authority record before the first asynchronous boundary. Results are deep-frozen mode/status unions.

## Transaction and evidence order

The operation acquires a native retained FileId lease and create-new database lock before opening SQLite. For execute/resume mutation, one writer remains in `BEGIN IMMEDIATE` across exact prechecks, the SQLite online backup, archive publication, PREPARED publication, both native FileId rechecks, all four DDL/backfill steps, and `COMMIT` invocation. PREPARED is therefore durable before mutation becomes reachable.

The backup is reopened and checked against the accepted catalog, T-028 receipt, and all-37-table type-tagged preservation evidence. The schema-3 archive is exactly 37 table JSON files plus `manifest.json`. Backup, archive entries, PREPARED, and COMMITTED use a native no-replace/write-through publisher. Owned staging cleanup is handle-identity-bound; caller-selected cleanup targets do not exist in the API.

Once `COMMIT` is invoked, the writer is closed before settled main-file bytes are captured. Any commit error is reconciled against a fresh post-state; any unresolved commit, verification, publication, lease-release, or cleanup failure is reported as `G006B_COMMITTED_UNVERIFIED_RECOVERY_REQUIRED` with the original failure and ordered cleanup diagnostics.

Fresh post verification uses one read transaction and a same-connection `data_version` bracket. After that connection closes, the retained settled native lease must report the same main-file FileId and SHA-256 before COMMITTED publication.

## DELETE and WAL behavior

The operation accepts only the already-persisted `delete/normal` or `wal/normal` boundary. It reads `PRAGMA journal_mode`; it never assigns journal mode and never issues `wal_checkpoint`.

On this pinned Windows host (Node 24.13.1, better-sqlite3 12.9.0, SQLite 3.53.0), last-writer close in WAL mode can checkpoint engine-owned frames, keep FileId, change main-file SHA-256, and remove WAL/SHM. For that reason no pre-close main SHA is claimed as the committed physical identity. The writer closes while the original no-delete FileId lease remains held. A second main-file handle with share-read only then denies write transactions while allowing the read-only verifier.

Before the settled lease is acquired, any nonzero WAL is rejected. A read-only verification connection may leave an exact zero-byte WAL and a validated local NTFS/non-cloud SHM; this is accepted, while any nonzero WAL/frame is rejected. The final receipt records the preserved journal mode and the settled post-close main identity. The contract does not claim no engine-owned page movement or fixed pre-close main bytes.

## Native Windows boundary

The internal helper is invoked only through absolute `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe` with `shell: false`. Its repository-relative canonical path and normalized UTF-8/no-BOM SHA-256 are pinned and rechecked around native calls.

The helper uses retained native handles and direct Windows APIs for FileId/volume/attributes/final-path inspection, hashing, `FlushFileBuffers`, no-replace `MoveFileExW(..., MOVEFILE_WRITE_THROUGH)`, handle disposition cleanup, fixed-local-NTFS checks, and Cloud Files rejection. It rejects UNC/device/ADS/traversal aliases, reparse/offline/cloud-recall paths, hard-linked files, noncanonical final paths, broad parent ACLs, untrusted ownership, mismatched destination races, and unexpected native outcomes. Once the no-replace move succeeds, all later uncertainty exits as published-unverified; visible final destinations are not deleted.

The long-lived lease protocol retains the database and parent handles, owns the exact derived lock, supports handle-derived identity rechecks, adds the settled share-read-only handle after writer close, and deletes only its own lock by handle on normal release or protocol failure/EOF.

## Restart rules

- `execute` requires both handoff records absent.
- `resume` requires PREPARED present, COMMITTED absent, and an exact expected PREPARED handoff ID.
- `replay` requires both records and both exact expected handoff IDs.
- Resume with accepted pre-state performs the one mutation; resume with exact prepared post-state does not repeat it.
- Replay performs no mutation and compares COMMITTED with a newly reopened stable snapshot.
- Any other sidecar/state pairing is rejected as state/recovery-required. No stale lock is broken and no automatic restore occurs.

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

## Validation evidence

Current repair validation:

- `npm run typecheck` - exit 0.
- `npm run lint` - exit 0, zero warnings.
- `npm run build` - Next.js 16.2.6 production build passed, exit 0.
- `npm test -- --run src/lib/__tests__/sqlite-g006b-pre-finalization.test.ts` - 5/5 passed in 86.32 seconds after final cleanup hardening.
- Related compatibility/play/transfer/schema regression set - 76 passed, 2 environment-gated PostgreSQL tests skipped, exit 0.
- `npm run db:verify:recovery` - exact 37-table recovery contract passed, exit 0.
- PowerShell parser, `InspectFile`, `FlushDirectory`, lease inspect/settle/release, exact-existing publication, and fresh no-replace publication probes - exit 0 with zero probe residue.
- Independent WAL host proof - retained writer preserved main/WAL bytes across backup/read close; last-writer close preserved FileId but could change main SHA; mode remained `wal`; trace contained no checkpoint or journal-mode assignment.
- Independent settled-lease proof - readonly snapshot succeeded with stable main FileId/SHA; write transaction failed `SQLITE_READONLY`; verifier could leave zero-byte WAL plus SHM.

The native protocol is a fail-closed Windows/NTFS durability and restart-reconciliation boundary. It does not claim cross-file ACID atomicity or physical-media survival across every controller/storage power-loss mode.
