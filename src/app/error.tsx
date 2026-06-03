"use client";

const USER_SAFE_ERROR_MESSAGE = "We hit a temporary issue loading this page. Try again in a moment.";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="glass-lg w-full max-w-md rounded-3xl p-10 text-center">
        <div
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ background: "rgba(239,68,68,0.1)" }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Something went wrong</h2>
        <p className="mt-2 text-sm" style={{ color: "var(--text-tertiary)" }}>
          {USER_SAFE_ERROR_MESSAGE}
        </p>
        {error.digest && (
          <p className="mt-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
            Error ID: {error.digest}
          </p>
        )}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button type="button" className="btn-primary" onClick={reset}>Try Again</button>
          <a href="/queue" className="btn-glass">Queue</a>
        </div>
      </div>
    </div>
  );
}
