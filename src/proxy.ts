import { type NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtectedPage = ["/dashboard", "/coverage", "/leads", "/queue", "/statistics", "/settings"].some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  const isProtectedApi = pathname.startsWith("/api/crawl") || pathname.startsWith("/api/export");

  if ((isProtectedPage || isProtectedApi) && !request.cookies.get("nosite_session")?.value) {
    if (isProtectedApi) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
