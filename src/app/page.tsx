'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { agentConfigs } from "@/lib/agents"
import { Users, CheckSquare, MessageCircle, Activity, Clock, Trophy } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { PageTransition } from "@/components/page-transition"
import { SkeletonKPI, SkeletonGrid } from "@/components/ui/skeleton-card"
import { AnimatedNumber } from "@/components/ui/animated-number"
import { SparklineChart } from "@/components/ui/sparkline-chart"
import { TrendBadge } from "@/components/ui/trend-badge"
import { RadialProgress } from "@/components/ui/radial-progress"
import { GlassCard } from "@/components/ui/glass-card"
import { StatusIndicator } from "@/components/ui/status-indicator"
import { AgentAvatar } from "@/components/ui/agent-avatar"

const AGENT_COLORS: Record<string, string> = {
  tars: 'hsl(35, 92%, 50%)',
  cooper: 'hsl(205, 84%, 50%)',
  murph: 'hsl(263, 70%, 58%)',
  brand: 'hsl(145, 63%, 42%)',
  mann: 'hsl(350, 80%, 55%)',
  tom: 'hsl(174, 60%, 47%)',
}

// Generate fake sparkline data (in production this would come from metrics table)
function genSparkline(base: number, variance: number, points = 7): number[] {
  return Array.from({ length: points }, () => base + Math.floor(Math.random() * variance - variance / 2))
}

export default function DashboardPage() {
  const [agents, setAgents] = useState<any[]>([])
  const [tickets, setTickets] = useState<any[]>([])
  const [messages, setMessages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('agents').select('*'),
      supabase.from('tickets').select('*'),
      supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(10),
    ]).then(([a, t, m]) => {
      setAgents(a.data || [])
      setTickets(t.data || [])
      setMessages(m.data || [])
      setLoading(false)
    })

    // Real-time subscriptions
    const sub = supabase.channel('overview-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agents' }, () => {
        supabase.from('agents').select('*').then(({ data }) => data && setAgents(data))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
        supabase.from('tickets').select('*').then(({ data }) => data && setTickets(data))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(10)
          .then(({ data }) => data && setMessages(data))
      })
      .subscribe()

    return () => { supabase.removeChannel(sub) }
  }, [])

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

  const kpis = [
    { title: 'Agents Online', value: onlineCount, icon: Users, sparkline: genSparkline(onlineCount, 2), delta: 0, color: 'hsl(var(--brand))' },
    { title: 'Open Tasks', value: openTickets.length, icon: CheckSquare, sparkline: genSparkline(openTickets.length, 3), delta: -8, color: 'hsl(var(--warning))' },
    { title: 'Messages', value: messages.length, icon: MessageCircle, sparkline: genSparkline(messages.length, 5), delta: 12, color: 'hsl(var(--info))' },
    { title: 'Completed', value: doneTickets.length, icon: Activity, sparkline: genSparkline(doneTickets.length, 4), delta: 15, color: 'hsl(var(--success))' },
  ]

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
                  <div className="mt-1">
                    <TrendBadge value={kpi.delta} />
                  </div>
                </div>
                <SparklineChart data={kpi.sparkline} color={kpi.color} width={72} height={28} />
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
            {tickets.slice(0, 6).map(ticket => {
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
                    style={{ backgroundColor: AGENT_COLORS[msg.sender] || 'hsl(var(--text-tertiary))' }}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold" style={{ color: AGENT_COLORS[msg.sender] }}>{msg.sender.toUpperCase()}</span>
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
