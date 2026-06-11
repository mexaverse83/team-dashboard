'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { agentConfigs, agentColor, effectiveStatus } from "@/lib/agents"
import { Users, CheckSquare, MessageCircle, Activity, Trophy } from "lucide-react"
import { supabase, type Agent, type Message, type Ticket } from "@/lib/supabase"
import { dailyCounts, percentDelta } from "@/lib/utils"
import { useLiveTables } from "@/hooks/use-live-tables"
import { PageTransition } from "@/components/page-transition"
import { SkeletonKPI, SkeletonGrid } from "@/components/ui/skeleton-card"
import { AnimatedNumber } from "@/components/ui/animated-number"
import { SparklineChart } from "@/components/ui/sparkline-chart"
import { TrendBadge } from "@/components/ui/trend-badge"
import { RadialProgress } from "@/components/ui/radial-progress"
import { GlassCard } from "@/components/ui/glass-card"
import { StatusIndicator } from "@/components/ui/status-indicator"
import { AgentAvatar } from "@/components/ui/agent-avatar"

/** Week-over-week percent change derived from a 14-day timestamp window. */
function weekOverWeek(dates: string[]): number | null {
  const days = dailyCounts(dates, 14)
  const previous = days.slice(0, 7).reduce((a, b) => a + b, 0)
  const current = days.slice(7).reduce((a, b) => a + b, 0)
  return percentDelta(current, previous)
}

export default function OverviewClient() {
  // Total message count and 14-day history come from the same fetch as the
  // feed (the feed itself is capped at 10 rows).
  const [messageCount, setMessageCount] = useState(0)
  const [messageDates, setMessageDates] = useState<string[]>([])

  const { data, loading } = useLiveTables<{ agents: Agent; tickets: Ticket; messages: Message }>(
    'overview-realtime',
    {
      agents: () => supabase.from('agents').select('*'),
      tickets: () => supabase.from('tickets').select('*'),
      messages: async () => {
        const since = new Date(Date.now() - 14 * 86_400_000).toISOString()
        const [feed, history] = await Promise.all([
          supabase.from('messages').select('*', { count: 'exact' })
            .order('created_at', { ascending: false }).limit(10),
          supabase.from('messages').select('created_at').gte('created_at', since).limit(2000),
        ])
        setMessageCount(feed.count ?? feed.data?.length ?? 0)
        setMessageDates((history.data ?? []).map((r: { created_at: string }) => r.created_at))
        return feed
      },
    },
  )
  const { tickets, messages } = data

  const now = Date.now()
  const agents = data.agents.map(a => ({ ...a, status: effectiveStatus(a.status, a.last_seen, now) }))

  const onlineCount = agents.filter(a => a.status !== 'offline').length
  const doneTickets = tickets.filter(t => t.status === 'done')
  const openTickets = tickets.filter(t => t.status !== 'done')
  const completionRate = tickets.length > 0 ? Math.round((doneTickets.length / tickets.length) * 100) : 0

  // Agent leaderboard (by done tickets)
  const leaderboard = agentConfigs
    .map(config => ({
      ...config,
      done: doneTickets.filter(t => t.assignee === config.id).length,
      agent: agents.find(a => a.id === config.id),
    }))
    .sort((a, b) => b.done - a.done)

  const recentTickets = useMemo(
    () => [...tickets].sort((a, b) =>
      new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime()
    ).slice(0, 6),
    [tickets],
  )

  // Sparklines and deltas derived from real created_at/updated_at history —
  // no fabricated data on a live dashboard.
  const kpis = useMemo(() => {
    const createdDates = tickets.map(t => t.created_at)
    const doneDates = tickets.filter(t => t.status === 'done').map(t => t.updated_at || t.created_at)
    const openCount = tickets.filter(t => t.status !== 'done').length
    const doneCount = tickets.length - openCount
    return [
      { title: 'Agents Online', value: onlineCount, icon: Users, sparkline: null, delta: null, color: 'hsl(var(--brand))' },
      { title: 'Open Tasks', value: openCount, icon: CheckSquare, sparkline: dailyCounts(createdDates), delta: weekOverWeek(createdDates), color: 'hsl(var(--warning))' },
      { title: 'Messages', value: messageCount, icon: MessageCircle, sparkline: dailyCounts(messageDates), delta: weekOverWeek(messageDates), color: 'hsl(var(--info))' },
      { title: 'Completed', value: doneCount, icon: Activity, sparkline: dailyCounts(doneDates), delta: weekOverWeek(doneDates), color: 'hsl(var(--success))' },
    ]
  }, [tickets, messageCount, messageDates, onlineCount])

  if (loading) {
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

  return (
    <PageTransition>
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-[hsl(var(--text-secondary))]">Interstellar Squad — Mission Overview</p>
      </div>

      {/* KPI Strip */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4" data-animate>
        {kpis.map(kpi => (
          <Card key={kpi.title} className="hover:shadow-lg hover:shadow-blue-500/5 hover:-translate-y-0.5 transition-all duration-200 overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-[hsl(var(--text-secondary))] uppercase tracking-wider">{kpi.title}</span>
                <kpi.icon className="h-4 w-4 text-[hsl(var(--text-tertiary))]" />
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <AnimatedNumber value={kpi.value} className="text-3xl font-bold" />
                  {kpi.delta !== null && (
                    <div className="mt-1">
                      <TrendBadge value={kpi.delta} />
                    </div>
                  )}
                </div>
                {kpi.sparkline && <SparklineChart data={kpi.sparkline} color={kpi.color} width={72} height={28} />}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Team Pulse + Bento Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Team Pulse */}
        <div className="lg:col-span-1">
          <GlassCard className="flex flex-col items-center py-8">
            <h3 className="text-sm font-medium text-[hsl(var(--text-secondary))] uppercase tracking-wider mb-6">Team Pulse</h3>
            <RadialProgress
              value={onlineCount}
              max={agents.length || 6}
              size={160}
              strokeWidth={10}
              color="hsl(var(--success))"
              label={`${onlineCount}/${agents.length || 6}`}
              sublabel="Online"
            />
            <div className="flex flex-wrap justify-center gap-3 mt-6">
              {agents.map(agent => {
                const config = agentConfigs.find(a => a.id === agent.id)
                if (!config) return null
                return (
                  <div key={agent.id} className="flex items-center gap-1.5" title={`${config.name}: ${agent.status}`}>
                    <StatusIndicator status={agent.status as any} />
                    <span className="text-xs text-[hsl(var(--text-secondary))]">{config.name}</span>
                  </div>
                )
              })}
            </div>
          </GlassCard>
        </div>

        {/* Agent Leaderboard */}
        <div className="lg:col-span-1">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" />
                <CardTitle className="text-sm font-medium uppercase tracking-wider">Leaderboard</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {leaderboard.map((entry, i) => (
                <div key={entry.id} className="flex items-center gap-3">
                  <span className="text-sm font-bold text-[hsl(var(--text-tertiary))] w-5">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
                  <AgentAvatar src={entry.avatar} name={entry.name} size="sm" status={entry.agent?.status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{entry.name}</p>
                    <p className="text-xs text-[hsl(var(--text-tertiary))]">{entry.role}</p>
                  </div>
                  <Badge variant="secondary" className="text-xs font-mono">{entry.done} done</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Completion Rate */}
        <div className="lg:col-span-1">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium uppercase tracking-wider">Completion Rate</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center py-4">
              <RadialProgress
                value={completionRate}
                size={140}
                strokeWidth={10}
                color="hsl(var(--brand))"
                label={`${completionRate}%`}
                sublabel="Tasks Done"
              />
              <div className="grid grid-cols-3 gap-4 mt-6 w-full text-center">
                <div>
                  <p className="text-lg font-bold">{doneTickets.length}</p>
                  <p className="text-xs text-[hsl(var(--text-tertiary))]">Done</p>
                </div>
                <div>
                  <p className="text-lg font-bold">{openTickets.length}</p>
                  <p className="text-xs text-[hsl(var(--text-tertiary))]">Open</p>
                </div>
                <div>
                  <p className="text-lg font-bold">{tickets.length}</p>
                  <p className="text-xs text-[hsl(var(--text-tertiary))]">Total</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bottom Bento: Recent Tasks + Live Comms */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Recent Tasks */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium uppercase tracking-wider">Recent Tasks</CardTitle>
              <Badge variant="secondary" className="text-xs">{tickets.length} total</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentTickets.map(ticket => {
              const config = agentConfigs.find(a => a.id === ticket.assignee)
              const statusColors: Record<string, string> = {
                'done': 'bg-emerald-500',
                'in-progress': 'bg-yellow-500',
                'todo': 'bg-blue-500',
                'backlog': 'bg-slate-500',
                'review': 'bg-purple-500',
              }
              return (
                <div key={ticket.id} className={`flex items-center gap-3 p-3 rounded-lg border border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))]/50 transition-colors border-l-2 ${
                  ticket.priority === 'critical' ? 'border-l-red-500' : ticket.priority === 'high' ? 'border-l-orange-500' : ticket.priority === 'medium' ? 'border-l-yellow-500' : 'border-l-slate-500'
                }`}>
                  <div className={`h-2 w-2 rounded-full shrink-0 ${statusColors[ticket.status] || 'bg-gray-500'}`} />
                  <span className="text-sm flex-1 truncate">{ticket.title}</span>
                  {config && <AgentAvatar src={config.avatar} name={config.name} size="sm" />}
                  <Badge variant="outline" className="text-xs shrink-0">{ticket.status}</Badge>
                </div>
              )
            })}
          </CardContent>
        </Card>

        {/* Live Comms Feed */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <CardTitle className="text-sm font-medium uppercase tracking-wider">Live Comms</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {messages.length === 0 ? (
              <p className="text-sm text-[hsl(var(--text-tertiary))] text-center py-8">No messages yet</p>
            ) : (
              messages.slice(0, 5).map(msg => (
                <div key={msg.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-[hsl(var(--accent))]/50 transition-colors">
                  <div
                    className="w-0.5 h-full min-h-[2rem] rounded-full shrink-0"
                    style={{ backgroundColor: agentColor(msg.sender) }}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold" style={{ color: agentColor(msg.sender) }}>{msg.sender.toUpperCase()}</span>
                      <span className="text-xs text-[hsl(var(--text-tertiary))]">→ {msg.recipient === 'all' ? 'All' : msg.recipient.toUpperCase()}</span>
                    </div>
                    <p className="text-sm text-[hsl(var(--text-secondary))] truncate">{msg.content}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
    </PageTransition>
  )
}
