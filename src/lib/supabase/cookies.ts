const secureCookie = process.env.NODE_ENV === "production";

export function getSupabaseServerCookieOptions() {
  return {
    path: "/",
    sameSite: "lax" as const,
    secure: secureCookie,
    httpOnly: true,
  };
}

export function getSupabaseBrowserCookieOptions() {
  return {
    path: "/",
    sameSite: "lax" as const,
    secure: secureCookie,
    httpOnly: false,
  };
}
