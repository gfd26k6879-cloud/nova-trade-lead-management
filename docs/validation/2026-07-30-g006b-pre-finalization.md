# G-006B-B1 SQLite pre-finalization validation

Date: 2026-07-30

Branch: `codex/nova-platform-tenancy`

Authorized baseline: `99d3227a874bd9ed137924d1aaa981ab0f4e6012`

Authority: local legacy-only B1 preparation; no startup activation, provider use, external activity, restore, deployment, or final schema upgrade.

## Result

Implemented a fail-closed, restart-reconcilable B1 operation for the exact accepted T-028 legacy SQLite state. The sole database mutation is one owned `BEGIN IMMEDIATE` transaction which:

1. adds nullable `source_card_id TEXT` to `place_cache`, `places_master`, `place_observations`, and `api_usage_events`;
2. updates only null values to the literal `google_places_legacy`; and
3. sets `PRAGMA user_version = 6000`.

The operation does not grant provider execution and cannot perform caller-supplied SQL.

## Durable evidence order

Before mutation, the implementation requires the exact selected database/native identity, T-028 manifest and immutable receipt, accepted G-023 legacy play binding, all-37-table type-tagged preservation digest, health checks, and the accepted legacy catalog/physical state. While an independent writer owns `BEGIN IMMEDIATE`, a separate SQLite online backup is produced and then verified after reopen.

The verified backup is exported as the frozen schema-3 recovery contract: exactly 37 table JSON files plus `manifest.json`, with no extra entries. Every final archive file, the backup, and both sidecars cross the native no-replace publisher. Mutation is not reachable until a strict canonical PREPARED record is reopened and verified.

Prepared and committed envelopes have the exact outer keys `format`, `schemaVersion`, `phase`, `handoffId`, `recordSha256`, and `payload`. They use:

- format `novatrade.sqlite-g006b-preparation` and schema version `1`;
- recursive UTF-16 code-unit key ordering and UTF-8 without BOM;
- safe-integer-only outer numbers, with undefined, nonfinite values, `-0`, proxies, cycles, decorated/sparse arrays, hidden/symbol keys, and lone surrogates rejected;
- exact domains `NOVATRADE\0G006B\0B1\0PREPARED\0V1\0`, `NOVATRADE\0G006B\0B1\0COMMITTED\0V1\0`, and `NOVATRADE\0G006B\0B1\0BINDING\0V1\0`;
- `handoffId = "g006b:v1:" + recordSha256`.

The exact G-023 seed and binding contain the accepted decimal `0.55`; therefore each is retained as canonical JSON text plus its exact UTF-8 SHA-256. Replay parses the text, requires canonical byte equality, reruns `parseLegacyWebsiteLeadPlayJson` and `bindLegacyWebsiteLeadPlay`, and compares the full accepted binding.

## Windows durability boundary

`scripts/g006b-windows-durable-publish.ps1` is invoked with static argv via `powershell.exe -NoProfile -NonInteractive -File`. Its embedded C# uses direct Windows APIs for:

- `CreateFileW` with read/write/delete sharing and `FILE_FLAG_OPEN_REPARSE_POINT`;
- `GetFileInformationByHandleEx` file ID, volume serial, size, and hard-link count;
- SHA-256 through the retained native handle;
- `FlushFileBuffers` on files and directories;
- `MoveFileExW` with `MOVEFILE_WRITE_THROUGH`, without replace or copy flags;
- `CfGetSyncRootInfoByPath` fail-closed cloud-root detection; and
- `DeleteFileW` only for an owned, byte-identical sibling temporary during idempotent replay.

The publisher accepts only canonical drive-letter paths on a fixed local NTFS volume. It rejects UNC/device/ADS/traversal aliases, reparse/offline/cloud-recall paths, Cloud Files sync roots, non-files, hard links, a non-sibling or wrongly named temporary, an existing nonidentical destination, untrusted parent ownership, and broad Everyone/Authenticated Users/Users/Guests write or delete ACLs. It retains the source handle across the write-through rename, flushes it again after rename, flushes the parent directory, and reopens/revalidates destination and parent identity, size, and SHA-256. A post-move verification failure is reported as published-unverified/recovery-required; the visible destination is never deleted.

This is a fail-closed Windows/NTFS API durability protocol and restart reconciliation contract. It does not claim cross-file ACID atomicity or prove physical-media survival across every controller or storage-device power-loss mode.

## Restart and failure behavior

- No valid PREPARED record: resume rejects before mutation.
- Valid PREPARED plus exact accepted legacy state: artifacts are reverified, then the one B1 transaction may run.
- Valid PREPARED plus exact prepared-legacy state: no mutation is replayed; fresh read-only verification produces COMMITTED.
- Valid COMMITTED plus exact prepared-legacy state: exact replay result.
- Any other record/state pairing: recovery-required, with no automatic restore or stale-lock break.
- A database-specific lock is create-new only. The operation removes only a lock it owns; an existing lock is never broken.
- Cleanup failures are ordered diagnostics on the primary error. Once the database commit succeeds, later failures are classified committed-unverified/recovery-required.

## Validation evidence

Passed during implementation:

- `npm run typecheck` — exit 0.
- `npx eslint src/lib/db/sqlite-g006b-pre-finalization.ts src/lib/__tests__/sqlite-g006b-pre-finalization.test.ts` — exit 0, zero warnings.
- `npx vitest run src/lib/__tests__/sqlite-g006b-pre-finalization.test.ts --reporter=verbose` — final run 3/3 passed in 86.93 seconds.
- `npx vitest run src/lib/__tests__/compatibility-tenant-backfill.test.ts src/lib/__tests__/compatibility-play.test.ts src/lib/__tests__/data-transfer-contract.test.ts src/lib/__tests__/sqlite-schema-coordinator.test.ts --reporter=verbose` — 76 passed, 2 environment-gated PostgreSQL tests skipped, exit 0.
- `npm run db:verify:recovery` — exact 37-table recovery contract passed, exit 0.
- PowerShell parser plus native API static check — passed, exit 0.
- Native host proof, dedicated worktree: `FlushDirectory` exit 0 on local NTFS.
- Native host negative proof, OneDrive repository: `CfGetSyncRootInfoByPath` rejection, exit 10.
- Native inspect proof: exact NTFS volume/file identity, link count 1, byte count, and lowercase SHA-256 returned, exit 0.

The focused test proves strict canonical grammar, PREPARED-before-mutation, prepared/pre restart, prepared/post restart, COMMITTED replay, backup and sidecar tamper rejection, stale-lock refusal, no-PREPARED/no-mutation refusal, exact prepared catalog pins, source counts, rollback diagnostic precedence, schema-3 archive publication, and zero fixture residue.

Repository/scope closeout: exactly the four authorized new paths, no tracked baseline edits, no test fixture residue, and no external activity.
