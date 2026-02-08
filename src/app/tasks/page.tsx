'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import type { Priority, TicketStatus } from "@/lib/supabase"

interface TaskItem {
  id: string
  title: string
  priority: Priority
  assignee: string
  status: TicketStatus
  labels: string[]
}

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

const mockTasks: TaskItem[] = [
  { id: '1', title: 'Build team dashboard', priority: 'high', assignee: 'COOPER', status: 'in-progress', labels: ['frontend', 'priority'] },
  { id: '2', title: 'Set up Supabase schema', priority: 'high', assignee: 'COOPER', status: 'todo', labels: ['backend', 'database'] },
  { id: '3', title: 'Write dashboard test suite', priority: 'medium', assignee: 'MANN', status: 'todo', labels: ['testing'] },
  { id: '4', title: 'Research Vercel deployment options', priority: 'medium', assignee: 'MURPH', status: 'todo', labels: ['research', 'devops'] },
  { id: '5', title: 'Configure email classification pipeline', priority: 'high', assignee: 'BRAND', status: 'in-progress', labels: ['email', 'automation'] },
  { id: '6', title: 'Set up CI/CD with GitHub Actions', priority: 'medium', assignee: 'COOPER', status: 'backlog', labels: ['devops'] },
  { id: '7', title: 'Environment bootstrap script', priority: 'high', assignee: 'COOPER', status: 'done', labels: ['infra'] },
  { id: '8', title: 'SSH key persistence fix', priority: 'critical', assignee: 'COOPER', status: 'done', labels: ['infra', 'bugfix'] },
]

export default function TasksPage() {
  const [tasks] = useState<TaskItem[]>(mockTasks)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
          <p className="text-[hsl(var(--muted-foreground))]">Kanban board — drag tasks across columns</p>
        </div>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" /> New Task
        </Button>
      </div>

      <div className="grid grid-cols-5 gap-4">
        {statusColumns.map((column) => {
          const columnTasks = tasks.filter(t => t.status === column.id)
          return (
            <div key={column.id} className="space-y-3">
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${column.color}`} />
                <h3 className="text-sm font-medium">{column.title}</h3>
                <Badge variant="secondary" className="text-xs ml-auto">{columnTasks.length}</Badge>
              </div>
              <div className="space-y-2 min-h-[200px]">
                {columnTasks.map((task) => (
                  <Card key={task.id} className="cursor-pointer hover:border-blue-500/50 transition-colors">
                    <CardContent className="p-3 space-y-2">
                      <p className="text-sm font-medium">{task.title}</p>
                      <div className="flex items-center justify-between">
                        <Badge className={`text-xs ${priorityConfig[task.priority].color}`}>
                          {priorityConfig[task.priority].label}
                        </Badge>
                        <Badge variant="outline" className="text-xs font-mono">{task.assignee}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {task.labels.map(label => (
                          <span key={label} className="text-xs text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))] px-1.5 py-0.5 rounded">
                            {label}
                          </span>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
