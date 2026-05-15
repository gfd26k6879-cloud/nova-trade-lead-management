export function resolveCanonicalAppUrl(
  requestOrigin?: string | null,
  env: { NEXT_PUBLIC_APP_URL?: string; NODE_ENV?: string } = process.env,
): string | null {
  const configured = env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const fallback = requestOrigin?.trim();
  if (fallback && env.NODE_ENV !== "production") return fallback.replace(/\/+$/, "");

  return null;
}

export function buildAuthCallbackUrl(nextPath: string, appUrl: string): string {
  const safeNext = nextPath.startsWith("/") ? nextPath : `/${nextPath}`;
  return `${appUrl}/auth/callback?next=${encodeURIComponent(safeNext)}`;
}
