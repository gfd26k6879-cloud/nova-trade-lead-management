import Link from "next/link";

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

  if (params.token_hash || params.type === "recovery") {
    return <TokenHashRecovery tokenHash={params.token_hash ?? ""} type={params.type ?? ""} next={params.next ?? "/reset-password"} />;
  }

  return <AuthCallbackClient />;
}

function TokenHashRecovery({ tokenHash, type, next }: { tokenHash: string; type: string; next: string }) {
  const isValidShape = Boolean(tokenHash) && type === "recovery";
  const safeNext = normalizeNextPath(next);
  return (
    <RecoveryShell>
      {!isValidShape ? (
        <>
          <StatusMessage tone="error">The recovery link is missing required reset information. Request a fresh password reset link.</StatusMessage>
          <Link href="/forgot-password" className="btn-primary mt-5 w-full">
            Send new reset link
          </Link>
        </>
      ) : (
        <form action={confirmRecoveryTokenAction} className="space-y-5">
          <StatusMessage tone="info">
            This extra step protects your reset link from email security scanners. Continue only if you requested this reset.
          </StatusMessage>
          <input type="hidden" name="tokenHash" value={tokenHash} />
          <input type="hidden" name="type" value="recovery" />
          <input type="hidden" name="next" value={safeNext} />
          <button type="submit" className="btn-primary w-full">
            Continue password reset
          </button>
        </form>
      )}
    </RecoveryShell>
  );
}

function normalizeNextPath(next: string | null | undefined): string {
  if (!next?.startsWith("/") || next.startsWith("//")) return "/reset-password";
  return next;
}
