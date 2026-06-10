export const CANONICAL_APP_URL = "https://www.nosite.xyz";

export function resolveCanonicalAppUrl(
  requestOrigin?: string | null,
  env: { NEXT_PUBLIC_APP_URL?: string; NODE_ENV?: string } = process.env,
): string {
  const configured = env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    const normalized = configured.replace(/\/+$/, "");
    if (env.NODE_ENV === "production" && normalized !== CANONICAL_APP_URL) {
      return CANONICAL_APP_URL;
    }
    return normalized;
  }

  const fallback = requestOrigin?.trim();
  if (fallback && env.NODE_ENV !== "production") return fallback.replace(/\/+$/, "");

  return CANONICAL_APP_URL;
}

export function buildAuthCallbackUrl(nextPath: string, appUrl: string): string {
  const safeNext = nextPath.startsWith("/") ? nextPath : `/${nextPath}`;
  return `${appUrl}/auth/callback?next=${encodeURIComponent(safeNext)}`;
}

export function buildPasswordRecoveryUrl(nextPath: string, appUrl: string): string {
  return buildAuthCallbackUrl(nextPath, appUrl);
}

export function buildWelcomeInviteUrl(nextPath: string, appUrl: string): string {
  return buildAuthCallbackUrl(nextPath, appUrl);
}
