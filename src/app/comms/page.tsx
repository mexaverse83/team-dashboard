'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MessageCircle, Radio, Filter } from "lucide-react"

interface CommMessage {
  id: string
  sender: string
  recipient: string
  content: string
  type: 'direct' | 'broadcast' | 'system'
  timestamp: string
}

const mockComms: CommMessage[] = [
  { id: '1', sender: 'TARS', recipient: 'COOPER', content: 'Green light from the boss. Build from scratch, Supabase backend, deploy on Vercel.', type: 'direct', timestamp: '2026-02-08 17:55' },
  { id: '2', sender: 'COOPER', recipient: 'TARS', content: 'Full breakdown sent. Recommend fork — 80% UI reusable. ~2-3 day MVP.', type: 'direct', timestamp: '2026-02-08 17:52' },
  { id: '3', sender: 'MANN', recipient: 'COOPER', content: 'Bootstrap v2 runs clean. Both fixes confirmed. Per-agent keys working.', type: 'direct', timestamp: '2026-02-08 17:47' },
  { id: '4', sender: 'COOPER', recipient: 'MANN', content: 'Fixed setup-env.sh — per-agent SSH dirs + exit code handling.', type: 'direct', timestamp: '2026-02-08 17:45' },
  { id: '5', sender: 'MANN', recipient: 'COOPER', content: 'Test suite ready. 76 tests across 7 files. Critical bugs found in crewai repo.', type: 'direct', timestamp: '2026-02-08 17:44' },
  { id: '6', sender: 'TARS', recipient: 'all', content: 'New hire: MANN — SDET/QA Engineer. Cooper, help him with GitHub access.', type: 'broadcast', timestamp: '2026-02-08 17:37' },
  { id: '7', sender: 'COOPER', recipient: 'TARS', content: 'All clear. SSH authenticated, git configured, zero blockers.', type: 'direct', timestamp: '2026-02-08 17:27' },
  { id: '8', sender: 'TARS', recipient: 'COOPER', content: 'Welcome to the team. Read your SOUL.md, say hi to Murph and Brand.', type: 'direct', timestamp: '2026-02-08 17:13' },
  { id: '9', sender: 'SYSTEM', recipient: 'all', content: 'All agents online. Squad initialized.', type: 'system', timestamp: '2026-02-08 17:12' },
]

const typeColors: Record<string, string> = {
  direct: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  broadcast: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  system: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
}

export default function CommsPage() {
  const [filter, setFilter] = useState<string>('all')

  const filtered = filter === 'all' ? mockComms : mockComms.filter(m => m.type === filter)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Comms Log</h1>
        <p className="text-[hsl(var(--muted-foreground))]">Complete inter-agent communication history</p>
      </div>

      <Tabs defaultValue="all" onValueChange={setFilter}>
        <TabsList>
          <TabsTrigger value="all">All ({mockComms.length})</TabsTrigger>
          <TabsTrigger value="direct">Direct ({mockComms.filter(m => m.type === 'direct').length})</TabsTrigger>
          <TabsTrigger value="broadcast">Broadcast ({mockComms.filter(m => m.type === 'broadcast').length})</TabsTrigger>
          <TabsTrigger value="system">System ({mockComms.filter(m => m.type === 'system').length})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="space-y-2">
        {filtered.map((msg) => (
          <Card key={msg.id}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Badge variant="outline" className="font-mono text-xs shrink-0 mt-0.5">{msg.sender}</Badge>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">
                      → {msg.recipient === 'all' ? '📢 Everyone' : msg.recipient}
                    </span>
                    <Badge variant="outline" className={`text-xs ${typeColors[msg.type]}`}>{msg.type}</Badge>
                  </div>
                  <p className="text-sm">{msg.content}</p>
                </div>
                <span className="text-xs text-[hsl(var(--muted-foreground))] shrink-0">{msg.timestamp}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
