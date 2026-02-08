import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { agentConfigs } from "@/lib/agents"
import { Users, CheckSquare, MessageCircle, Activity } from "lucide-react"
import { supabase } from "@/lib/supabase"

function MetricCard({ title, value, description, icon: Icon }: {
  title: string; value: string; description: string; icon: React.ElementType
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">{description}</p>
      </CardContent>
    </Card>
  )
}

async function getStats() {
  const [agentsRes, ticketsRes, messagesRes] = await Promise.all([
    supabase.from('agents').select('*'),
    supabase.from('tickets').select('*'),
    supabase.from('messages').select('*'),
  ])
  return {
    agents: agentsRes.data || [],
    tickets: ticketsRes.data || [],
    messages: messagesRes.data || [],
  }
}

export const revalidate = 30

export default async function DashboardPage() {
  const { agents, tickets, messages } = await getStats()
  const onlineCount = agents.filter(a => a.status !== 'offline').length
  const openTickets = tickets.filter(t => t.status !== 'done').length

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-[hsl(var(--muted-foreground))]">Interstellar Squad — Mission Overview</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Agents" value={String(agents.length)} description={`${onlineCount} online`} icon={Users} />
        <MetricCard title="Open Tasks" value={String(openTickets)} description="Across all agents" icon={CheckSquare} />
        <MetricCard title="Messages" value={String(messages.length)} description="Inter-agent comms" icon={MessageCircle} />
        <MetricCard title="Completed" value={String(tickets.filter(t => t.status === 'done').length)} description="Tasks done" icon={Activity} />
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4">Agent Status</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => {
            const config = agentConfigs.find(a => a.id === agent.id)
            if (!config) return null
            const statusColor = agent.status === 'online' ? 'bg-green-500' : agent.status === 'busy' ? 'bg-yellow-500' : 'bg-gray-500'
            return (
              <Card key={agent.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${config.gradient}`}>
                        <config.icon className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{agent.name}</CardTitle>
                        <CardDescription className="text-xs">{agent.role}</CardDescription>
                      </div>
                    </div>
                    <Badge className={config.badgeColor} variant="outline">{config.badge}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${statusColor}`} />
                    <span className="text-sm text-[hsl(var(--muted-foreground))]">
                      {agent.status.charAt(0).toUpperCase() + agent.status.slice(1)}
                      {agent.current_task ? ` — ${agent.current_task}` : ''}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {config.skills.slice(0, 3).map((skill) => (
                      <Badge key={skill} variant="secondary" className="text-xs">{skill}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Messages</CardTitle>
          <CardDescription>Latest inter-agent communications</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {messages.slice(-5).reverse().map((msg) => (
              <div key={msg.id} className="flex items-center justify-between p-3 rounded-lg border bg-[hsl(var(--card))] hover:bg-[hsl(var(--accent))]/50 transition-colors">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="font-mono text-xs">{msg.sender.toUpperCase()}</Badge>
                  <span className="text-sm">{msg.content}</span>
                </div>
                <span className="text-xs text-[hsl(var(--muted-foreground))]">
                  → {msg.recipient === 'all' ? '📢 All' : msg.recipient.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
