import type { Metadata } from "next";
import Link from "next/link";

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
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 py-12">
      <main className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-zinc-900">NoSite Leads</h1>
        <p className="mt-2 text-sm text-zinc-600">Sign in to access your private workspace.</p>

        <form action={loginAction} className="mt-8 space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-zinc-700">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-zinc-700">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
            />
          </div>

          {hasError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              Invalid email or password.
            </p>
          ) : null}

          {missingConfig ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Missing Supabase environment variables. Configure `.env.local` before signing in.
            </p>
          ) : null}

          <button
            type="submit"
            className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Sign in
          </button>
        </form>

        <p className="mt-4 text-xs text-zinc-500">
          This is a private single-user app. Create your user in Supabase Auth before first login.
        </p>
        <Link href="/" className="mt-4 inline-block text-xs text-zinc-500 hover:text-zinc-700">
          Back to app
        </Link>
      </main>
    </div>
  );
}
