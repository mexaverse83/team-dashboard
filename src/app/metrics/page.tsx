'use client'

import { useState, useEffect, useMemo } from 'react'
import { Badge } from "@/components/ui/badge"
import { agentConfigs } from "@/lib/agents"
import { supabase, type Agent, type Ticket } from "@/lib/supabase"
import { GlassCard } from "@/components/ui/glass-card"
import { AgentAvatar } from "@/components/ui/agent-avatar"
import { AnimatedNumber } from "@/components/ui/animated-number"
import { SparklineChart } from "@/components/ui/sparkline-chart"
import { RadialProgress } from "@/components/ui/radial-progress"
import { TrendBadge } from "@/components/ui/trend-badge"
import { StatusIndicator } from "@/components/ui/status-indicator"
import { motion, AnimatePresence } from "framer-motion"
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'

const AGENT_COLORS: Record<string, string> = {
  tars: 'hsl(35, 92%, 50%)',
  cooper: 'hsl(205, 84%, 50%)',
  murph: 'hsl(263, 70%, 58%)',
  brand: 'hsl(145, 63%, 42%)',
  mann: 'hsl(350, 80%, 55%)',
  tom: 'hsl(174, 60%, 47%)',
}

// Stub 7-day activity per agent (tasks completed per day)
const WEEKLY_ACTIVITY: Record<string, number[]> = {
  tars: [3, 5, 4, 6, 3, 5, 4],
  cooper: [2, 4, 6, 5, 7, 6, 8],
  murph: [1, 3, 2, 4, 3, 5, 3],
  brand: [4, 4, 5, 4, 6, 5, 5],
  mann: [2, 3, 2, 4, 5, 3, 4],
  tom: [1, 2, 3, 4, 3, 4, 5],
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Radar chart dimensions per agent (stub data, 0-10 scale)
const AGENT_SKILLS: Record<string, Record<string, number>> = {
  tars: { Coordination: 9, Speed: 7, Quality: 8, Volume: 8, Communication: 10 },
  cooper: { Coordination: 5, Speed: 9, Quality: 9, Volume: 8, Communication: 6 },
  murph: { Coordination: 4, Speed: 6, Quality: 9, Volume: 5, Communication: 7 },
  brand: { Coordination: 6, Speed: 8, Quality: 7, Volume: 9, Communication: 8 },
  mann: { Coordination: 5, Speed: 7, Quality: 10, Volume: 6, Communication: 5 },
  tom: { Coordination: 6, Speed: 7, Quality: 9, Volume: 5, Communication: 7 },
}

type MetricRow = {
  id: string
  agent_id: string
  metric_type: string
  metric_value: number
  created_at: string
}

export default function MetricsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [metrics, setMetrics] = useState<MetricRow[]>([])
  const [compareAgents, setCompareAgents] = useState<string[]>([])

  useEffect(() => {
    Promise.all([
      supabase.from('agents').select('*'),
      supabase.from('tickets').select('*'),
      supabase.from('agent_metrics').select('*').order('created_at', { ascending: false }),
    ]).then(([a, t, m]) => {
      if (a.data) setAgents(a.data)
      if (t.data) setTickets(t.data)
      if (m.data) setMetrics(m.data as MetricRow[])
    })

    const sub = supabase.channel('metrics-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
        supabase.from('tickets').select('*').then(({ data }) => data && setTickets(data))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agents' }, () => {
        supabase.from('agents').select('*').then(({ data }) => data && setAgents(data))
      })
      .subscribe()

    return () => { supabase.removeChannel(sub) }
  }, [])

  // Computed stats
  const totalDone = tickets.filter(t => t.status === 'done').length
  const totalInProgress = tickets.filter(t => t.status === 'in-progress').length
  const totalTickets = tickets.length
  const completionRate = totalTickets > 0 ? Math.round((totalDone / totalTickets) * 100) : 0

  // Donut chart data: per-agent completion
  const donutData = useMemo(() => {
    return agentConfigs.map(config => {
      const done = tickets.filter(t => t.assignee === config.id && t.status === 'done').length
      return { name: config.name, value: done, id: config.id }
    }).filter(d => d.value > 0)
  }, [tickets])

  // Agent ticket stats
  const agentStats = useMemo(() => {
    const stats: Record<string, { done: number; active: number; total: number }> = {}
    for (const config of agentConfigs) {
      const agentTickets = tickets.filter(t => t.assignee === config.id)
      stats[config.id] = {
        done: agentTickets.filter(t => t.status === 'done').length,
        active: agentTickets.filter(t => t.status === 'in-progress').length,
        total: agentTickets.length,
      }
    }
    return stats
  }, [tickets])

  // Bar chart data for comparison
  const comparisonBarData = useMemo(() => {
    return DAYS.map((day, i) => {
      const entry: Record<string, string | number> = { day }
      for (const id of (compareAgents.length > 0 ? compareAgents : agentConfigs.map(c => c.id))) {
        entry[id] = WEEKLY_ACTIVITY[id]?.[i] || 0
      }
      return entry
    })
  }, [compareAgents])

  // Radar data for comparison
  const radarData = useMemo(() => {
    const dimensions = ['Coordination', 'Speed', 'Quality', 'Volume', 'Communication']
    return dimensions.map(dim => {
      const entry: Record<string, string | number> = { dimension: dim }
      for (const id of (compareAgents.length > 0 ? compareAgents : agentConfigs.map(c => c.id))) {
        entry[id] = AGENT_SKILLS[id]?.[dim] || 0
      }
      return entry
    })
  }, [compareAgents])

  const toggleCompare = (id: string) => {
    setCompareAgents(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length >= 3) return prev // Max 3
      return [...prev, id]
    })
  }

  const activeCompare = compareAgents.length > 0 ? compareAgents : agentConfigs.map(c => c.id)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Metrics</h1>
        <p className="text-[hsl(var(--text-secondary))]">Team performance and agent analytics</p>
      </div>

      {/* KPI Strip */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4" data-animate>
        <GlassCard>
          <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-1">Completion Rate</p>
          <div className="flex items-baseline gap-1">
            <AnimatedNumber value={completionRate} className="text-3xl font-bold" />
            <span className="text-lg text-[hsl(var(--text-secondary))]">%</span>
          </div>
          <TrendBadge value={8} suffix="% vs last week" />
        </GlassCard>
        <GlassCard>
          <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-1">Tasks Done</p>
          <AnimatedNumber value={totalDone} className="text-3xl font-bold" />
          <p className="text-xs text-[hsl(var(--text-tertiary))]">of {totalTickets} total</p>
        </GlassCard>
        <GlassCard>
          <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-1">In Progress</p>
          <AnimatedNumber value={totalInProgress} className="text-3xl font-bold text-yellow-500" />
          <p className="text-xs text-[hsl(var(--text-tertiary))]">active tasks</p>
        </GlassCard>
        <GlassCard>
          <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-1">Agents Online</p>
          <div className="flex items-baseline gap-1">
            <AnimatedNumber value={agents.filter(a => a.status !== 'offline').length} className="text-3xl font-bold" />
            <span className="text-lg text-[hsl(var(--text-secondary))]">/ {agents.length}</span>
          </div>
        </GlassCard>
      </div>

      {/* Hero: Team Performance Ring + Agent Leaderboard */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Donut Chart */}
        <GlassCard className="lg:col-span-2 flex flex-col items-center">
          <h3 className="text-base font-semibold mb-4 self-start">Team Performance</h3>
          <div className="relative w-64 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={100}
                  paddingAngle={3}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {donutData.map(entry => (
                    <Cell key={entry.id} fill={AGENT_COLORS[entry.id]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'hsl(222, 47%, 6%)',
                    border: '1px solid hsl(222, 20%, 18%)',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  formatter={(value) => [`${value} tasks`]}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Center label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <AnimatedNumber value={completionRate} className="text-4xl font-bold" />
              <span className="text-xs text-[hsl(var(--text-tertiary))]">Complete</span>
            </div>
          </div>
          {/* Legend */}
          <div className="flex flex-wrap justify-center gap-3 mt-4">
            {donutData.map(entry => (
              <div key={entry.id} className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: AGENT_COLORS[entry.id] }} />
                <span className="text-xs text-[hsl(var(--text-secondary))]">{entry.name}</span>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Agent Performance Cards */}
        <div className="lg:col-span-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {agentConfigs.map(config => {
            const agent = agents.find(a => a.id === config.id)
            const stats = agentStats[config.id] || { done: 0, active: 0, total: 0 }
            const completion = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0
            const isComparing = compareAgents.includes(config.id)

            return (
              <motion.div key={config.id} whileHover={{ y: -2 }} onClick={() => toggleCompare(config.id)} className="cursor-pointer">
                <GlassCard
                  glowColor={isComparing ? AGENT_COLORS[config.id] : undefined}
                  className={`transition-all ${isComparing ? 'ring-1 ring-white/20' : ''}`}
                >
                  <div className="flex items-center gap-2.5 mb-3">
                    <AgentAvatar
                      src={config.avatar}
                      name={config.name}
                      size="sm"
                      status={(agent?.status as 'online' | 'busy' | 'offline') || 'offline'}
                      glowColor={AGENT_COLORS[config.id]}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{config.name}</span>
                        {isComparing && <Badge variant="outline" className="text-[10px]">comparing</Badge>}
                      </div>
                      <p className="text-xs text-[hsl(var(--text-tertiary))] truncate">{config.role}</p>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-center">
                      <span className="text-lg font-bold">{stats.done}</span>
                      <p className="text-[10px] text-[hsl(var(--text-tertiary))]">Done</p>
                    </div>
                    <div className="text-center">
                      <span className="text-lg font-bold text-yellow-500">{stats.active}</span>
                      <p className="text-[10px] text-[hsl(var(--text-tertiary))]">Active</p>
                    </div>
                    <div className="text-center">
                      <span className="text-lg font-bold">{completion}%</span>
                      <p className="text-[10px] text-[hsl(var(--text-tertiary))]">Rate</p>
                    </div>
                  </div>

                  {/* 7-day sparkline */}
                  <div className="h-8 mt-2">
                    <SparklineChart
                      data={WEEKLY_ACTIVITY[config.id] || []}
                      color={AGENT_COLORS[config.id]}
                    />
                  </div>
                </GlassCard>
              </motion.div>
            )
          })}
        </div>
      </div>

      {/* Comparison Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Agent Comparison</h3>
            <p className="text-xs text-[hsl(var(--text-tertiary))]">
              {compareAgents.length === 0
                ? 'Click agent cards above to compare (max 3)'
                : `Comparing ${compareAgents.length} agent${compareAgents.length > 1 ? 's' : ''}`}
            </p>
          </div>
          {compareAgents.length > 0 && (
            <button
              onClick={() => setCompareAgents([])}
              className="text-xs text-[hsl(var(--text-tertiary))] hover:text-[hsl(var(--text-primary))] transition-colors"
            >
              Clear selection
            </button>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Radar Chart */}
          <GlassCard>
            <h4 className="text-sm font-semibold mb-4">Skill Radar</h4>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                  <PolarGrid stroke="hsl(222, 20%, 18%)" />
                  <PolarAngleAxis
                    dataKey="dimension"
                    tick={{ fill: 'hsl(222, 15%, 55%)', fontSize: 11 }}
                  />
                  {activeCompare.map(id => (
                    <Radar
                      key={id}
                      name={agentConfigs.find(c => c.id === id)?.name || id}
                      dataKey={id}
                      stroke={AGENT_COLORS[id]}
                      fill={AGENT_COLORS[id]}
                      fillOpacity={0.1}
                      strokeWidth={2}
                    />
                  ))}
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(222, 47%, 6%)',
                      border: '1px solid hsl(222, 20%, 18%)',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          {/* Bar Chart — 7-day comparison */}
          <GlassCard>
            <h4 className="text-sm font-semibold mb-4">7-Day Activity</h4>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparisonBarData} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 14%)" />
                  <XAxis dataKey="day" tick={{ fill: 'hsl(222, 15%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'hsl(222, 15%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  {activeCompare.map(id => (
                    <Bar
                      key={id}
                      dataKey={id}
                      fill={AGENT_COLORS[id]}
                      radius={[4, 4, 0, 0]}
                      name={agentConfigs.find(c => c.id === id)?.name || id}
                    />
                  ))}
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(222, 47%, 6%)',
                      border: '1px solid hsl(222, 20%, 18%)',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    cursor={{ fill: 'hsl(222, 47%, 6%, 0.3)' }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  )
}
