export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-7">
      <div className="glass-heavy rounded-2xl p-6">
        <div className="h-6 w-48 animate-pulse rounded-lg" style={{ background: "rgba(0,0,0,0.06)" }} />
        <div className="mt-2 h-4 w-72 animate-pulse rounded-lg" style={{ background: "rgba(0,0,0,0.04)" }} />
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl" style={{ background: "rgba(0,0,0,0.04)" }} />
          ))}
        </div>
      </div>
      <div className="mt-4 glass rounded-2xl p-6">
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg" style={{ background: "rgba(0,0,0,0.04)" }} />
          ))}
        </div>
      </div>
    </div>
  );
}
