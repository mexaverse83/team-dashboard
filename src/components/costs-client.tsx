'use client'

import { useState, useEffect, useMemo } from 'react'
import { Badge } from "@/components/ui/badge"
import { agentConfigs } from "@/lib/agents"
import { supabase, type AgentCost } from "@/lib/supabase"
import { GlassCard } from "@/components/ui/glass-card"
import { AgentAvatar } from "@/components/ui/agent-avatar"
import { AnimatedNumber } from "@/components/ui/animated-number"
import { TrendBadge } from "@/components/ui/trend-badge"
import { PageTransition } from "@/components/page-transition"
import { SkeletonKPI, SkeletonGrid } from "@/components/ui/skeleton-card"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
  BarChart, Bar, Legend,
} from 'recharts'

const AGENT_COLORS: Record<string, string> = {
  tars: 'hsl(35, 92%, 50%)',
  cooper: 'hsl(205, 84%, 50%)',
  murph: 'hsl(263, 70%, 58%)',
  brand: 'hsl(145, 63%, 42%)',
  mann: 'hsl(350, 80%, 55%)',
  tom: 'hsl(174, 60%, 47%)',
  hashimoto: 'hsl(30, 70%, 50%)',
}

type TimeRange = 'daily' | 'weekly' | 'monthly'

function getDateRange(range: TimeRange): Date {
  const now = new Date()
  switch (range) {
    case 'daily': return new Date(now.getTime() - 24 * 60 * 60 * 1000)
    case 'weekly': return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    case 'monthly': return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  }
}

function formatCost(usd: number): string {
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

export default function CostsClient() {
  const [costs, setCosts] = useState<AgentCost[]>([])
  const [range, setRange] = useState<TimeRange>('weekly')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('agent_costs')
      .select('*')
      .order('timestamp', { ascending: true })
      .then(({ data }) => {
        if (data) setCosts(data)
        setLoading(false)
      })

    const sub = supabase.channel('costs-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_costs' }, (payload) => {
        setCosts(prev => [...prev, payload.new as AgentCost])
      })
      .subscribe()

    return () => { supabase.removeChannel(sub) }
  }, [])

  // Filter by time range
  const filtered = useMemo(() => {
    const cutoff = getDateRange(range)
    return costs.filter(c => new Date(c.timestamp) >= cutoff)
  }, [costs, range])

  // KPI aggregates
  const totalCost = useMemo(() => filtered.reduce((s, c) => s + Number(c.cost_usd), 0), [filtered])
  const totalTokensIn = useMemo(() => filtered.reduce((s, c) => s + c.tokens_in, 0), [filtered])
  const totalTokensOut = useMemo(() => filtered.reduce((s, c) => s + c.tokens_out, 0), [filtered])
  const totalSessions = filtered.length

  // Per-agent cost breakdown
  const agentBreakdown = useMemo(() => {
    const map: Record<string, { cost: number; tokensIn: number; tokensOut: number; cacheRead: number; cacheWrite: number; sessions: number; model: string }> = {}
    for (const c of filtered) {
      if (!map[c.agent_name]) {
        map[c.agent_name] = { cost: 0, tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheWrite: 0, sessions: 0, model: c.model }
      }
      const m = map[c.agent_name]
      m.cost += Number(c.cost_usd)
      m.tokensIn += c.tokens_in
      m.tokensOut += c.tokens_out
      m.cacheRead += c.cache_read
      m.cacheWrite += c.cache_write
      m.sessions++
    }
    return Object.entries(map)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.cost - a.cost)
  }, [filtered])

  // Daily spend line chart data
  const dailySpend = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}
    for (const c of filtered) {
      const day = new Date(c.timestamp).toISOString().slice(0, 10)
      if (!map[day]) map[day] = {}
      map[day][c.agent_name] = (map[day][c.agent_name] || 0) + Number(c.cost_usd)
    }
    return Object.entries(map)
      .map(([date, agents]) => ({ date: date.slice(5), ...agents }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [filtered])

  // Donut data
  const donutData = useMemo(() => {
    return agentBreakdown.map(a => ({ name: a.name, value: Math.round(a.cost * 100) / 100 }))
  }, [agentBreakdown])

  // Token breakdown bar chart
  const tokenBarData = useMemo(() => {
    return agentBreakdown.map(a => ({
      name: a.name.charAt(0).toUpperCase() + a.name.slice(1),
      'Tokens In': a.tokensIn,
      'Tokens Out': a.tokensOut,
      'Cache Read': a.cacheRead,
      'Cache Write': a.cacheWrite,
    }))
  }, [agentBreakdown])

  const tooltipStyle = {
    contentStyle: {
      background: 'hsl(222, 47%, 6%)',
      border: '1px solid hsl(222, 20%, 18%)',
      borderRadius: '8px',
      fontSize: '12px',
    },
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div><div className="h-8 w-32 rounded bg-[hsl(var(--muted))] animate-pulse" /></div>
        <SkeletonKPI />
        <SkeletonGrid count={2} lines={6} />
      </div>
    )
  }

  return (
    <PageTransition>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">💰 Costs</h1>
          <p className="text-[hsl(var(--text-secondary))]">Per-agent API spend and token analytics</p>
        </div>
        <div className="flex gap-1 bg-[hsl(var(--bg-elevated))] rounded-lg p-1 border border-[hsl(var(--border))]">
          {(['daily', 'weekly', 'monthly'] as TimeRange[]).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                range === r
                  ? 'bg-blue-600 text-white'
                  : 'text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--foreground))]'
              }`}
            >
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <GlassCard>
          <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-1">Total Spend</p>
          <p className="text-3xl font-bold">${totalCost.toFixed(2)}</p>
          <TrendBadge value={-3} suffix="% vs prior" />
        </GlassCard>
        <GlassCard>
          <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-1">Tokens In</p>
          <p className="text-3xl font-bold">{formatTokens(totalTokensIn)}</p>
          <p className="text-xs text-[hsl(var(--text-tertiary))]">input tokens</p>
        </GlassCard>
        <GlassCard>
          <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-1">Tokens Out</p>
          <p className="text-3xl font-bold">{formatTokens(totalTokensOut)}</p>
          <p className="text-xs text-[hsl(var(--text-tertiary))]">output tokens</p>
        </GlassCard>
        <GlassCard>
          <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-1">Sessions</p>
          <AnimatedNumber value={totalSessions} className="text-3xl font-bold" />
          <p className="text-xs text-[hsl(var(--text-tertiary))]">API calls</p>
        </GlassCard>
      </div>

      {/* Charts Row: Daily Spend Line + Cost Distribution Donut */}
      <div className="grid gap-6 lg:grid-cols-5">
        <GlassCard className="lg:col-span-3">
          <h3 className="text-sm font-semibold mb-4">Daily Spend</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailySpend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 14%)" />
                <XAxis dataKey="date" tick={{ fill: 'hsl(222, 15%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'hsl(222, 15%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                {agentBreakdown.map(a => (
                  <Line
                    key={a.name}
                    type="monotone"
                    dataKey={a.name}
                    stroke={AGENT_COLORS[a.name]}
                    strokeWidth={2}
                    dot={false}
                    name={a.name.charAt(0).toUpperCase() + a.name.slice(1)}
                  />
                ))}
                <Tooltip {...tooltipStyle} formatter={(value) => [`$${Number(value).toFixed(4)}`]} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard className="lg:col-span-2 flex flex-col items-center">
          <h3 className="text-sm font-semibold mb-4 self-start">Cost Distribution</h3>
          <div className="relative w-56 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {donutData.map(entry => (
                    <Cell key={entry.name} fill={AGENT_COLORS[entry.name]} />
                  ))}
                </Pie>
                <Tooltip {...tooltipStyle} formatter={(value) => [`$${Number(value).toFixed(2)}`]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-bold">${totalCost.toFixed(2)}</span>
              <span className="text-xs text-[hsl(var(--text-tertiary))]">Total</span>
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-3 mt-4">
            {donutData.map(entry => (
              <div key={entry.name} className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: AGENT_COLORS[entry.name] }} />
                <span className="text-xs text-[hsl(var(--text-secondary))]">{entry.name.charAt(0).toUpperCase() + entry.name.slice(1)}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>

      {/* Token Breakdown Bar Chart */}
      <GlassCard>
        <h3 className="text-sm font-semibold mb-4">Token Breakdown by Agent</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={tokenBarData} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 14%)" />
              <XAxis dataKey="name" tick={{ fill: 'hsl(222, 15%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'hsl(222, 15%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => formatTokens(v)} />
              <Bar dataKey="Tokens In" fill="hsl(205, 84%, 50%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Tokens Out" fill="hsl(263, 70%, 58%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Cache Read" fill="hsl(145, 63%, 42%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Cache Write" fill="hsl(35, 92%, 50%)" radius={[4, 4, 0, 0]} />
              <Tooltip {...tooltipStyle} formatter={(value) => [formatTokens(Number(value))]} />
              <Legend wrapperStyle={{ fontSize: '11px', color: 'hsl(222, 15%, 55%)' }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>

      {/* Per-Agent Detail Cards */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Per-Agent Breakdown</h3>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {agentBreakdown.map(agent => {
            const config = agentConfigs.find(a => a.id === agent.name)
            const costPerSession = agent.sessions > 0 ? agent.cost / agent.sessions : 0

            return (
              <GlassCard key={agent.name} glowColor={AGENT_COLORS[agent.name]}>
                <div className="flex items-center gap-3 mb-3">
                  {config && <AgentAvatar src={config.avatar} name={config.name} size="sm" />}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold">{agent.name.charAt(0).toUpperCase() + agent.name.slice(1)}</span>
                    <p className="text-xs text-[hsl(var(--text-tertiary))]">{agent.model}</p>
                  </div>
                  <span className="text-lg font-bold">${agent.cost.toFixed(2)}</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-center pt-3 border-t border-[hsl(var(--border-subtle))]">
                  <div>
                    <p className="text-sm font-semibold">{formatTokens(agent.tokensIn)}</p>
                    <p className="text-[10px] text-[hsl(var(--text-tertiary))]">Tokens In</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{formatTokens(agent.tokensOut)}</p>
                    <p className="text-[10px] text-[hsl(var(--text-tertiary))]">Tokens Out</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{formatTokens(agent.cacheRead)}</p>
                    <p className="text-[10px] text-[hsl(var(--text-tertiary))]">Cache Read</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{agent.sessions}</p>
                    <p className="text-[10px] text-[hsl(var(--text-tertiary))]">Sessions</p>
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-[hsl(var(--border-subtle))] flex justify-between text-xs text-[hsl(var(--text-secondary))]">
                  <span>Avg/session</span>
                  <span className="font-medium">{formatCost(costPerSession)}</span>
                </div>
              </GlassCard>
            )
          })}
        </div>
      </div>
    </div>
    </PageTransition>
  )
}
