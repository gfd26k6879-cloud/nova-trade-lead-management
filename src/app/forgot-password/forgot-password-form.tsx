import type { ReactNode } from "react";

import { requestPasswordResetAction } from "./actions";

type ForgotPasswordFormProps = {
  initialErrorMessage?: string | null;
  initialSent?: boolean;
};

export function ForgotPasswordForm({ initialErrorMessage = null, initialSent = false }: ForgotPasswordFormProps) {
  return (
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

      {initialSent && (
        <StatusMessage tone="success">
          Check your email for the newest password reset link. Use only the newest email, and open it in the same browser where you requested it.
        </StatusMessage>
      )}

      {initialErrorMessage && (
        <StatusMessage tone="error">
          {initialErrorMessage}
        </StatusMessage>
      )}

      <button type="submit" className="btn-primary w-full">
        Send reset link
      </button>

      <p className="text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
        Recovery links are one-time use. Use only the newest email, and open it in the same browser where you requested it.
      </p>
    </form>
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
