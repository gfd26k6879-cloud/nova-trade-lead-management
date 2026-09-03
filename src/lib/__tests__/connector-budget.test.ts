import { describe, expect, it } from "vitest";

import {
  reserveConnectorBudget,
  type ConnectorBudgetReservation,
} from "@/lib/connectors/budget";

const existing: ConnectorBudgetReservation = {
  idempotencyKey: "reservation-1",
  inputHash: "hash-1",
  runId: "run-a",
  units: 2,
};

describe("connector budget reservation", () => {
  it("reserves bounded units for a new idempotency key", () => {
    expect(reserveConnectorBudget({
      idempotencyKey: "reservation-2",
      inputHash: "hash-2",
      runId: "run-a",
      requestedUnits: 2,
      hardCapUnits: 5,
      reservations: [existing],
    })).toEqual({
      status: "reserved",
      code: "D015_PASS",
      reservation: {
        idempotencyKey: "reservation-2",
        inputHash: "hash-2",
        runId: "run-a",
        units: 2,
      },
      remainingUnits: 1,
    });
  });

  it("replays the original reservation for the same input", () => {
    expect(reserveConnectorBudget({
      idempotencyKey: "reservation-1",
      inputHash: "hash-1",
      runId: "run-a",
      requestedUnits: 2,
      hardCapUnits: 5,
      reservations: [existing],
    })).toMatchObject({
      status: "replay",
      code: "D015_REPLAY_SAME_INPUT",
      reservation: existing,
    });
  });

  it("rejects an idempotency key reused for different input", () => {
    expect(reserveConnectorBudget({
      idempotencyKey: "reservation-1",
      inputHash: "different-hash",
      runId: "run-a",
      requestedUnits: 2,
      hardCapUnits: 5,
      reservations: [existing],
    })).toEqual({ status: "blocked", code: "D015_CONFLICT" });
  });

  it("kills reservations that exceed the hard cap", () => {
    expect(reserveConnectorBudget({
      idempotencyKey: "reservation-2",
      inputHash: "hash-2",
      runId: "run-a",
      requestedUnits: 4,
      hardCapUnits: 5,
      reservations: [existing],
    })).toEqual({ status: "blocked", code: "D015_COST_FAIL" });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])(
    "rejects malformed requested units (%s)",
    (requestedUnits) => {
      expect(reserveConnectorBudget({
        idempotencyKey: "reservation-2",
        inputHash: "hash-2",
        runId: "run-a",
        requestedUnits,
        hardCapUnits: 5,
        reservations: [existing],
      })).toEqual({ status: "blocked", code: "D015_COST_FAIL" });
    },
  );

  it("does not count reservations from another run", () => {
    expect(reserveConnectorBudget({
      idempotencyKey: "reservation-2",
      inputHash: "hash-2",
      runId: "run-b",
      requestedUnits: 5,
      hardCapUnits: 5,
      reservations: [existing],
    })).toMatchObject({ status: "reserved", remainingUnits: 0 });
  });

  it("fails closed for malformed or inconsistent reservation state", () => {
    expect(reserveConnectorBudget({
      idempotencyKey: "reservation-2",
      inputHash: "hash-2",
      runId: "run-a",
      requestedUnits: 1,
      hardCapUnits: 5,
      reservations: null,
    } as unknown as Parameters<typeof reserveConnectorBudget>[0])).toEqual({
      status: "blocked",
      code: "D015_COST_FAIL",
    });

    expect(reserveConnectorBudget({
      idempotencyKey: "reservation-1",
      inputHash: "hash-1",
      runId: "run-a",
      requestedUnits: 2,
      hardCapUnits: 5,
      reservations: [existing, { ...existing, inputHash: "different-hash" }],
    })).toEqual({ status: "blocked", code: "D015_CONFLICT" });
  });
});
