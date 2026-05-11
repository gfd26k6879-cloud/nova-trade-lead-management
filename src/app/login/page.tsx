import type { Metadata } from "next";

import { loginAction } from "./actions";

export const metadata: Metadata = {
  title: "Login | NoSite Leads",
};

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const hasError = params.error === "invalid_credentials";
  const missingConfig = params.error === "missing_config";

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <main className="glass-lg w-full max-w-sm rounded-3xl p-10">
        <div className="mb-8">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent)] shadow-[0_4px_12px_var(--accent-glow)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            NoSite Leads
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-tertiary)" }}>
            Sign in to your workspace
          </p>
        </div>

        <form action={loginAction} className="space-y-5">
          <div>
            <label
              htmlFor="username"
              className="mb-1.5 block text-xs font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              required
              autoComplete="username"
              placeholder="Username"
              className="glass-input w-full"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-xs font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              Password
            </label>
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
              className="rounded-xl px-3.5 py-2.5 text-sm"
              style={{
                background: "rgba(239, 68, 68, 0.08)",
                border: "1px solid rgba(239, 68, 68, 0.15)",
                color: "#dc2626",
              }}
            >
              Invalid username or password.
            </div>
          )}

          {missingConfig && (
            <div
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

          <button type="submit" className="btn-primary w-full">
            Sign in
          </button>
        </form>

        <p className="mt-6 text-center text-xs" style={{ color: "var(--text-tertiary)" }}>
          Private single-user workspace
        </p>
      </main>
    </div>
  );
}
