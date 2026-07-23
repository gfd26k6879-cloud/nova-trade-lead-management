export interface AbortScope {
  signal: AbortSignal;
  dispose: () => void;
}

export function createTimeoutAbortScope(parentSignal: AbortSignal | undefined, timeoutMs: number): AbortScope {
  parentSignal?.throwIfAborted();

  const controller = new AbortController();
  const onParentAbort = () => controller.abort(parentSignal?.reason);
  parentSignal?.addEventListener("abort", onParentAbort, { once: true });
  const timeout = setTimeout(() => {
    controller.abort(new DOMException("This operation timed out", "TimeoutError"));
  }, timeoutMs);

  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timeout);
      parentSignal?.removeEventListener("abort", onParentAbort);
    },
  };
}
