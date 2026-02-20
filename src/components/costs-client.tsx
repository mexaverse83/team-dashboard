'use client'

import { useState, useEffect, useMemo } from 'react'
import { DollarSign, Users, TrendingUp, Activity, Zap } from 'lucide-react'
import { agentConfigs } from "@/lib/agents"
import { supabase, type AgentCost } from "@/lib/supabase"
import { GlassCard } from "@/components/ui/glass-card"
import { AnimatedNumber } from "@/components/ui/animated-number"
import { TrendBadge } from "@/components/ui/trend-badge"
import { SparklineChart } from "@/components/ui/sparkline-chart"
import { PageTransition } from "@/components/page-transition"
import { SkeletonKPI, SkeletonGrid } from "@/components/ui/skeleton-card"
import { cn } from "@/lib/utils"
import { SEED_COSTS } from "@/lib/seed-costs"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
  BarChart, Bar,
} from 'recharts'

const AGENT_COLORS: Record<string, string> = {
  tars: 'hsl(35, 92%, 50%)',
  cooper: 'hsl(205, 84%, 50%)',
  murph: 'hsl(263, 70%, 58%)',
  brand: 'hsl(145, 63%, 42%)',
  mann: 'hsl(350, 80%, 55%)',
  tom: 'hsl(174, 60%, 47%)',
  hashimoto: 'hsl(239, 84%, 67%)',
}

type DateRange = 'today' | '7d' | '30d'
type ModelFilter = 'all' | 'anthropic' | 'gemini'

function getDateCutoff(range: DateRange): Date {
  const now = new Date()
  switch (range) {
    case 'today': return new Date(now.getFullYear(), now.getMonth(), now.getDate())
    case '7d': return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    case '30d': return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  }
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

const tooltipStyle = {
  contentStyle: {
    background: 'hsl(222, 47%, 6%)',
    border: '1px solid hsl(222, 20%, 18%)',
    borderRadius: '8px',
    fontSize: '12px',
  },
}

export default function CostsClient() {
  const [costs, setCosts] = useState<AgentCost[]>([])
  const [dateRange, setDateRange] = useState<DateRange>('7d')
  const [modelFilter, setModelFilter] = useState<ModelFilter>('all')
  const [activeAgents, setActiveAgents] = useState<string[]>(agentConfigs.map(a => a.id))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('agent_costs')
      .select('*')
      .order('timestamp', { ascending: true })
      .then(({ data, error }) => {
        // Fall back to seed data if table doesn't exist or is empty
        if (error || !data || data.length === 0) {
          setCosts(SEED_COSTS)
        } else {
          setCosts(data)
        }
        setLoading(false)
      })

    const sub = supabase.channel('costs-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_costs' }, (payload) => {
        setCosts(prev => [...prev, payload.new as AgentCost])
      })
      .subscribe()

    return () => { supabase.removeChannel(sub) }
  }, [])

  const toggleAgent = (id: string) => {
    setActiveAgents(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  // Filter by date range and model
  const filtered = useMemo(() => {
    const cutoff = getDateCutoff(dateRange)
    return costs.filter(c => {
      if (new Date(c.timestamp) < cutoff) return false
      if (modelFilter === 'anthropic' && c.model.includes('gemini')) return false
      if (modelFilter === 'gemini' && !c.model.includes('gemini')) return false
      return true
    })
  }, [costs, dateRange, modelFilter])

  // KPI: Total spend
  const totalSpend = useMemo(() => filtered.reduce((s, c) => s + Number(c.cost_usd), 0), [filtered])

  // KPI: Avg per agent per day
  const avgPerAgentPerDay = useMemo(() => {
    const days = new Set(filtered.map(c => new Date(c.timestamp).toISOString().slice(0, 10))).size || 1
    const agents = new Set(filtered.map(c => c.agent_name)).size || 1
    return totalSpend / agents / days
  }, [filtered, totalSpend])

  // KPI: Top spender
  const topSpender = useMemo(() => {
    const map: Record<string, number> = {}
    for (const c of filtered) map[c.agent_name] = (map[c.agent_name] || 0) + Number(c.cost_usd)
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1])
    if (entries.length === 0) return { id: 'tars', name: 'TARS', cost: 0, percentage: 0 }
    const [id, cost] = entries[0]
    const config = agentConfigs.find(a => a.id === id)
    return { id, name: config?.name || id, cost, percentage: totalSpend > 0 ? Math.round((cost / totalSpend) * 100) : 0 }
  }, [filtered, totalSpend])

  // KPI: Cost trend (compare current vs prior period)
  const costTrendPercent = useMemo(() => {
    const rangeDays = dateRange === 'today' ? 1 : dateRange === '7d' ? 7 : 30
    const now = new Date()
    const priorStart = new Date(now.getTime() - 2 * rangeDays * 24 * 60 * 60 * 1000)
    const priorEnd = new Date(now.getTime() - rangeDays * 24 * 60 * 60 * 1000)
    const priorCost = costs.filter(c => {
      const t = new Date(c.timestamp)
      return t >= priorStart && t < priorEnd
    }).reduce((s, c) => s + Number(c.cost_usd), 0)
    if (priorCost === 0) return 0
    return Math.round(((totalSpend - priorCost) / priorCost) * 100)
  }, [costs, filtered, totalSpend, dateRange])

  // Daily spend sparkline for total KPI
  const dailySpendHistory = useMemo(() => {
    const map: Record<string, number> = {}
    for (const c of filtered) {
      const day = new Date(c.timestamp).toISOString().slice(0, 10)
      map[day] = (map[day] || 0) + Number(c.cost_usd)
    }
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v)
  }, [filtered])

  // Stacked area chart data
  const dailySpendData = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}
    for (const c of filtered) {
      const day = new Date(c.timestamp).toISOString().slice(5, 10)
      if (!map[day]) map[day] = {}
      map[day][c.agent_name] = (map[day][c.agent_name] || 0) + Number(c.cost_usd)
    }
    return Object.entries(map)
      .map(([date, agents]) => ({ date, ...agents }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [filtered])

  // Per-agent breakdown
  const agentBreakdown = useMemo(() => {
    const map: Record<string, { cost: number; tokensIn: number; tokensOut: number; cacheTokens: number; sessions: number; model: string; daily: Record<string, number> }> = {}
    for (const c of filtered) {
      if (!map[c.agent_name]) {
        map[c.agent_name] = { cost: 0, tokensIn: 0, tokensOut: 0, cacheTokens: 0, sessions: 0, model: c.model, daily: {} }
      }
      const m = map[c.agent_name]
      m.cost += Number(c.cost_usd)
      m.tokensIn += c.tokens_in
      m.tokensOut += c.tokens_out
      m.cacheTokens += c.cache_read + c.cache_write
      m.sessions++
      const day = new Date(c.timestamp).toISOString().slice(0, 10)
      m.daily[day] = (m.daily[day] || 0) + Number(c.cost_usd)
    }
    return Object.entries(map)
      .map(([name, data]) => ({
        name,
        ...data,
        dailyHistory: Object.entries(data.daily).sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v),
      }))
      .sort((a, b) => b.cost - a.cost)
  }, [filtered])

  // Donut data
  const donutData = useMemo(() => {
    return agentBreakdown.map(a => ({ id: a.name, name: agentConfigs.find(c => c.id === a.name)?.name || a.name, cost: Math.round(a.cost * 100) / 100 }))
  }, [agentBreakdown])

  // Horizontal stacked bar — token usage by agent
  const tokensByAgent = useMemo(() => {
    return agentBreakdown.map(a => ({
      name: (agentConfigs.find(c => c.id === a.name)?.name || a.name),
      input: a.tokensIn,
      output: a.tokensOut,
      cache: a.cacheTokens,
    }))
  }, [agentBreakdown])

  // Weekly trend sparkline for cost trend KPI
  const weeklyTrendData = useMemo(() => {
    const map: Record<string, number> = {}
    for (const c of costs) {
      const day = new Date(c.timestamp).toISOString().slice(0, 10)
      map[day] = (map[day] || 0) + Number(c.cost_usd)
    }
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).slice(-14).map(([, v]) => v)
  }, [costs])

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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Costs</h1>
          <p className="text-[hsl(var(--text-secondary))]">Agent spend and token usage</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Date range */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[hsl(var(--bg-elevated))]">
            {(['today', '7d', '30d'] as DateRange[]).map(r => (
              <button
                key={r}
                onClick={() => setDateRange(r)}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-medium transition-all",
                  dateRange === r
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--foreground))]"
                )}
              >
                {r === 'today' ? 'Today' : r}
              </button>
            ))}
          </div>
          {/* Model filter */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[hsl(var(--bg-elevated))]">
            {(['all', 'anthropic', 'gemini'] as ModelFilter[]).map(m => (
              <button
                key={m}
                onClick={() => setModelFilter(m)}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-medium transition-all",
                  modelFilter === m
                    ? "bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] shadow-sm border border-[hsl(var(--border))]"
                    : "text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--foreground))]"
                )}
              >
                {m === 'all' ? 'All' : m === 'anthropic' ? '🟣 Anthropic' : '🔵 Gemini'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── MONTHLY BUDGET TRACKER ── */}
      {(() => {
        const MONTHLY_BUDGET = 100
        const now = new Date()
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        const daysInMonth = monthEnd.getDate()
        const dayOfMonth = now.getDate()
        const daysLeft = daysInMonth - dayOfMonth

        const monthSpend = costs
          .filter(c => new Date(c.timestamp) >= monthStart)
          .reduce((s, c) => s + Number(c.cost_usd), 0)

        const totalTokensIn = costs
          .filter(c => new Date(c.timestamp) >= monthStart)
          .reduce((s, c) => s + c.tokens_in, 0)
        const totalTokensOut = costs
          .filter(c => new Date(c.timestamp) >= monthStart)
          .reduce((s, c) => s + c.tokens_out, 0)

        const dailyBurnRate = dayOfMonth > 0 ? monthSpend / dayOfMonth : 0
        const projectedMonthly = dailyBurnRate * daysInMonth
        const remaining = MONTHLY_BUDGET - monthSpend
        const usedPct = Math.min(Math.round((monthSpend / MONTHLY_BUDGET) * 100), 100)
        const daysUntilBudgetHit = dailyBurnRate > 0 ? Math.floor(remaining / dailyBurnRate) : null

        return (
          <GlassCard className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-400" />
                <h3 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--text-secondary))]">
                  Monthly Budget
                </h3>
                <span className="text-xs text-[hsl(var(--text-tertiary))]">— $100 / month</span>
              </div>
              <span className="text-xs text-[hsl(var(--text-tertiary))]">{daysLeft}d left in {now.toLocaleString('default', { month: 'long' })}</span>
            </div>

            {/* Budget bar */}
            <div className="mb-4">
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-[hsl(var(--text-secondary))]">Spent this month</span>
                <span className="tabular-nums font-mono font-semibold">${monthSpend.toFixed(2)} / $100.00</span>
              </div>
              <div className="h-3 rounded-full bg-[hsl(var(--bg-elevated))] overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    usedPct > 85 ? "bg-red-500" : usedPct > 60 ? "bg-amber-500" : "bg-emerald-500"
                  )}
                  style={{ width: `${usedPct}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] mt-1 text-[hsl(var(--text-tertiary))]">
                <span>{usedPct}% used</span>
                <span>${remaining.toFixed(2)} remaining</span>
              </div>
            </div>

            {/* Stat grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-[hsl(var(--border))]">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--text-tertiary))]">Daily Burn</p>
                <p className="text-lg font-bold tabular-nums">${dailyBurnRate.toFixed(3)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--text-tertiary))]">Projected Total</p>
                <p className={cn("text-lg font-bold tabular-nums", projectedMonthly > MONTHLY_BUDGET ? "text-red-400" : "text-emerald-400")}>
                  ${projectedMonthly.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--text-tertiary))]">Tokens This Month</p>
                <p className="text-lg font-bold tabular-nums">{((totalTokensIn + totalTokensOut) / 1000).toFixed(0)}K</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--text-tertiary))]">Budget Hit In</p>
                <p className={cn("text-lg font-bold tabular-nums", daysUntilBudgetHit != null && daysUntilBudgetHit < 7 ? "text-red-400" : "text-emerald-400")}>
                  {daysUntilBudgetHit != null ? `${daysUntilBudgetHit}d` : '—'}
                </p>
              </div>
            </div>
            <p className="text-[10px] text-[hsl(var(--text-tertiary))] mt-2">
              📊 Powered by session logs — real data once agents start reporting via /api/costs/log
            </p>
          </GlassCard>
        )
      })()}

      {/* KPI Strip */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {/* Total Spend */}
        <GlassCard>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Total Spend</span>
            <DollarSign className="h-4 w-4 text-[hsl(var(--text-tertiary))]" />
          </div>
          <p className="text-3xl font-bold">${totalSpend.toFixed(2)}</p>
          <TrendBadge value={costTrendPercent * -1} suffix="% vs last period" />
          <div className="mt-3 h-8">
            <SparklineChart data={dailySpendHistory} color="hsl(205, 84%, 50%)" />
          </div>
        </GlassCard>

        {/* Avg / Agent / Day */}
        <GlassCard>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Avg / Agent / Day</span>
            <Users className="h-4 w-4 text-[hsl(var(--text-tertiary))]" />
          </div>
          <p className="text-3xl font-bold">${avgPerAgentPerDay.toFixed(2)}</p>
          <p className="text-xs text-[hsl(var(--text-tertiary))] mt-1">Across {new Set(filtered.map(c => c.agent_name)).size} agents</p>
        </GlassCard>

        {/* Top Spender */}
        <GlassCard>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Top Spender</span>
            <TrendingUp className="h-4 w-4 text-[hsl(var(--text-tertiary))]" />
          </div>
          <div className="flex items-center gap-2 mt-1">
            <img src={`/avatars/${topSpender.id}.svg`} className="h-8 w-8 rounded-xl" alt={topSpender.name} onError={(e) => { (e.target as HTMLImageElement).src = `/avatars/${topSpender.id}.png` }} />
            <div>
              <p className="text-lg font-bold">{topSpender.name}</p>
              <p className="text-xs text-[hsl(var(--text-secondary))]">${topSpender.cost.toFixed(2)} ({topSpender.percentage}%)</p>
            </div>
          </div>
        </GlassCard>

        {/* Cost Trend */}
        <GlassCard>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Cost Trend</span>
            <Activity className="h-4 w-4 text-[hsl(var(--text-tertiary))]" />
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold">{Math.abs(costTrendPercent)}%</p>
            <span className={cn("text-sm font-medium", costTrendPercent > 0 ? "text-red-400" : "text-green-400")}>
              {costTrendPercent > 0 ? '↑' : '↓'} vs last period
            </span>
          </div>
          <div className="mt-3 h-8">
            <SparklineChart data={weeklyTrendData} color={costTrendPercent > 0 ? 'hsl(350, 80%, 55%)' : 'hsl(145, 63%, 42%)'} />
          </div>
        </GlassCard>
      </div>

      {/* Charts Row: Stacked Area (60%) + Donut (40%) */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Daily Spend Stacked Area */}
        <GlassCard className="lg:col-span-3">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold">Daily Spend</h3>
            <div className="flex gap-1">
              {agentConfigs.map(agent => (
                <button
                  key={agent.id}
                  onClick={() => toggleAgent(agent.id)}
                  className={cn(
                    "h-6 w-6 rounded-lg transition-all",
                    activeAgents.includes(agent.id) ? "opacity-100 ring-1 ring-white/20" : "opacity-30"
                  )}
                  title={agent.name}
                >
                  <img src={agent.avatar} className="h-full w-full rounded-lg" alt={agent.name} />
                </button>
              ))}
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailySpendData}>
                <defs>
                  {agentConfigs.map(agent => (
                    <linearGradient key={agent.id} id={`cost-${agent.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={AGENT_COLORS[agent.id]} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={AGENT_COLORS[agent.id]} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 14%)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: 'hsl(222, 15%, 55%)', fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'hsl(222, 20%, 14%)' }} />
                <YAxis tick={{ fill: 'hsl(222, 15%, 55%)', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
                <Tooltip {...tooltipStyle} formatter={(value) => [`$${Number(value).toFixed(4)}`]} />
                {agentConfigs.filter(a => activeAgents.includes(a.id)).map(agent => (
                  <Area
                    key={agent.id}
                    type="monotone"
                    dataKey={agent.id}
                    stackId="1"
                    stroke={AGENT_COLORS[agent.id]}
                    fill={`url(#cost-${agent.id})`}
                    strokeWidth={2}
                    name={agent.name}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        {/* Cost Distribution Donut */}
        <GlassCard className="lg:col-span-2">
          <h3 className="text-base font-semibold mb-4">Cost Distribution</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="cost"
                  animationDuration={800}
                  strokeWidth={0}
                >
                  {donutData.map(entry => (
                    <Cell key={entry.id} fill={AGENT_COLORS[entry.id]} />
                  ))}
                </Pie>
                <Tooltip {...tooltipStyle} formatter={(value) => [`$${Number(value).toFixed(2)}`]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {donutData.map(agent => (
              <div key={agent.id} className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: AGENT_COLORS[agent.id] }} />
                <span className="text-xs text-[hsl(var(--text-secondary))]">{agent.name}</span>
                <span className="text-xs font-medium ml-auto">${agent.cost.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>

      {/* Per-Agent Breakdown Cards */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Agent Breakdown</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-animate>
          {agentBreakdown.map(agent => {
            const config = agentConfigs.find(a => a.id === agent.name)
            const perInteraction = agent.sessions > 0 ? agent.cost / agent.sessions : 0

            return (
              <GlassCard key={agent.name}>
                <div className="flex items-center gap-3 mb-4">
                  {config && <img src={config.avatar} className="h-10 w-10 rounded-xl" alt={config.name} />}
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold">{config?.name || agent.name}</h3>
                    <p className="text-xs text-[hsl(var(--text-tertiary))]">
                      {agent.model.includes('gemini') ? '🔵 Gemini' :
                        agent.model.includes('haiku') ? '🟣 Haiku' :
                        agent.model.includes('opus') ? '🟣 Opus' :
                        '🟣 Sonnet 4.6'}
                    </p>
                  </div>
                  <span className="text-lg font-bold">${agent.cost.toFixed(2)}</span>
                </div>

                <div className="space-y-2 mb-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-[hsl(var(--text-secondary))]">Input tokens</span>
                    <span className="font-mono">{formatTokens(agent.tokensIn)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[hsl(var(--text-secondary))]">Output tokens</span>
                    <span className="font-mono">{formatTokens(agent.tokensOut)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[hsl(var(--text-secondary))]">Cache tokens</span>
                    <span className="font-mono">{formatTokens(agent.cacheTokens)}</span>
                  </div>
                </div>

                <div className="border-t border-[hsl(var(--border))] pt-3">
                  <div className="flex justify-between text-xs mb-2">
                    <span className="text-[hsl(var(--text-secondary))]">Cost / interaction</span>
                    <span className="font-medium">${perInteraction.toFixed(4)}</span>
                  </div>
                  <div className="h-8">
                    <SparklineChart data={agent.dailyHistory} color={AGENT_COLORS[agent.name]} />
                  </div>
                </div>
              </GlassCard>
            )
          })}
        </div>
      </div>

      {/* Token Usage Stacked Bar (horizontal) */}
      <GlassCard>
        <h3 className="text-base font-semibold mb-4">Token Usage by Type</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={tokensByAgent} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 14%)" horizontal={false} />
              <XAxis type="number" tick={{ fill: 'hsl(222, 15%, 55%)', fontSize: 11 }} tickFormatter={v => formatTokens(v)} />
              <YAxis type="category" dataKey="name" tick={{ fill: 'hsl(222, 15%, 55%)', fontSize: 12 }} width={80} />
              <Tooltip {...tooltipStyle} formatter={(value) => [formatTokens(Number(value))]} />
              <Bar dataKey="input" stackId="tokens" fill="hsl(205, 84%, 50%)" name="Input" />
              <Bar dataKey="output" stackId="tokens" fill="hsl(145, 63%, 42%)" name="Output" />
              <Bar dataKey="cache" stackId="tokens" fill="hsl(35, 92%, 50%)" radius={[0, 4, 4, 0]} name="Cache" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center justify-center gap-6 mt-3">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-sm" style={{ background: 'hsl(205, 84%, 50%)' }} />
            <span className="text-xs text-[hsl(var(--text-secondary))]">Input</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-sm" style={{ background: 'hsl(145, 63%, 42%)' }} />
            <span className="text-xs text-[hsl(var(--text-secondary))]">Output</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-sm" style={{ background: 'hsl(35, 92%, 50%)' }} />
            <span className="text-xs text-[hsl(var(--text-secondary))]">Cache</span>
          </div>
        </div>
      </GlassCard>
    </div>
    </PageTransition>
  )
}
