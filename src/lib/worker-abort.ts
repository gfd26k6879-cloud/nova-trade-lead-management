export function throwIfWorkerAborted(signal?: AbortSignal): void {
  signal?.throwIfAborted();
}
