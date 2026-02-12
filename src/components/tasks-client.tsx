'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { supabase, type Ticket, type Priority, type TicketStatus } from "@/lib/supabase"
import { PageTransition } from "@/components/page-transition"
import { EmptyState } from "@/components/ui/empty-state"

const statusColumns: { id: TicketStatus; title: string; color: string }[] = [
  { id: 'backlog', title: 'Backlog', color: 'bg-slate-500' },
  { id: 'todo', title: 'To Do', color: 'bg-blue-500' },
  { id: 'in-progress', title: 'In Progress', color: 'bg-yellow-500' },
  { id: 'review', title: 'Review', color: 'bg-purple-500' },
  { id: 'done', title: 'Done', color: 'bg-green-500' },
]

const priorityConfig: Record<Priority, { label: string; color: string }> = {
  critical: { label: 'Critical', color: 'bg-red-500 text-white' },
  high: { label: 'High', color: 'bg-orange-500 text-white' },
  medium: { label: 'Medium', color: 'bg-yellow-500 text-black' },
  low: { label: 'Low', color: 'bg-slate-500 text-white' },
}

export default function TasksClient() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('tickets').select('*').order('updated_at', { ascending: false })
      .then(({ data }) => { if (data) setTickets(data); setLoading(false) })

    const sub = supabase.channel('tickets-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
        supabase.from('tickets').select('*').order('updated_at', { ascending: false })
          .then(({ data }) => { if (data) setTickets(data) })
      })
      .subscribe()

    return () => { supabase.removeChannel(sub) }
  }, [])

  return (
    <PageTransition>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
          <p className="text-[hsl(var(--muted-foreground))]">Kanban board with real-time updates</p>
        </div>
        <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New Task</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {statusColumns.map((column) => {
          const columnTickets = tickets.filter(t => t.status === column.id)
          return (
            <div key={column.id} className="space-y-3">
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${column.color}`} />
                <h3 className="text-sm font-medium">{column.title}</h3>
                <Badge variant="secondary" className="text-xs ml-auto">{columnTickets.length}</Badge>
              </div>
              <div className="space-y-2 min-h-[200px]">
                {columnTickets.map((ticket) => (
                  <Card key={ticket.id} className={`cursor-pointer hover:border-blue-500/50 transition-all duration-200 border-l-2 ${
                    ticket.priority === 'critical' ? 'border-l-red-500' : ticket.priority === 'high' ? 'border-l-orange-500' : ticket.priority === 'medium' ? 'border-l-yellow-500' : 'border-l-slate-500'
                  }`}>
                    <CardContent className="p-3 space-y-2">
                      <p className="text-sm font-medium">{ticket.title}</p>
                      <div className="flex items-center justify-between">
                        <Badge className={`text-xs ${priorityConfig[ticket.priority as Priority]?.color || ''}`}>
                          {priorityConfig[ticket.priority as Priority]?.label || ticket.priority}
                        </Badge>
                        <Badge variant="outline" className="text-xs font-mono">{ticket.assignee?.toUpperCase()}</Badge>
                      </div>
                      {ticket.labels && ticket.labels.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {ticket.labels.map((label: string) => (
                            <span key={label} className="text-xs text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))] px-1.5 py-0.5 rounded">{label}</span>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
    </PageTransition>
  )
}
