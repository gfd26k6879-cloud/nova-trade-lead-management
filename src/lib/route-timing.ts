import { getRuntimeLogContext } from "@/lib/runtime-log-context";

export function startRouteTiming(route: string): (status: number, extra?: Record<string, unknown>) => void {
  const startedAt = Date.now();
  return (status: number, extra: Record<string, unknown> = {}) => {
    const severity = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
    const writer = severity === "error" ? console.error : severity === "warn" ? console.warn : console.info;
    writer("route_timing", {
      route,
      durationMs: Date.now() - startedAt,
      status,
      severity,
      runtime: getRuntimeLogContext(),
      ...extra,
    });
  };
}
