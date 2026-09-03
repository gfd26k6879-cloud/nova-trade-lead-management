import type { Metadata } from "next";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { loginAction } from "./actions";

export const metadata: Metadata = {
  title: "Login | Nova Trade Lead Management",
};

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    reset?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const hasError = params.error === "invalid_credentials";
  const missingConfig = params.error === "missing_config";
  const invalidRecoveryLink = params.error === "invalid_recovery_link";
  const expiredLink = params.error === "expired_link";
  const resetSuccess = params.reset === "success";

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <main className="glass-lg w-full max-w-sm rounded-3xl p-10">
        <div className="mb-8">
          <BrandMark size="login" className="mb-4" priority />
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Nova Trade Lead Management
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-tertiary)" }}>
            Sign in to your workspace
          </p>
        </div>

        <form action={loginAction} className="space-y-5">
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

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <label
                htmlFor="password"
                className="block text-xs font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                Password
              </label>
              <Link href="/forgot-password" className="text-xs font-medium" style={{ color: "var(--accent)" }}>
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="glass-input w-full"
            />
          </div>

          {hasError && (
            <div
              role="alert"
              aria-live="assertive"
              className="rounded-xl px-3.5 py-2.5 text-sm"
              style={{
                background: "rgba(239, 68, 68, 0.08)",
                border: "1px solid rgba(239, 68, 68, 0.15)",
                color: "#dc2626",
              }}
            >
              Invalid email or password.
            </div>
          )}

          {missingConfig && (
            <div
              role="alert"
              aria-live="assertive"
              className="rounded-xl px-3.5 py-2.5 text-sm"
              style={{
                background: "rgba(245, 158, 11, 0.08)",
                border: "1px solid rgba(245, 158, 11, 0.15)",
                color: "#b45309",
              }}
            >
              Configuration error. Please check your setup.
            </div>
          )}

          {invalidRecoveryLink && (
            <div
              role="alert"
              aria-live="assertive"
              className="rounded-xl px-3.5 py-2.5 text-sm"
              style={{
                background: "rgba(239, 68, 68, 0.08)",
                border: "1px solid rgba(239, 68, 68, 0.15)",
                color: "#dc2626",
              }}
            >
              The account link is missing required information. Request a fresh invite or password reset and open only the newest email.
            </div>
          )}

          {expiredLink && (
            <div
              role="alert"
              aria-live="assertive"
              className="rounded-xl px-3.5 py-2.5 text-sm"
              style={{
                background: "rgba(239, 68, 68, 0.08)",
                border: "1px solid rgba(239, 68, 68, 0.15)",
                color: "#dc2626",
              }}
            >
              That account link is expired or was already used. Request a fresh invite or password reset link.
            </div>
          )}

          {resetSuccess && (
            <div
              role="status"
              aria-live="polite"
              className="rounded-xl px-3.5 py-2.5 text-sm"
              style={{
                background: "rgba(22, 163, 74, 0.08)",
                border: "1px solid rgba(22, 163, 74, 0.16)",
                color: "#15803d",
              }}
            >
              Password updated. Sign in with your new password.
            </div>
          )}

          <button type="submit" className="btn-primary w-full">
            Sign in
          </button>
        </form>

        <p className="mt-6 text-center text-xs" style={{ color: "var(--text-tertiary)" }}>
          Private team workspace
        </p>
      </main>
    </div>
  );
}
