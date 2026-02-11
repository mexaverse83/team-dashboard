export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 space-y-3 animate-pulse">
      <div className="h-4 w-1/3 rounded bg-[hsl(var(--muted))]" />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-3 rounded bg-[hsl(var(--muted))]" style={{ width: `${70 + Math.random() * 30}%` }} />
      ))}
    </div>
  )
}

export function SkeletonGrid({ count = 6, lines = 3 }: { count?: number; lines?: number }) {
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} lines={lines} />
      ))}
    </div>
  )
}

export function SkeletonKPI({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 animate-pulse">
          <div className="h-3 w-1/2 rounded bg-[hsl(var(--muted))] mb-3" />
          <div className="h-8 w-1/3 rounded bg-[hsl(var(--muted))] mb-2" />
          <div className="h-2 w-2/3 rounded bg-[hsl(var(--muted))]" />
        </div>
      ))}
    </div>
  )
}
