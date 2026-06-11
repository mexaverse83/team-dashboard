'use client'

import { useState, useMemo, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { agentConfigs, AGENT_COLORS, effectiveStatus } from "@/lib/agents"
import { supabase, type Agent, type Message, type Ticket } from "@/lib/supabase"
import { dailyCounts } from "@/lib/utils"
import { useLiveTables } from "@/hooks/use-live-tables"
import { Radio, CheckSquare, Zap, Clock, User } from "lucide-react"
import { GlassCard } from "@/components/ui/glass-card"
import { AgentAvatar } from "@/components/ui/agent-avatar"
import { StatusIndicator } from "@/components/ui/status-indicator"
import { AnimatedNumber } from "@/components/ui/animated-number"
import { SparklineChart } from "@/components/ui/sparkline-chart"
import { motion, AnimatePresence } from "framer-motion"
import { PageTransition } from "@/components/page-transition"
import { SkeletonGrid } from "@/components/ui/skeleton-card"

export default function MissionControlClient() {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const feedRef = useRef<HTMLDivElement>(null)

  const { data, loading } = useLiveTables<{ agents: Agent; messages: Message; tickets: Ticket }>(
    'mc-realtime',
    {
      agents: () => supabase.from('agents').select('*'),
      messages: () => supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(50),
      tickets: () => supabase.from('tickets').select('*'),
    },
  )
  const { messages, tickets } = data

  const now = Date.now()
  const agents = data.agents.map(a => ({ ...a, status: effectiveStatus(a.status, a.last_seen, now) }))

  // Real 7-day completion history per agent (replaces the old hardcoded stub)
  const weeklyActivity = useMemo(() => {
    const map: Record<string, number[]> = {}
    for (const config of agentConfigs) {
      map[config.id] = dailyCounts(
        tickets
          .filter(t => t.assignee === config.id && t.status === 'done')
          .map(t => t.updated_at || t.created_at),
      )
    }
    return map
  }, [tickets])

  const onlineCount = agents.filter(a => a.status !== 'offline').length
  const activeTasks = tickets.filter(t => t.status === 'in-progress').length
  const doneTasks = tickets.filter(t => t.status === 'done').length

  // Filter messages by selected agent
  const filteredMessages = selectedAgent
    ? messages.filter(m => m.sender === selectedAgent || m.recipient === selectedAgent)
    : messages

  // Group messages by time clusters (within 5 min)
  const groupedMessages = filteredMessages.reduce<{ time: string; items: Message[] }[]>((groups, msg) => {
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

  // Selected agent details
  const selectedAgentData = selectedAgent ? agents.find(a => a.id === selectedAgent) : null
  const selectedConfig = selectedAgent ? agentConfigs.find(a => a.id === selectedAgent) : null

  if (loading) {
    return (
      <div className="space-y-6">
        <div><div className="h-8 w-56 rounded bg-[hsl(var(--muted))] animate-pulse" /></div>
        <div className="h-10 rounded-lg bg-[hsl(var(--muted))] animate-pulse" />
        <SkeletonGrid count={6} lines={5} />
      </div>
    )
  }

  return (
    <PageTransition>
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Mission Control</h1>
        <p className="text-[hsl(var(--text-secondary))]">Real-time agent monitoring and communications</p>
      </div>

      {/* Global Status Bar — sticky */}
      <div className="sticky top-0 z-40 flex items-center gap-6 px-4 py-2.5 rounded-lg bg-[hsl(var(--bg-elevated))]/80 backdrop-blur-sm border border-[hsl(var(--border))]">
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

      {/* Agent Station Grid — 2×3 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {agentConfigs.map(config => {
          const agent = agents.find(a => a.id === config.id)
          if (!agent) return null
          const isOnline = agent.status === 'online'
          const isBusy = agent.status === 'busy'
          const isSelected = selectedAgent === config.id
          const agentColor = AGENT_COLORS[config.id]
          const agentDone = tickets.filter(t => t.assignee === config.id && t.status === 'done').length
          const agentActive = tickets.filter(t => t.assignee === config.id && t.status === 'in-progress').length
          const agentTotal = tickets.filter(t => t.assignee === config.id).length
          const completion = agentTotal > 0 ? Math.round((agentDone / agentTotal) * 100) : 0

          return (
            <motion.div
              key={config.id}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setSelectedAgent(config.id === selectedAgent ? null : config.id)}
            >
              <GlassCard
                glowColor={isOnline || isSelected ? agentColor : undefined}
                className={`cursor-pointer transition-all duration-300 ${
                  !isOnline && !isBusy ? 'opacity-50' : ''
                } ${isBusy ? 'ring-1 ring-yellow-500/30' : ''} ${
                  isSelected ? 'ring-2 ring-white/20 shadow-lg' : ''
                }`}
              >
                {/* Online glow overlay */}
                {isOnline && (
                  <div
                    className="absolute inset-0 rounded-xl opacity-20 pointer-events-none"
                    style={{
                      boxShadow: `inset 0 0 20px ${agentColor}1a`,
                      animation: 'agentGlow 3s ease-in-out infinite',
                    }}
                  />
                )}

                {/* Header */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="relative">
                    <AgentAvatar
                      src={config.avatar}
                      name={config.name}
                      size="sm"
                      status={agent.status as 'online' | 'busy' | 'offline'}
                      glowColor={agentColor}
                    />
                    {/* Activity ring */}
                    <svg className="absolute -inset-1 h-14 w-14" viewBox="0 0 56 56">
                      <circle
                        cx="28" cy="28" r="26"
                        fill="none"
                        stroke={agentColor}
                        strokeWidth="2"
                        strokeDasharray={isOnline ? "163" : isBusy ? "40 10" : "4 8"}
                        opacity={isOnline ? 0.6 : isBusy ? 0.8 : 0.2}
                        className={isBusy ? 'animate-spin-slow' : ''}
                      />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{config.name}</span>
                      <Badge variant="outline" className="text-[10px]">{config.badge}</Badge>
                    </div>
                    <p className="text-xs text-[hsl(var(--text-tertiary))] truncate">{config.role}</p>
                  </div>
                </div>

                {/* Current task */}
                <div className="flex items-center gap-2 mb-3">
                  <StatusIndicator status={agent.status as 'online' | 'busy' | 'offline'} />
                  <span className="text-sm text-[hsl(var(--text-secondary))] truncate">
                    {agent.current_task || (isOnline ? 'Standing by' : agent.status)}
                  </span>
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

                {/* Mini Stats Row — Done / Active / Avg */}
                <div className="flex items-center justify-between pt-3 border-t border-[hsl(var(--border-subtle))]">
                  <div className="text-center">
                    <AnimatedNumber value={agentDone} className="text-lg font-bold" />
                    <p className="text-xs text-[hsl(var(--text-tertiary))]">Done</p>
                  </div>
                  <div className="text-center">
                    <AnimatedNumber value={agentActive} className="text-lg font-bold text-yellow-500" />
                    <p className="text-xs text-[hsl(var(--text-tertiary))]">Active</p>
                  </div>
                  <div className="text-center">
                    <span className="text-lg font-bold">—</span>
                    <p className="text-xs text-[hsl(var(--text-tertiary))]">Avg ms</p>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          )
        })}
      </div>

      {/* Bottom: Activity Feed (60%) + Agent Detail Panel (40%) */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Activity Feed */}
        <div className="lg:col-span-3">
          <GlassCard className="h-full">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <h3 className="text-base font-semibold">Live Activity</h3>
              </div>
              {selectedAgent && (
                <Badge variant="outline" className="text-xs">
                  Filtered: {selectedAgent.toUpperCase()}
                  <button onClick={(e) => { e.stopPropagation(); setSelectedAgent(null) }} className="ml-1 opacity-50 hover:opacity-100">✕</button>
                </Badge>
              )}
            </div>

            <div ref={feedRef} className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
              {filteredMessages.length === 0 ? (
                <p className="text-sm text-[hsl(var(--text-tertiary))] text-center py-12">Waiting for activity...</p>
              ) : (
                groupedMessages.map((group, gi) => (
                  <div key={gi}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-px flex-1 bg-[hsl(var(--border))]" />
                      <span className="text-[10px] text-[hsl(var(--text-tertiary))] font-medium">{group.time}</span>
                      <div className="h-px flex-1 bg-[hsl(var(--border))]" />
                    </div>
                    <div className="space-y-2">
                      <AnimatePresence initial={false}>
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
                            <motion.div
                              key={msg.id}
                              initial={{ opacity: 0, y: 12, height: 0 }}
                              animate={{ opacity: 1, y: 0, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                              className={`flex items-start gap-2.5 p-2 rounded-lg hover:bg-[hsl(var(--bg-elevated))] transition-colors ${
                                isBroadcast ? 'border border-amber-500/20 bg-amber-500/5' : ''
                              }`}
                            >
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
                              <span className="text-[10px] text-[hsl(var(--text-tertiary))] shrink-0">
                                {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </motion.div>
                          )
                        })}
                      </AnimatePresence>
                    </div>
                  </div>
                ))
              )}
            </div>
          </GlassCard>
        </div>

        {/* Agent Detail Panel */}
        <div className="lg:col-span-2">
          <AnimatePresence mode="wait">
            {selectedAgentData && selectedConfig ? (
              <motion.div
                key={selectedAgent}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              >
                <GlassCard>
                  {/* Large avatar + info */}
                  <div className="flex items-center gap-4 mb-6">
                    <AgentAvatar
                      src={selectedConfig.avatar}
                      name={selectedConfig.name}
                      size="lg"
                      status={selectedAgentData.status as 'online' | 'busy' | 'offline'}
                      glowColor={AGENT_COLORS[selectedConfig.id]}
                    />
                    <div>
                      <h2 className="text-xl font-bold">{selectedConfig.name}</h2>
                      <p className="text-sm text-[hsl(var(--text-secondary))]">{selectedConfig.role}</p>
                      <div className="mt-1">
                        <StatusIndicator status={selectedAgentData.status as 'online' | 'busy' | 'offline'} label />
                      </div>
                    </div>
                  </div>

                  {/* Current task */}
                  {selectedAgentData.current_task && (
                    <div
                      className="p-3 rounded-lg bg-[hsl(var(--bg-elevated))] border-l-2 mb-4"
                      style={{ borderColor: AGENT_COLORS[selectedConfig.id] }}
                    >
                      <p className="text-xs text-[hsl(var(--text-tertiary))] mb-1">Current Task</p>
                      <p className="text-sm">{selectedAgentData.current_task}</p>
                    </div>
                  )}

                  {/* Role badge */}
                  <div className="mb-4">
                    <p className="text-xs text-[hsl(var(--text-tertiary))] mb-2">Role</p>
                    <Badge variant="secondary" className="text-xs">{selectedConfig.badge}</Badge>
                  </div>

                  {/* Task stats */}
                  <div className="grid grid-cols-3 gap-4 mb-4 pt-4 border-t border-[hsl(var(--border-subtle))]">
                    <div className="text-center">
                      <AnimatedNumber
                        value={tickets.filter(t => t.assignee === selectedConfig.id && t.status === 'done').length}
                        className="text-2xl font-bold"
                      />
                      <p className="text-xs text-[hsl(var(--text-tertiary))]">Completed</p>
                    </div>
                    <div className="text-center">
                      <AnimatedNumber
                        value={tickets.filter(t => t.assignee === selectedConfig.id && t.status === 'in-progress').length}
                        className="text-2xl font-bold text-yellow-500"
                      />
                      <p className="text-xs text-[hsl(var(--text-tertiary))]">Active</p>
                    </div>
                    <div className="text-center">
                      <AnimatedNumber
                        value={tickets.filter(t => t.assignee === selectedConfig.id).length}
                        className="text-2xl font-bold"
                      />
                      <p className="text-xs text-[hsl(var(--text-tertiary))]">Total</p>
                    </div>
                  </div>

                  {/* 7-day activity sparkline */}
                  <div>
                    <p className="text-xs text-[hsl(var(--text-tertiary))] mb-2">7-Day Activity</p>
                    <div className="h-12">
                      <SparklineChart
                        data={weeklyActivity[selectedConfig.id] || []}
                        color={AGENT_COLORS[selectedConfig.id]}
                      />
                    </div>
                  </div>

                  <p className="text-xs text-[hsl(var(--text-tertiary))] mt-4">
                    Last seen: {new Date(selectedAgentData.last_seen).toLocaleString()}
                  </p>
                </GlassCard>
              </motion.div>
            ) : (
              <motion.div
                key="placeholder"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <GlassCard className="flex flex-col items-center justify-center h-64">
                  <User className="h-8 w-8 text-[hsl(var(--text-tertiary))] mb-2" />
                  <p className="text-sm text-[hsl(var(--text-tertiary))]">Select an agent to view details</p>
                </GlassCard>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
    </PageTransition>
  )
}
