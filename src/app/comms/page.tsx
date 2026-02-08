'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { supabase, type Message } from "@/lib/supabase"

const typeColors: Record<string, string> = {
  chat: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  broadcast: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  system: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
}

export default function CommsPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => { if (data) setMessages(data) })

    const sub = supabase.channel('comms-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        setMessages(prev => [payload.new as Message, ...prev].slice(0, 50))
      })
      .subscribe()

    return () => { supabase.removeChannel(sub) }
  }, [])

  const filtered = filter === 'all' ? messages : messages.filter(m => m.message_type === filter)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Comms Log</h1>
        <p className="text-[hsl(var(--muted-foreground))]">Complete inter-agent communication history</p>
      </div>

      <Tabs defaultValue="all" onValueChange={setFilter}>
        <TabsList>
          <TabsTrigger value="all">All ({messages.length})</TabsTrigger>
          <TabsTrigger value="chat">Direct ({messages.filter(m => m.message_type === 'chat').length})</TabsTrigger>
          <TabsTrigger value="broadcast">Broadcast ({messages.filter(m => m.message_type === 'broadcast').length})</TabsTrigger>
          <TabsTrigger value="system">System ({messages.filter(m => m.message_type === 'system').length})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="space-y-2">
        {filtered.map((msg) => (
          <Card key={msg.id}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Badge variant="outline" className="font-mono text-xs shrink-0 mt-0.5">{msg.sender.toUpperCase()}</Badge>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">→ {msg.recipient === 'all' ? '📢 Everyone' : msg.recipient.toUpperCase()}</span>
                    <Badge variant="outline" className={`text-xs ${typeColors[msg.message_type] || ''}`}>{msg.message_type}</Badge>
                  </div>
                  <p className="text-sm">{msg.content}</p>
                </div>
                <span className="text-xs text-[hsl(var(--muted-foreground))] shrink-0">{new Date(msg.created_at).toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
