import type { Metadata } from "next";
import Link from "next/link";

import { getSession } from "@/lib/auth";

import { updatePasswordAction } from "./actions";

export const metadata: Metadata = {
  title: "Set New Password | NoSite Leads",
};

type ResetPasswordPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = await searchParams;
  const session = await getSession({ allowInactive: true });
  const errorMessage = params.error ? decodeURIComponent(params.error) : null;

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <main className="glass-lg w-full max-w-sm rounded-3xl p-10">
        <div className="mb-8">
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Set new password
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-tertiary)" }}>
            Choose a new password for your workspace account.
          </p>
        </div>

        {!session ? (
          <div className="space-y-5">
            <div
              className="rounded-xl px-3.5 py-2.5 text-sm"
              style={{
                background: "rgba(245, 158, 11, 0.08)",
                border: "1px solid rgba(245, 158, 11, 0.15)",
                color: "#b45309",
              }}
            >
              Your recovery session is missing or expired. Request a fresh reset link.
            </div>
            <Link href="/forgot-password" className="btn-primary w-full">
              Send new reset link
            </Link>
          </div>
        ) : (
          <form action={updatePasswordAction} className="space-y-5">
            <PasswordField name="password" label="New password" autoComplete="new-password" />
            <PasswordField name="confirmPassword" label="Confirm password" autoComplete="new-password" />

            {errorMessage && (
              <div
                className="rounded-xl px-3.5 py-2.5 text-sm"
                style={{
                  background: "rgba(239, 68, 68, 0.08)",
                  border: "1px solid rgba(239, 68, 68, 0.15)",
                  color: "#dc2626",
                }}
              >
                {errorMessage}
              </div>
            )}

            <button type="submit" className="btn-primary w-full">
              Update password
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-xs" style={{ color: "var(--text-tertiary)" }}>
          <Link href="/login" className="font-medium" style={{ color: "var(--accent)" }}>
            Back to sign in
          </Link>
        </p>
      </main>
    </div>
  );
}

function PasswordField({
  name,
  label,
  autoComplete,
}: {
  name: string;
  label: string;
  autoComplete: string;
}) {
  return (
    <div>
      <label
        htmlFor={name}
        className="mb-1.5 block text-xs font-medium"
        style={{ color: "var(--text-secondary)" }}
      >
        {label}
      </label>
      <input
        id={name}
        name={name}
        type="password"
        required
        minLength={12}
        autoComplete={autoComplete}
        className="glass-input w-full"
      />
    </div>
  );
}
