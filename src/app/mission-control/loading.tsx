import { SkeletonGrid } from "@/components/ui/skeleton-card"

export default function Loading() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-8 w-56 rounded bg-[hsl(var(--muted))] animate-pulse" />
        <div className="h-4 w-72 rounded bg-[hsl(var(--muted))] animate-pulse mt-2" />
      </div>
      <div className="h-10 rounded-lg bg-[hsl(var(--muted))] animate-pulse" />
      <SkeletonGrid count={6} lines={5} />
    </div>
  )
}
