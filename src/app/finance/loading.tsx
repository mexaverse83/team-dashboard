export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-5" aria-busy="true" aria-label="Loading">
      <div>
        <div className="h-3 w-48 animate-pulse rounded bg-surface-2" />
        <div className="mt-2 h-8 w-64 animate-pulse rounded-lg bg-surface-2" />
      </div>
      <div className="h-56 animate-pulse rounded-2xl bg-surface-2" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-36 animate-pulse rounded-xl bg-surface-2" />
        <div className="h-36 animate-pulse rounded-xl bg-surface-2" />
      </div>
    </div>
  )
}
