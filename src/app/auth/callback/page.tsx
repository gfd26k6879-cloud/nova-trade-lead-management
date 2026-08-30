import Link from "next/link";

import { normalizeAuthNextPath } from "@/lib/auth-redirect";

import { confirmRecoveryTokenAction } from "./actions";
import { AuthCallbackClient, RecoveryShell, StatusMessage } from "./callback-client";

type AuthCallbackPageProps = {
  searchParams: Promise<{
    token_hash?: string;
    type?: string;
    next?: string;
    error?: string;
  }>;
};

export default async function AuthCallbackPage({ searchParams }: AuthCallbackPageProps) {
  const params = await searchParams;

  if (params.token_hash || params.type === "recovery" || params.type === "invite") {
    return <TokenHashRecovery tokenHash={params.token_hash ?? ""} type={params.type ?? ""} next={params.next ?? "/reset-password"} />;
  }

  return <AuthCallbackClient />;
}

function TokenHashRecovery({ tokenHash, type, next }: { tokenHash: string; type: string; next: string }) {
  const isValidType = type === "recovery" || type === "invite";
  const isValidShape = Boolean(tokenHash) && isValidType;
  const safeNext = normalizeAuthNextPath(next);
  const isInvite = type === "invite";
  return (
    <RecoveryShell>
      {!isValidShape ? (
        <>
          <StatusMessage tone="error">The account link is missing required information. Request a fresh invite or password reset link.</StatusMessage>
          <Link href="/forgot-password" className="btn-primary mt-5 w-full">
            Send password reset link
          </Link>
        </>
      ) : (
        <form action={confirmRecoveryTokenAction} className="space-y-5">
          <StatusMessage tone="info">
            {isInvite
              ? "This extra step protects your welcome link from email security scanners. Continue only if an admin invited you."
              : "This extra step protects your reset link from email security scanners. Continue only if you requested this reset."}
          </StatusMessage>
          <input type="hidden" name="tokenHash" value={tokenHash} />
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="next" value={safeNext} />
          <button type="submit" className="btn-primary w-full">
            {isInvite ? "Continue account setup" : "Continue password reset"}
          </button>
        </form>
      )}
    </RecoveryShell>
  );
}
