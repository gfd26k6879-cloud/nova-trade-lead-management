import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseServerCookieOptions } from "@/lib/supabase/cookies";

type CookieLike = { name: string };

export function isSupabaseAuthConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()),
  );
}

export function getSupabaseAuthConfig(): { url: string; publishableKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !publishableKey) {
    throw new Error("Supabase Auth is not configured");
  }

  return { url, publishableKey };
}

export async function createSupabaseServerClient() {
  const { url, publishableKey } = getSupabaseAuthConfig();
  const cookieStore = await cookies();

  return createServerClient(url, publishableKey, {
    cookieOptions: getSupabaseServerCookieOptions(),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot write cookies. Proxy and Server Actions can.
        }
      },
    },
  });
}

export function isStaleSupabaseAuthError(error: unknown): boolean {
  const maybe = error as { code?: unknown; message?: unknown; name?: unknown };
  const code = String(maybe?.code ?? "").toLowerCase();
  const message = error instanceof Error ? error.message : String(maybe?.message ?? error ?? "");
  return (
    code === "refresh_token_not_found" ||
    /invalid refresh token|refresh token not found|auth session missing/i.test(message)
  );
}

export function getSupabaseAuthCookieNames(cookieList: CookieLike[]): string[] {
  return cookieList
    .map((cookie) => cookie.name)
    .filter((name) => name.startsWith("sb-") && name.includes("auth-token"));
}

export async function clearStaleSupabaseAuthCookies(): Promise<string[]> {
  const cookieStore = await cookies();
  const names = getSupabaseAuthCookieNames(cookieStore.getAll());
  const options = getSupabaseServerCookieOptions();

  for (const name of names) {
    try {
      cookieStore.set(name, "", {
        ...options,
        expires: new Date(0),
        maxAge: 0,
      });
    } catch {
      // Server Components cannot mutate cookies; Route Handlers and Server Actions can.
    }

    try {
      cookieStore.delete(name);
    } catch {
      // Best-effort cleanup only. The caller still treats the session as unauthenticated.
    }
  }

  return names;
}
