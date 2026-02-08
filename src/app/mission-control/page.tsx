'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { agentConfigs } from "@/lib/agents"
import { supabase, type Agent, type Message } from "@/lib/supabase"
import { Radio } from "lucide-react"

const statusColors = { online: 'bg-green-500', offline: 'bg-gray-500', busy: 'bg-yellow-500' }
const statusLabels = { online: 'Online', offline: 'Offline', busy: 'Busy' }

export default function MissionControlPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      const [agentsRes, msgsRes] = await Promise.all([
        supabase.from('agents').select('*'),
        supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(20),
      ])
      if (agentsRes.data) setAgents(agentsRes.data)
      if (msgsRes.data) setMessages(msgsRes.data)
    }
    fetchData()

    const agentsSub = supabase.channel('agents-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agents' }, () => {
        supabase.from('agents').select('*').then(({ data }) => { if (data) setAgents(data) })
      })
      .subscribe()

    const msgsSub = supabase.channel('messages-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        setMessages(prev => [payload.new as Message, ...prev].slice(0, 20))
      })
      .subscribe()

    return () => { supabase.removeChannel(agentsSub); supabase.removeChannel(msgsSub) }
  }, [])

  const selected = agents.find(a => a.id === selectedAgent)
  const config = selectedAgent ? agentConfigs.find(a => a.id === selectedAgent) : null

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Mission Control</h1>
        <p className="text-[hsl(var(--muted-foreground))]">Real-time agent status and communications</p>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {agents.map((agent) => {
          const cfg = agentConfigs.find(a => a.id === agent.id)
          if (!cfg) return null
          return (
            <button key={agent.id}
              onClick={() => setSelectedAgent(agent.id === selectedAgent ? null : agent.id)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors min-w-[200px] ${
                selectedAgent === agent.id ? 'border-blue-500 bg-blue-500/10' : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))]/50'
              }`}>
              <div className={`flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br ${cfg.gradient}`}>
                <cfg.icon className="h-4 w-4 text-white" />
              </div>
              <div className="text-left">
                <div className="text-sm font-medium">{cfg.name}</div>
                <div className="flex items-center gap-1.5">
                  <div className={`h-1.5 w-1.5 rounded-full ${statusColors[agent.status as keyof typeof statusColors] || 'bg-gray-500'}`} />
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">{statusLabels[agent.status as keyof typeof statusLabels] || agent.status}</span>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          {selected && config ? (
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
                    <div className={`h-2 w-2 rounded-full ${statusColors[selected.status as keyof typeof statusColors] || 'bg-gray-500'}`} />
                    <span className="text-sm font-medium">{selected.status}</span>
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">· Last seen {new Date(selected.last_seen).toLocaleTimeString()}</span>
                  </div>
                  {selected.current_task && (
                    <p className="text-sm text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))] p-2 rounded">📌 {selected.current_task}</p>
                  )}
                </div>
                <div>
                  <p className="text-sm text-[hsl(var(--muted-foreground))] mb-2">About</p>
                  <p className="text-sm">{config.description}</p>
                </div>
                <div>
                  <p className="text-sm text-[hsl(var(--muted-foreground))] mb-2">Skills</p>
                  <div className="flex flex-wrap gap-1">
                    {config.skills.map(skill => <Badge key={skill} variant="secondary" className="text-xs">{skill}</Badge>)}
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center h-64">
                <p className="text-sm text-[hsl(var(--muted-foreground))]">Select an agent to view details</p>
              </CardContent>
            </Card>
          )}
        </div>

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
                {messages.map((msg) => (
                  <div key={msg.id} className="flex items-start gap-3 p-3 rounded-lg border bg-[hsl(var(--card))]">
                    <Badge variant="outline" className="font-mono text-xs shrink-0">{msg.sender.toUpperCase()}</Badge>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-[hsl(var(--muted-foreground))]">→ {msg.recipient === 'all' ? '📢 Everyone' : msg.recipient.toUpperCase()}</span>
                        {msg.message_type === 'broadcast' && <Badge variant="secondary" className="text-xs">broadcast</Badge>}
                        {msg.message_type === 'system' && <Badge variant="secondary" className="text-xs">system</Badge>}
                      </div>
                      <p className="text-sm">{msg.content}</p>
                    </div>
                    <span className="text-xs text-[hsl(var(--muted-foreground))] shrink-0">{new Date(msg.created_at).toLocaleTimeString()}</span>
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
