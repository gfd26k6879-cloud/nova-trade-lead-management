import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const routeAlias = getRouteAlias(pathname);
  if (routeAlias) {
    const aliasUrl = request.nextUrl.clone();
    aliasUrl.pathname = routeAlias;
    return NextResponse.redirect(aliasUrl);
  }

  const isProtectedPage = ["/dashboard", "/coverage", "/scheduler", "/quality", "/leads", "/queue", "/statistics", "/settings", "/users"].some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  const isProtectedApi = pathname.startsWith("/api/crawl") || pathname.startsWith("/api/export");

  if (isProtectedWorkerApi(pathname) && hasBearerAuth(request)) {
    return NextResponse.next({ request });
  }

  if (!isProtectedPage && !isProtectedApi) {
    return NextResponse.next({ request });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !publishableKey) {
    if (isProtectedApi) {
      return NextResponse.json({ error: "Supabase Auth is not configured" }, { status: 500 });
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "error=missing_config";
    return NextResponse.redirect(loginUrl);
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    if (isProtectedApi) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

function isProtectedWorkerApi(pathname: string): boolean {
  return pathname === "/api/crawl/process-next" || pathname === "/api/crawl/enrich-next";
}

function hasBearerAuth(request: NextRequest): boolean {
  const header = request.headers.get("authorization") ?? "";
  return /^Bearer\s+.+$/i.test(header);
}

function getRouteAlias(pathname: string): string | null {
  const normalized = safeNormalizePath(pathname);
  const aliases: Record<string, string> = {
    "/discover": "/dashboard",
    "/run-monitor": "/coverage",
    "/run monitor": "/coverage",
    "/monitor": "/coverage",
    "/nosite leads": "/dashboard",
    "/stats": "/statistics",
    "/statistic": "/statistics",
  };
  if (aliases[normalized]) return aliases[normalized];

  const canonicalRoutes = ["/dashboard", "/coverage", "/scheduler", "/quality", "/leads", "/queue", "/statistics", "/settings", "/users"];
  const canonical = canonicalRoutes.find((route) => route === normalized);
  return canonical && pathname !== canonical ? canonical : null;
}

function safeNormalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "") || "/";
  try {
    return decodeURIComponent(trimmed).toLowerCase();
  } catch {
    return trimmed.toLowerCase();
  }
}
