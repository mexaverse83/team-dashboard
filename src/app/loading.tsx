import { SkeletonKPI, SkeletonGrid } from "@/components/ui/skeleton-card"

export default function Loading() {
  return (
    <div className="space-y-8">
      <div>
        <div className="h-8 w-48 rounded bg-[hsl(var(--muted))] animate-pulse" />
        <div className="h-4 w-64 rounded bg-[hsl(var(--muted))] animate-pulse mt-2" />
      </div>
      <SkeletonKPI />
      <SkeletonGrid count={3} lines={4} />
    </div>
  )
}
