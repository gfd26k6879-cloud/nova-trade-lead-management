import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { applyNoStoreHeaders } from "@/lib/http-cache";
import { getSupabaseServerCookieOptions } from "@/lib/supabase/cookies";

export async function proxy(request: NextRequest) {
  const security = createSecurityContext();
  const { pathname } = request.nextUrl;
  const routeAlias = getRouteAlias(pathname);
  if (routeAlias) {
    const aliasUrl = request.nextUrl.clone();
    aliasUrl.pathname = routeAlias;
    return withProxySecurityHeaders(applyNoStoreHeaders(NextResponse.redirect(aliasUrl)), security);
  }

  const isProtectedPage = ["/dashboard", "/coverage", "/scheduler", "/quality", "/leads", "/queue", "/statistics", "/settings", "/users", "/fulfillment", "/team"].some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  const isProtectedApi = pathname.startsWith("/api/crawl") || pathname.startsWith("/api/export");

  if (isProtectedWorkerApi(pathname) && hasBearerAuth(request)) {
    return nextWithProxySecurityHeaders(request, security);
  }

  if (!isProtectedPage && !isProtectedApi) {
    return nextWithProxySecurityHeaders(request, security);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !publishableKey) {
    if (isProtectedApi) {
      return withProxySecurityHeaders(applyNoStoreHeaders(NextResponse.json({ error: "Supabase Auth is not configured" }, { status: 500 })), security);
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "error=missing_config";
    return withProxySecurityHeaders(applyNoStoreHeaders(NextResponse.redirect(loginUrl)), security);
  }

  let response = nextWithProxySecurityHeaders(request, security);
  const supabase = createServerClient(url, publishableKey, {
    cookieOptions: getSupabaseServerCookieOptions(),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headersToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = nextWithProxySecurityHeaders(request, security);
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        Object.entries(headersToSet).forEach(([name, value]) => {
          response.headers.set(name, value);
        });
      },
    },
  });

  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    if (isProtectedApi) {
      return withProxySecurityHeaders(applyNoStoreHeaders(NextResponse.json({ error: "Authentication required" }, { status: 401 })), security);
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return withProxySecurityHeaders(applyNoStoreHeaders(NextResponse.redirect(loginUrl)), security);
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

type SecurityContext = {
  nonce: string;
  contentSecurityPolicy: string;
};

function createSecurityContext(): SecurityContext {
  const nonce = createNonce();
  const isDev = process.env.NODE_ENV === "development";
  const googleMapsHosts = ["https://maps.googleapis.com", "https://maps.gstatic.com"];
  const scriptSrc = [`'self'`, `'nonce-${nonce}'`, "'strict-dynamic'", ...googleMapsHosts];

  if (isDev) {
    scriptSrc.push("'unsafe-eval'");
  }

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co ${googleMapsHosts.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];

  if (!isDev) {
    directives.push("upgrade-insecure-requests");
  }

  return {
    nonce,
    contentSecurityPolicy: directives.join("; "),
  };
}

function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

function nextWithProxySecurityHeaders(request: NextRequest, security: SecurityContext): NextResponse {
  return withProxySecurityHeaders(
    NextResponse.next({
      request: {
        headers: getRequestHeadersWithSecurityHeaders(request, security),
      },
    }),
    security
  );
}

function getRequestHeadersWithSecurityHeaders(request: NextRequest, security: SecurityContext): Headers {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", security.nonce);
  requestHeaders.set("Content-Security-Policy", security.contentSecurityPolicy);
  return requestHeaders;
}

function withProxySecurityHeaders<T extends { headers: Headers }>(response: T, security: SecurityContext): T {
  response.headers.set("Content-Security-Policy", security.contentSecurityPolicy);
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)");
  return response;
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

  const canonicalRoutes = ["/dashboard", "/coverage", "/scheduler", "/quality", "/leads", "/queue", "/statistics", "/settings", "/users", "/fulfillment", "/team"];
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
