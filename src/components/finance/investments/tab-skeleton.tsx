/** Placeholder while a lazily-loaded tab's code or data arrives. */
export function TabSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-xl border border-border bg-surface p-4">
          <div className="h-3 w-1/3 rounded bg-surface-3" />
          <div className="mt-3 h-6 w-1/2 rounded bg-surface-3" />
          <div className="mt-3 h-24 rounded-lg bg-surface-2" />
        </div>
      ))}
    </div>
  )
}
