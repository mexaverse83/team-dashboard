export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-28 rounded bg-[hsl(var(--muted))] animate-pulse" />
          <div className="h-4 w-56 rounded bg-[hsl(var(--muted))] animate-pulse mt-2" />
        </div>
        <div className="h-9 w-28 rounded bg-[hsl(var(--muted))] animate-pulse" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <div className="h-5 w-24 rounded bg-[hsl(var(--muted))] animate-pulse" />
            <div className="space-y-2 min-h-[200px]">
              {Array.from({ length: 2 }).map((_, j) => (
                <div key={j} className="h-20 rounded-lg bg-[hsl(var(--muted))] animate-pulse" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
