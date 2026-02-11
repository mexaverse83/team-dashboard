'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { agentConfigs } from "@/lib/agents"
import { supabase, type Agent, type Message, type Ticket } from "@/lib/supabase"
import { Radio, CheckSquare, Zap, Clock } from "lucide-react"
import { GlassCard } from "@/components/ui/glass-card"
import { AgentAvatar } from "@/components/ui/agent-avatar"
import { StatusIndicator } from "@/components/ui/status-indicator"
import { AnimatedNumber } from "@/components/ui/animated-number"

const AGENT_COLORS: Record<string, string> = {
  tars: 'hsl(35, 92%, 50%)',
  cooper: 'hsl(205, 84%, 50%)',
  murph: 'hsl(263, 70%, 58%)',
  brand: 'hsl(145, 63%, 42%)',
  mann: 'hsl(350, 80%, 55%)',
  tom: 'hsl(174, 60%, 47%)',
}

export default function MissionControlPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [tickets, setTickets] = useState<Ticket[]>([])
  const feedRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    Promise.all([
      supabase.from('agents').select('*'),
      supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(30),
      supabase.from('tickets').select('*'),
    ]).then(([a, m, t]) => {
      if (a.data) setAgents(a.data)
      if (m.data) setMessages(m.data)
      if (t.data) setTickets(t.data)
    })

    const sub = supabase.channel('mc-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agents' }, () => {
        supabase.from('agents').select('*').then(({ data }) => data && setAgents(data))
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        setMessages(prev => [payload.new as Message, ...prev].slice(0, 30))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
        supabase.from('tickets').select('*').then(({ data }) => data && setTickets(data))
      })
      .subscribe()

    return () => { supabase.removeChannel(sub) }
  }, [])

  const onlineCount = agents.filter(a => a.status !== 'offline').length
  const activeTasks = tickets.filter(t => t.status === 'in-progress').length
  const doneTasks = tickets.filter(t => t.status === 'done').length

  // Group messages by time clusters (within 5 min)
  const groupedMessages = messages.reduce<{ time: string; items: Message[] }[]>((groups, msg) => {
    const msgTime = new Date(msg.created_at)
    const timeStr = msgTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const lastGroup = groups[groups.length - 1]

    if (lastGroup) {
      const lastTime = new Date(lastGroup.items[0].created_at)
      const diffMin = Math.abs(msgTime.getTime() - lastTime.getTime()) / 60000
      if (diffMin <= 5) {
        lastGroup.items.push(msg)
        return groups
      }
    }

    groups.push({ time: timeStr, items: [msg] })
    return groups
  }, [])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Mission Control</h1>
        <p className="text-[hsl(var(--text-secondary))]">Real-time agent monitoring and communications</p>
      </div>

      {/* Global Status Bar */}
      <div className="flex items-center gap-6 px-4 py-2.5 rounded-lg bg-[hsl(var(--card))] border border-[hsl(var(--border))]">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-sm"><span className="font-semibold">{onlineCount}</span> <span className="text-[hsl(var(--text-secondary))]">Online</span></span>
        </div>
        <div className="w-px h-4 bg-[hsl(var(--border))]" />
        <div className="flex items-center gap-1.5 text-sm">
          <CheckSquare className="h-3.5 w-3.5 text-[hsl(var(--text-tertiary))]" />
          <span><span className="font-semibold">{activeTasks}</span> <span className="text-[hsl(var(--text-secondary))]">Active</span></span>
        </div>
        <div className="w-px h-4 bg-[hsl(var(--border))]" />
        <div className="flex items-center gap-1.5 text-sm">
          <Zap className="h-3.5 w-3.5 text-[hsl(var(--text-tertiary))]" />
          <span><span className="font-semibold">{doneTasks}</span> <span className="text-[hsl(var(--text-secondary))]">Done</span></span>
        </div>
        <div className="w-px h-4 bg-[hsl(var(--border))]" />
        <div className="flex items-center gap-1.5 text-sm">
          <Radio className="h-3.5 w-3.5 text-[hsl(var(--text-tertiary))]" />
          <span><span className="font-semibold"><AnimatedNumber value={messages.length} /></span> <span className="text-[hsl(var(--text-secondary))]">Messages</span></span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Agent Stations — 2x3 grid */}
        <div className="lg:col-span-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4" data-animate>
            {agentConfigs.map(config => {
              const agent = agents.find(a => a.id === config.id)
              if (!agent) return null
              const isOnline = agent.status === 'online'
              const isBusy = agent.status === 'busy'
              const agentColor = AGENT_COLORS[config.id]
              const agentDone = tickets.filter(t => t.assignee === config.id && t.status === 'done').length
              const agentTotal = tickets.filter(t => t.assignee === config.id).length
              const completion = agentTotal > 0 ? Math.round((agentDone / agentTotal) * 100) : 0

              return (
                <GlassCard
                  key={config.id}
                  glowColor={isOnline ? agentColor : undefined}
                  className={`transition-all duration-300 ${
                    !isOnline && !isBusy ? 'opacity-60' : ''
                  } ${isBusy ? 'ring-1 ring-yellow-500/30' : ''}`}
                >
                  {/* Header */}
                  <div className="flex items-center gap-3 mb-3">
                    <AgentAvatar
                      src={config.avatar}
                      name={config.name}
                      size="sm"
                      status={agent.status as any}
                      glowColor={agentColor}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{config.name}</span>
                        <StatusIndicator status={agent.status as any} label />
                      </div>
                      <p className="text-xs text-[hsl(var(--text-tertiary))] truncate">{config.role}</p>
                    </div>
                  </div>

                  {/* Current task */}
                  <div className="mb-3">
                    <p className="text-xs text-[hsl(var(--text-secondary))] truncate">
                      📌 {agent.current_task || 'Standing by'}
                    </p>
                  </div>

                  {/* Progress bar */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-[hsl(var(--text-tertiary))]">Tasks</span>
                      <span className="text-[hsl(var(--text-secondary))]">{completion}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[hsl(var(--border))] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${completion}%`, backgroundColor: agentColor }}
                      />
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[hsl(var(--text-tertiary))]">
                      ✅ <span className="font-medium text-[hsl(var(--text-secondary))]">{agentDone}</span> done
                    </span>
                    <Badge variant="secondary" className="text-[10px]">{config.badge}</Badge>
                  </div>
                </GlassCard>
              )
            })}
          </div>
        </div>

        {/* Live Activity Feed */}
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <CardTitle className="text-sm font-medium uppercase tracking-wider">Live Activity</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div ref={feedRef} className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
                {messages.length === 0 ? (
                  <p className="text-sm text-[hsl(var(--text-tertiary))] text-center py-12">Waiting for activity...</p>
                ) : (
                  groupedMessages.map((group, gi) => (
                    <div key={gi}>
                      {/* Time divider */}
                      <div className="flex items-center gap-2 mb-2">
                        <div className="h-px flex-1 bg-[hsl(var(--border))]" />
                        <span className="text-[10px] text-[hsl(var(--text-tertiary))] font-medium">{group.time}</span>
                        <div className="h-px flex-1 bg-[hsl(var(--border))]" />
                      </div>

                      {/* Messages in group */}
                      <div className="space-y-2">
                        {group.items.map(msg => {
                          const senderColor = AGENT_COLORS[msg.sender] || 'hsl(var(--text-tertiary))'
                          const isBroadcast = msg.message_type === 'broadcast' || msg.recipient === 'all'
                          const isSystem = msg.message_type === 'system'

                          if (isSystem) {
                            return (
                              <div key={msg.id} className="text-center">
                                <span className="text-xs text-[hsl(var(--text-tertiary))] italic">{msg.content}</span>
                              </div>
                            )
                          }

                          return (
                            <div key={msg.id} className={`flex items-start gap-2.5 ${isBroadcast ? 'p-2 rounded-lg border border-amber-500/20 bg-amber-500/5' : ''}`}>
                              {/* Agent color line */}
                              <div
                                className="w-0.5 min-h-[1.5rem] rounded-full shrink-0 mt-1"
                                style={{ backgroundColor: senderColor }}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className="text-xs font-semibold" style={{ color: senderColor }}>
                                    {msg.sender.toUpperCase()}
                                  </span>
                                  <span className="text-[10px] text-[hsl(var(--text-tertiary))]">
                                    → {msg.recipient === 'all' ? '📢 All' : msg.recipient.toUpperCase()}
                                  </span>
                                  {isBroadcast && (
                                    <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400">broadcast</Badge>
                                  )}
                                </div>
                                <p className="text-sm text-[hsl(var(--text-secondary))]">{msg.content}</p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
