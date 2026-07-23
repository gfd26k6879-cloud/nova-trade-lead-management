export class ReadOnlyActionDeadlineError extends Error {
  constructor(actionName: string, timeoutMs: number) {
    super(`${actionName} exceeded its internal response deadline of ${timeoutMs}ms.`);
    this.name = "ReadOnlyActionDeadlineError";
  }
}

export async function withReadOnlyActionDeadline<T>(
  actionName: string,
  timeoutMs: number,
  operation: Promise<T>,
): Promise<T> {
  let deadlineWon = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const guardedOperation = operation.catch((error) => {
    if (deadlineWon) return new Promise<never>(() => {});
    throw error;
  });
  const deadline = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      deadlineWon = true;
      reject(new ReadOnlyActionDeadlineError(actionName, timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([guardedOperation, deadline]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
