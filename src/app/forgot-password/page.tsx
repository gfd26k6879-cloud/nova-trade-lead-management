import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

import { requestPasswordResetAction } from "./actions";

export const metadata: Metadata = {
  title: "Reset Password | NoSite Leads",
};

type ForgotPasswordPageProps = {
  searchParams: Promise<{
    error?: string;
    sent?: string;
  }>;
};

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const params = await searchParams;
  const sent = params.sent === "1";
  const errorMessage = getErrorMessage(params.error);

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <main className="glass-lg w-full max-w-sm rounded-3xl p-10">
        <div className="mb-8">
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Reset password
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-tertiary)" }}>
            Send a recovery link to your workspace email.
          </p>
        </div>

        <form action={requestPasswordResetAction} className="space-y-5">
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-xs font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="glass-input w-full"
            />
          </div>

          {sent && (
            <StatusMessage tone="success">
              Check your email for the password reset link.
            </StatusMessage>
          )}

          {errorMessage && (
            <StatusMessage tone="error">
              {errorMessage}
            </StatusMessage>
          )}

          <button type="submit" className="btn-primary w-full">
            Send reset link
          </button>
        </form>

        <p className="mt-6 text-center text-xs" style={{ color: "var(--text-tertiary)" }}>
          <Link href="/login" className="font-medium" style={{ color: "var(--accent)" }}>
            Back to sign in
          </Link>
        </p>
      </main>
    </div>
  );
}

function StatusMessage({ children, tone }: { children: ReactNode; tone: "success" | "error" }) {
  const palette = tone === "success"
    ? { background: "rgba(22, 163, 74, 0.08)", border: "1px solid rgba(22, 163, 74, 0.16)", color: "#15803d" }
    : { background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.15)", color: "#dc2626" };

  return (
    <div className="rounded-xl px-3.5 py-2.5 text-sm" style={palette}>
      {children}
    </div>
  );
}

function getErrorMessage(error?: string): string | null {
  if (!error) return null;
  if (error === "missing_config") return "Supabase Auth is not configured.";
  if (error === "invalid_email") return "Enter a valid email address.";
  if (error === "missing_origin") return "Unable to determine this app URL.";
  return decodeURIComponent(error);
}
