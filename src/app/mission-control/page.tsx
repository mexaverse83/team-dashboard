'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { agentConfigs } from "@/lib/agents"
import { Radio, Send } from "lucide-react"
import type { AgentStatus } from "@/lib/supabase"

interface AgentState {
  id: string
  status: AgentStatus
  currentTask: string | null
  lastSeen: string
}

const mockAgentStates: AgentState[] = [
  { id: 'tars', status: 'online', currentTask: 'Coordinating dashboard project', lastSeen: 'now' },
  { id: 'cooper', status: 'busy', currentTask: 'Building team dashboard', lastSeen: 'now' },
  { id: 'murph', status: 'online', currentTask: 'Standing by for research requests', lastSeen: '2 min ago' },
  { id: 'brand', status: 'online', currentTask: 'Monitoring email pipeline', lastSeen: '5 min ago' },
  { id: 'mann', status: 'online', currentTask: 'Writing test suites', lastSeen: '3 min ago' },
]

const mockMessages = [
  { id: '1', sender: 'TARS', recipient: 'COOPER', content: 'Green light on dashboard project. Build from scratch.', time: '17:55', type: 'direct' as const },
  { id: '2', sender: 'MANN', recipient: 'COOPER', content: 'Bootstrap v2 runs clean. Both fixes confirmed.', time: '17:47', type: 'direct' as const },
  { id: '3', sender: 'COOPER', recipient: 'MANN', content: 'SSH setup guide sent. Run setup-env.sh after restart.', time: '17:38', type: 'direct' as const },
  { id: '4', sender: 'TARS', recipient: 'all', content: 'New team member: MANN — SDET/QA Engineer', time: '17:37', type: 'broadcast' as const },
  { id: '5', sender: 'COOPER', recipient: 'TARS', content: 'All blockers cleared. SSH + Git configured.', time: '17:27', type: 'direct' as const },
]

const statusColors: Record<AgentStatus, string> = {
  online: 'bg-green-500',
  offline: 'bg-gray-500',
  busy: 'bg-yellow-500',
}

const statusLabels: Record<AgentStatus, string> = {
  online: 'Online',
  offline: 'Offline',
  busy: 'Busy',
}

export default function MissionControlPage() {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Mission Control</h1>
        <p className="text-[hsl(var(--muted-foreground))]">Real-time agent status and communications</p>
      </div>

      {/* Agent Status Bar */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {mockAgentStates.map((state) => {
          const config = agentConfigs.find(a => a.id === state.id)!
          return (
            <button
              key={state.id}
              onClick={() => setSelectedAgent(state.id === selectedAgent ? null : state.id)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors min-w-[200px] ${
                selectedAgent === state.id ? 'border-blue-500 bg-blue-500/10' : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))]/50'
              }`}
            >
              <div className={`flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br ${config.gradient}`}>
                <config.icon className="h-4 w-4 text-white" />
              </div>
              <div className="text-left">
                <div className="text-sm font-medium">{config.name}</div>
                <div className="flex items-center gap-1.5">
                  <div className={`h-1.5 w-1.5 rounded-full ${statusColors[state.status]}`} />
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">{statusLabels[state.status]}</span>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Agent Detail Panel */}
        <div className="lg:col-span-2">
          {selectedAgent ? (
            <AgentDetailCard agentId={selectedAgent} state={mockAgentStates.find(s => s.id === selectedAgent)!} />
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center h-64">
                <p className="text-sm text-[hsl(var(--muted-foreground))]">Select an agent to view details</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Message Feed */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-green-500" />
                <CardTitle className="text-base">Live Comms Feed</CardTitle>
              </div>
              <CardDescription>Inter-agent messages in real-time</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {mockMessages.map((msg) => (
                  <div key={msg.id} className="flex items-start gap-3 p-3 rounded-lg border bg-[hsl(var(--card))]">
                    <Badge variant="outline" className="font-mono text-xs shrink-0">{msg.sender}</Badge>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-[hsl(var(--muted-foreground))]">
                          → {msg.recipient === 'all' ? '📢 Everyone' : msg.recipient}
                        </span>
                        {msg.type === 'broadcast' && <Badge variant="secondary" className="text-xs">broadcast</Badge>}
                      </div>
                      <p className="text-sm">{msg.content}</p>
                    </div>
                    <span className="text-xs text-[hsl(var(--muted-foreground))] shrink-0">{msg.time}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function AgentDetailCard({ agentId, state }: { agentId: string; state: AgentState }) {
  const config = agentConfigs.find(a => a.id === agentId)!
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className={`flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br ${config.gradient}`}>
            <config.icon className="h-6 w-6 text-white" />
          </div>
          <div>
            <CardTitle>{config.name}</CardTitle>
            <CardDescription>{config.role}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className={`h-2 w-2 rounded-full ${statusColors[state.status]}`} />
            <span className="text-sm font-medium">{statusLabels[state.status]}</span>
            <span className="text-xs text-[hsl(var(--muted-foreground))]">· Last seen {state.lastSeen}</span>
          </div>
          {state.currentTask && (
            <p className="text-sm text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))] p-2 rounded">
              📌 {state.currentTask}
            </p>
          )}
        </div>
        <div>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mb-2">About</p>
          <p className="text-sm">{config.description}</p>
        </div>
        <div>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mb-2">Skills</p>
          <div className="flex flex-wrap gap-1">
            {config.skills.map(skill => (
              <Badge key={skill} variant="secondary" className="text-xs">{skill}</Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
