import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { agentConfigs } from "@/lib/agents"
import { supabase } from "@/lib/supabase"

export const revalidate = 30

const metricLabels: Record<string, string> = {
  tasks_completed: 'Tasks Completed',
  emails_classified: 'Emails Classified',
  tests_written: 'Tests Written',
  research_delivered: 'Research Delivered',
  response_time_ms: 'Avg Response (ms)',
}

const metricIcons: Record<string, string> = {
  tasks_completed: '✅',
  emails_classified: '📧',
  tests_written: '🧪',
  research_delivered: '🔬',
  response_time_ms: '⚡',
}

export default async function MetricsPage() {
  const [metricsRes, agentsRes, ticketsRes] = await Promise.all([
    supabase.from('agent_metrics').select('*').order('created_at', { ascending: false }),
    supabase.from('agents').select('*'),
    supabase.from('tickets').select('*'),
  ])

  const metrics = metricsRes.data || []
  const agents = agentsRes.data || []
  const tickets = ticketsRes.data || []

  // Group metrics by agent
  const agentMetrics: Record<string, typeof metrics> = {}
  for (const m of metrics) {
    if (!agentMetrics[m.agent_id]) agentMetrics[m.agent_id] = []
    agentMetrics[m.agent_id].push(m)
  }

  // Ticket stats per agent
  const agentTicketStats: Record<string, { done: number; inProgress: number; total: number }> = {}
  for (const t of tickets) {
    const a = t.assignee || 'unassigned'
    if (!agentTicketStats[a]) agentTicketStats[a] = { done: 0, inProgress: 0, total: 0 }
    agentTicketStats[a].total++
    if (t.status === 'done') agentTicketStats[a].done++
    if (t.status === 'in-progress') agentTicketStats[a].inProgress++
  }

  // Team totals
  const totalDone = tickets.filter(t => t.status === 'done').length
  const totalInProgress = tickets.filter(t => t.status === 'in-progress').length
  const totalTickets = tickets.length
  const completionRate = totalTickets > 0 ? Math.round((totalDone / totalTickets) * 100) : 0

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Metrics</h1>
        <p className="text-[hsl(var(--muted-foreground))]">Agent performance and team productivity</p>
      </div>

      {/* Team Summary */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{completionRate}%</div>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">{totalDone}/{totalTickets} tasks done</p>
            <div className="mt-2 h-2 rounded-full bg-[hsl(var(--muted))]">
              <div className="h-2 rounded-full bg-green-500 transition-all" style={{ width: `${completionRate}%` }} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalInProgress}</div>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Active tasks</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Agents Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{agents.filter(a => a.status !== 'offline').length}/{agents.length}</div>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Online now</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{metrics.length}</div>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Data points tracked</p>
          </CardContent>
        </Card>
      </div>

      {/* Per-Agent Performance */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Agent Performance</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => {
            const config = agentConfigs.find(a => a.id === agent.id)
            if (!config) return null
            const agentM = agentMetrics[agent.id] || []
            const ticketStats = agentTicketStats[agent.id] || { done: 0, inProgress: 0, total: 0 }
            const statusColor = agent.status === 'online' ? 'bg-green-500' : agent.status === 'busy' ? 'bg-yellow-500' : 'bg-gray-500'

            return (
              <Card key={agent.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${config.gradient}`}>
                      <config.icon className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-base">{agent.name}</CardTitle>
                      <CardDescription className="text-xs">{config.role}</CardDescription>
                    </div>
                    <div className={`h-2 w-2 rounded-full ${statusColor}`} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Ticket Stats */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[hsl(var(--muted-foreground))]">Tasks</span>
                    <span>
                      <span className="text-green-500 font-medium">{ticketStats.done} done</span>
                      {ticketStats.inProgress > 0 && <span className="text-yellow-500 ml-2">{ticketStats.inProgress} active</span>}
                      <span className="text-[hsl(var(--muted-foreground))] ml-2">/ {ticketStats.total}</span>
                    </span>
                  </div>

                  {/* Progress bar */}
                  {ticketStats.total > 0 && (
                    <div className="h-1.5 rounded-full bg-[hsl(var(--muted))]">
                      <div className="h-1.5 rounded-full bg-green-500 transition-all" style={{ width: `${Math.round((ticketStats.done / ticketStats.total) * 100)}%` }} />
                    </div>
                  )}

                  {/* Agent-specific metrics */}
                  {agentM.filter(m => m.metric_type !== 'response_time_ms').map((m) => (
                    <div key={m.id} className="flex items-center justify-between text-sm">
                      <span className="text-[hsl(var(--muted-foreground))]">{metricIcons[m.metric_type] || '📊'} {metricLabels[m.metric_type] || m.metric_type}</span>
                      <span className="font-medium">{Number(m.metric_value)}</span>
                    </div>
                  ))}

                  {/* Response time */}
                  {agentM.filter(m => m.metric_type === 'response_time_ms').map((m) => (
                    <div key={m.id} className="flex items-center justify-between text-sm">
                      <span className="text-[hsl(var(--muted-foreground))]">⚡ Avg Response</span>
                      <Badge variant="secondary" className="text-xs">{Number(m.metric_value)}ms</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
