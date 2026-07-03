'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Insight {
  type: string
  icon: string
  title: string
  detail: string
  priority: string
}

const typeIcons: Record<string, string> = {
  alert: '⚠️', recommendation: '💡', saving: '💡', win: '🏆', forecast: '📊', pattern: '🔍',
}

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 }
// Alerts surface first within a priority tier; wins last so the brief leads with action.
const TYPE_RANK: Record<string, number> = { alert: 0, forecast: 1, recommendation: 2, saving: 2, pattern: 3, win: 4 }

const priorityChip: Record<string, string> = {
  high: 'bg-rose-500/15 text-rose-400',
  medium: 'bg-amber-500/15 text-amber-400',
  low: 'bg-[hsl(var(--bg-elevated))] text-[hsl(var(--text-tertiary))]',
}

export function WolffWidget() {
  const [insights, setInsights] = useState<Insight[]>([])
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/finance/insights', {
      headers: { 'x-api-key': process.env.NEXT_PUBLIC_FINANCE_API_KEY || '' },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.insights) {
          const sorted = [...data.insights].sort((a: Insight, b: Insight) =>
            (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3) ||
            (TYPE_RANK[a.type] ?? 5) - (TYPE_RANK[b.type] ?? 5)
          )
          setInsights(sorted.slice(0, 3))
          setGeneratedAt(data.generated_at || null)
          setStale(Boolean(data.stale))
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (!loading && insights.length === 0) return null

  const generatedLabel = generatedAt
    ? new Date(generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null

  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--bg-surface))]/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">🐺</span>
          <span className="text-sm font-semibold">Wolff Says</span>
          {generatedLabel && (
            <span className={stale ? 'text-[10px] text-amber-400' : 'text-[10px] text-[hsl(var(--text-tertiary))]'}>
              {stale ? `⏳ from ${generatedLabel}` : generatedLabel}
            </span>
          )}
        </div>
        <Link href="/finance/insights" className="text-xs text-blue-400 hover:underline">
          View all →
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2.5">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-3 bg-[hsl(var(--bg-elevated))] rounded animate-pulse" style={{ width: `${70 + i * 10}%` }} />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {insights.map((ins, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className="text-xs mt-0.5">{ins.icon || typeIcons[ins.type] || '💡'}</span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-medium truncate">{ins.title}</p>
                  <span className={`shrink-0 rounded px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide ${priorityChip[ins.priority] || priorityChip.low}`}>
                    {ins.priority}
                  </span>
                </div>
                {ins.detail && (
                  <p className="text-[11px] text-[hsl(var(--text-secondary))] leading-relaxed line-clamp-2 mt-0.5">{ins.detail}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
