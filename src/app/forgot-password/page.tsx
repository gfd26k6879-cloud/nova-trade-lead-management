import type { Metadata } from "next";
import Link from "next/link";

import { ForgotPasswordForm } from "./forgot-password-form";

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

        <ForgotPasswordForm initialSent={sent} initialErrorMessage={errorMessage} />

        <p className="mt-6 text-center text-xs" style={{ color: "var(--text-tertiary)" }}>
          <Link href="/login" className="font-medium" style={{ color: "var(--accent)" }}>
            Back to sign in
          </Link>
        </p>
      </main>
    </div>
  );
}

function getErrorMessage(error?: string): string | null {
  if (!error) return null;
  if (error === "missing_config") return "Supabase Auth is not configured.";
  if (error === "invalid_email") return "Enter a valid email address.";
  if (error === "missing_origin") return "Password reset is missing the production app URL. Ask an admin to set NEXT_PUBLIC_APP_URL in Vercel.";
  if (error === "expired_link") return "That recovery link is expired or was already used. Request a fresh reset link and open only the newest email.";
  return decodeURIComponent(error);
}
