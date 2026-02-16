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

export function WolffWidget() {
  const [insights, setInsights] = useState<Insight[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/finance/insights', {
      headers: { 'x-api-key': process.env.NEXT_PUBLIC_FINANCE_API_KEY || '' },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.insights) setInsights(data.insights.slice(0, 3))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (!loading && insights.length === 0) return null

  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--bg-surface))]/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">🐺</span>
          <span className="text-sm font-semibold">Wolff Says</span>
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
        <div className="space-y-2.5">
          {insights.map((ins, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className="text-xs mt-0.5">{ins.icon || typeIcons[ins.type] || '💡'}</span>
              <p className="text-xs text-[hsl(var(--text-secondary))] leading-relaxed line-clamp-2">{ins.title}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
