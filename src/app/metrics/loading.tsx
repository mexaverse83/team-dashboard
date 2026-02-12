import { SkeletonKPI, SkeletonGrid } from "@/components/ui/skeleton-card"

export default function Loading() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-8 w-40 rounded bg-[hsl(var(--muted))] animate-pulse" />
        <div className="h-4 w-64 rounded bg-[hsl(var(--muted))] animate-pulse mt-2" />
      </div>
      <SkeletonKPI />
      <SkeletonGrid count={6} lines={3} />
    </div>
  )
}
