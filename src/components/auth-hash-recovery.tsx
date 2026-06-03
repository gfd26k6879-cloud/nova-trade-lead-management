"use client";

import { useEffect } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function AuthHashRecovery() {
  useEffect(() => {
    if (window.location.pathname === "/auth/callback") return;

    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    if (!hash) return;

    const params = new URLSearchParams(hash);
    const type = params.get("type");
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (type !== "recovery" || !accessToken || !refreshToken) return;

    const supabase = createSupabaseBrowserClient();
    void supabase.auth
      .setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })
      .then(({ error }) => {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        window.location.assign(error ? "/forgot-password?error=expired_link" : "/reset-password");
      });
  }, []);

  return null;
}
