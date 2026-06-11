import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Bucket timestamps into per-day counts for the trailing `days` UTC calendar
 * days (today inclusive), oldest bucket first — feeds sparklines with real
 * history instead of random numbers.
 */
export function dailyCounts(
  dates: Array<string | Date>,
  days = 7,
  now: Date = new Date(),
): number[] {
  const counts = new Array<number>(days).fill(0)
  const dayMs = 86_400_000
  const today = Math.floor(now.getTime() / dayMs)
  for (const d of dates) {
    const t = new Date(d).getTime()
    if (Number.isNaN(t)) continue
    const age = today - Math.floor(t / dayMs)
    if (age < 0 || age >= days) continue
    counts[days - 1 - age]++
  }
  return counts
}

/** Percent change between two window counts, null when there is no baseline. */
export function percentDelta(current: number, previous: number): number | null {
  if (previous === 0) return null
  return Math.round(((current - previous) / previous) * 100)
}
