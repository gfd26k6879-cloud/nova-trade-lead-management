import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServerClient, isSupabaseAuthConfigured } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = normalizeNextPath(requestUrl.searchParams.get("next"));
  const error = requestUrl.searchParams.get("error_description") ?? requestUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error)}`, requestUrl.origin));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=invalid_recovery_link", requestUrl.origin));
  }

  if (!isSupabaseAuthConfigured()) {
    return NextResponse.redirect(new URL("/login?error=missing_config", requestUrl.origin));
  }

  const supabase = await createSupabaseServerClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(exchangeError.message)}`, requestUrl.origin));
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}

function normalizeNextPath(next: string | null): string {
  if (!next?.startsWith("/") || next.startsWith("//")) return "/queue";
  return next;
}
