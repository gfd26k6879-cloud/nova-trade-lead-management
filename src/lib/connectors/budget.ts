export interface ConnectorBudgetReservation {
  readonly idempotencyKey: string;
  readonly inputHash: string;
  readonly runId: string;
  readonly units: number;
}

export interface ConnectorBudgetReservationRequest {
  readonly idempotencyKey: string;
  readonly inputHash: string;
  readonly runId: string;
  readonly requestedUnits: number;
  readonly hardCapUnits: number;
  readonly reservations: readonly ConnectorBudgetReservation[];
}

export type ConnectorBudgetReservationResult =
  | Readonly<{
      status: "reserved" | "replay";
      code: "D015_PASS" | "D015_REPLAY_SAME_INPUT";
      reservation: ConnectorBudgetReservation;
      remainingUnits: number;
    }>
  | Readonly<{
      status: "blocked";
      code: "D015_CONFLICT" | "D015_COST_FAIL";
    }>;

function isFiniteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

/**
 * Produces a reservation decision without mutating storage. A persistence
 * adapter must commit the returned reservation atomically with a unique
 * idempotency key and run-level cap check.
 */
export function reserveConnectorBudget(
  request: ConnectorBudgetReservationRequest,
): ConnectorBudgetReservationResult {
  if (!request
    || typeof request !== "object"
    || typeof request.idempotencyKey !== "string"
    || typeof request.inputHash !== "string"
    || typeof request.runId !== "string"
    || !Array.isArray(request.reservations)
    || !isFiniteNonNegative(request.requestedUnits)
    || !isFiniteNonNegative(request.hardCapUnits)
    || !request.idempotencyKey.trim()
    || !request.inputHash.trim()
    || !request.runId.trim()
    || request.reservations.some((reservation) => !reservation
      || typeof reservation !== "object"
      || typeof reservation.idempotencyKey !== "string"
      || typeof reservation.inputHash !== "string"
      || typeof reservation.runId !== "string"
      || !isFiniteNonNegative(reservation.units))) {
    return { status: "blocked", code: "D015_COST_FAIL" };
  }

  const replayMatches = request.reservations.filter(
    (reservation) => reservation.idempotencyKey === request.idempotencyKey,
  );
  if (replayMatches.length > 1) {
    return { status: "blocked", code: "D015_CONFLICT" };
  }
  const replay = replayMatches[0];
  const alreadyReserved = request.reservations
    .filter((reservation) => reservation.runId === request.runId)
    .reduce((total, reservation) => total + reservation.units, 0);

  if (replay) {
    if (replay.inputHash !== request.inputHash
      || replay.runId !== request.runId
      || replay.units !== request.requestedUnits) {
      return { status: "blocked", code: "D015_CONFLICT" };
    }
    return {
      status: "replay",
      code: "D015_REPLAY_SAME_INPUT",
      reservation: replay,
      remainingUnits: Math.max(0, request.hardCapUnits - alreadyReserved),
    };
  }

  if (alreadyReserved + request.requestedUnits > request.hardCapUnits) {
    return { status: "blocked", code: "D015_COST_FAIL" };
  }

  const reservation: ConnectorBudgetReservation = {
    idempotencyKey: request.idempotencyKey,
    inputHash: request.inputHash,
    runId: request.runId,
    units: request.requestedUnits,
  };

  return {
    status: "reserved",
    code: "D015_PASS",
    reservation,
    remainingUnits: request.hardCapUnits - alreadyReserved - request.requestedUnits,
  };
}
