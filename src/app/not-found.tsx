import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="glass-lg w-full max-w-md rounded-3xl p-10 text-center">
        <div
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ background: "rgba(99,102,241,0.1)" }}
        >
          <span className="text-xl font-bold" style={{ color: "var(--accent)" }}>?</span>
        </div>
        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Page not found</h2>
        <p className="mt-2 text-sm" style={{ color: "var(--text-tertiary)" }}>
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="mt-6">
          <Link href="/queue" className="btn-primary">Back to Queue</Link>
        </div>
      </div>
    </div>
  );
}
