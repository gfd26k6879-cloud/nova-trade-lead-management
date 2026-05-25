"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseBrowserCookieOptions } from "@/lib/supabase/cookies";

export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !publishableKey) {
    throw new Error("Supabase Auth is not configured");
  }

  return createBrowserClient(url, publishableKey, {
    cookieOptions: getSupabaseBrowserCookieOptions(),
  });
}
