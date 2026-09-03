import { describe, expect, it } from "vitest";

import {
  releaseDocumentIncidentHold,
  requestDocumentDeletion,
  transitionDocumentVersion,
  type DocumentLifecycleState,
  type DocumentVersionSnapshot,
} from "@/lib/documents";

const VERSION_ID = "33333333-3333-4333-8333-333333333333";
const CHECKSUM = "a".repeat(64);

const snapshot = (state: DocumentLifecycleState): DocumentVersionSnapshot => ({
  versionId: VERSION_ID,
  checksum: CHECKSUM,
  state,
});

describe("document lifecycle state machine", () => {
  it.each([
    ["upload_reserved", "quarantined"],
    ["quarantined", "scanning"],
    ["scanning", "clean"],
    ["clean", "extracting"],
    ["extracting", "ready"],
    ["infected", "retained_for_incident"],
    ["scanner_error", "quarantined"],
    ["deletion_pending", "deleted"],
    ["deletion_failed", "deletion_pending"],
  ] as const)("allows the documented %s -> %s transition", (from, to) => {
    expect(
      transitionDocumentVersion(snapshot(from), {
        to,
        expectedVersionId: VERSION_ID,
        expectedChecksum: CHECKSUM,
      }),
    ).toEqual(snapshot(to));
  });

  it("treats a repeated transition as idempotent", () => {
    expect(
      transitionDocumentVersion(snapshot("quarantined"), {
        to: "quarantined",
        expectedVersionId: VERSION_ID,
        expectedChecksum: CHECKSUM,
      }),
    ).toEqual(snapshot("quarantined"));
  });

  it("rejects a transition that skips quarantine and scanning", () => {
    expect(() =>
      transitionDocumentVersion(snapshot("upload_reserved"), {
        to: "ready",
        expectedVersionId: VERSION_ID,
        expectedChecksum: CHECKSUM,
      }),
    ).toThrow(expect.objectContaining({ code: "illegal_transition" }));
  });

  it("rejects every transition out of confirmed deletion", () => {
    expect(() =>
      transitionDocumentVersion(snapshot("deleted"), {
        to: "ready",
        expectedVersionId: VERSION_ID,
        expectedChecksum: CHECKSUM,
      }),
    ).toThrow(expect.objectContaining({ code: "illegal_transition" }));
  });

  it("rejects a state update for a stale version identity", () => {
    expect(() =>
      transitionDocumentVersion(snapshot("scanning"), {
        to: "clean",
        expectedVersionId: "44444444-4444-4444-8444-444444444444",
        expectedChecksum: CHECKSUM,
      }),
    ).toThrow(expect.objectContaining({ code: "stale_version" }));
  });

  it("rejects a state update for bytes replaced under the same version", () => {
    expect(() =>
      transitionDocumentVersion(snapshot("scanning"), {
        to: "clean",
        expectedVersionId: VERSION_ID,
        expectedChecksum: "b".repeat(64),
      }),
    ).toThrow(expect.objectContaining({ code: "stale_checksum" }));
  });

  it.each(["upload_reserved", "quarantined", "scanning", "clean", "ready", "scanner_error"] as const)(
    "routes deletion from %s through deletion_pending",
    (state) => {
      expect(
        requestDocumentDeletion(snapshot(state), {
          expectedVersionId: VERSION_ID,
          expectedChecksum: CHECKSUM,
        }),
      ).toEqual(snapshot("deletion_pending"));
    },
  );

  it("does not delete an incident-held version until its hold is released", () => {
    expect(() =>
      requestDocumentDeletion(snapshot("retained_for_incident"), {
        expectedVersionId: VERSION_ID,
        expectedChecksum: CHECKSUM,
      }),
    ).toThrow(expect.objectContaining({ code: "incident_hold_active" }));
  });

  it("does not let the generic transition API bypass an incident hold", () => {
    expect(() =>
      transitionDocumentVersion(snapshot("retained_for_incident"), {
        to: "deletion_pending",
        expectedVersionId: VERSION_ID,
        expectedChecksum: CHECKSUM,
      }),
    ).toThrow(expect.objectContaining({ code: "illegal_transition" }));
  });

  it("releases an incident hold to deletion_pending with reason-coded evidence", () => {
    expect(
      releaseDocumentIncidentHold(snapshot("retained_for_incident"), {
        expectedVersionId: VERSION_ID,
        expectedChecksum: CHECKSUM,
        reasonCode: "incident_resolved",
        evidenceReference: "audit:hold-release:evt-123",
      }),
    ).toEqual(snapshot("deletion_pending"));
  });

  it("keeps the incident hold active when release evidence is missing", () => {
    expect(() =>
      releaseDocumentIncidentHold(snapshot("retained_for_incident"), {
        expectedVersionId: VERSION_ID,
        expectedChecksum: CHECKSUM,
        reasonCode: "incident_resolved",
      } as Parameters<typeof releaseDocumentIncidentHold>[1]),
    ).toThrow(expect.objectContaining({ code: "incident_hold_active" }));
  });

  it.each([
    { reasonCode: "Incident resolved", evidenceReference: "audit:hold-release:evt-123" },
    { reasonCode: "incident_resolved", evidenceReference: "https://audit.example/release?token=secret" },
  ])("keeps the incident hold active when release evidence is malformed", (releaseEvidence) => {
    expect(() =>
      releaseDocumentIncidentHold(snapshot("retained_for_incident"), {
        expectedVersionId: VERSION_ID,
        expectedChecksum: CHECKSUM,
        ...releaseEvidence,
      }),
    ).toThrow(expect.objectContaining({ code: "incident_hold_active" }));
  });
});
