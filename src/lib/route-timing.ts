export function startRouteTiming(route: string): (status: number, extra?: Record<string, unknown>) => void {
  const startedAt = Date.now();
  return (status: number, extra: Record<string, unknown> = {}) => {
    console.info("route_timing", {
      route,
      durationMs: Date.now() - startedAt,
      status,
      ...extra,
    });
  };
}
