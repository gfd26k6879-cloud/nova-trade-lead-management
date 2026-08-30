"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { normalizeAuthNextPath } from "@/lib/auth-redirect";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type CallbackState = "loading" | "success" | "error";

export function AuthCallbackClient() {
  const [state, setState] = useState<CallbackState>("loading");
  const [message, setMessage] = useState("Preparing your account session...");

  useEffect(() => {
    let active = true;

    async function completeCallback() {
      const url = new URL(window.location.href);
      const next = normalizeAuthNextPath(url.searchParams.get("next"));
      const error = url.searchParams.get("error_description") ?? url.searchParams.get("error");

      if (error) {
        setState("error");
        setMessage("That account link is invalid or expired. Request a fresh invite or password reset link.");
        return;
      }

      const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
      const hashParams = new URLSearchParams(hash);
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const code = url.searchParams.get("code");
      const supabase = createSupabaseBrowserClient();

      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (!active) return;
        if (sessionError) {
          setState("error");
          setMessage("That account link could not create a password session. Request a fresh invite or password reset link.");
          return;
        }

        window.history.replaceState(null, "", `${url.pathname}${url.search}`);
        setState("success");
        setMessage("Account session ready. Opening the password form...");
        window.location.replace(next);
        return;
      }

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

        if (!active) return;
        if (exchangeError) {
          setState("error");
          setMessage("That account link is expired, already used, or was opened in a different browser than the original request.");
          return;
        }

        window.history.replaceState(null, "", `${url.pathname}?next=${encodeURIComponent(next)}`);
        setState("success");
        setMessage("Account session ready. Opening the password form...");
        window.location.replace(next);
        return;
      }

      setState("error");
      setMessage("The account link is missing required information. Request a fresh invite or password reset link.");
    }

    void completeCallback();

    return () => {
      active = false;
    };
  }, []);

  return (
    <RecoveryShell>
      <StatusMessage tone={state === "error" ? "error" : "success"}>{message}</StatusMessage>

      {state === "error" && (
        <Link href="/forgot-password" className="btn-primary mt-5 w-full">
          Send password reset link
        </Link>
      )}
    </RecoveryShell>
  );
}

export function RecoveryShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <main className="glass-lg w-full max-w-sm rounded-3xl p-10">
        <div className="mb-8">
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Account access
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-tertiary)" }}>
            Verifying your secure account link before opening the password form.
          </p>
        </div>
        {children}
      </main>
    </div>
  );
}

export function StatusMessage({ children, tone }: { children: React.ReactNode; tone: "success" | "error" | "info" }) {
  const style = tone === "error"
    ? {
        background: "rgba(239, 68, 68, 0.08)",
        border: "1px solid rgba(239, 68, 68, 0.15)",
        color: "#dc2626",
      }
    : tone === "success"
      ? {
          background: "rgba(22, 163, 74, 0.08)",
          border: "1px solid rgba(22, 163, 74, 0.16)",
          color: "#15803d",
        }
      : {
          background: "rgba(37, 99, 235, 0.08)",
          border: "1px solid rgba(37, 99, 235, 0.16)",
          color: "#1d4ed8",
        };

  return (
    <div className="rounded-xl px-3.5 py-2.5 text-sm" style={style}>
      {children}
    </div>
  );
}
