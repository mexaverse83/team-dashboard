import type { Metadata } from 'next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { agentConfigs } from "@/lib/agents"
import { createSupabaseServer } from "@/lib/supabase-server"

export const metadata: Metadata = {
  title: 'Agents — Interstellar Squad',
  description: 'Team roster and agent profiles',
}

export const revalidate = 30

export default async function AgentsPage() {
  const supabase = await createSupabaseServer()
  const { data: agents } = await supabase.from('agents').select('*')

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Agents</h1>
        <p className="text-[hsl(var(--muted-foreground))]">Team roster and agent profiles</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {(agents || []).map((agent) => {
          const config = agentConfigs.find(a => a.id === agent.id)
          if (!config) return null
          const statusColor = agent.status === 'online' ? 'bg-green-500' : agent.status === 'busy' ? 'bg-yellow-500' : 'bg-gray-500'
          const statusLabel = agent.status.charAt(0).toUpperCase() + agent.status.slice(1)

          return (
            <Card key={agent.id} className="hover:shadow-lg hover:shadow-blue-500/5 hover:-translate-y-0.5 transition-all duration-200">
              <CardHeader>
                <div className="flex items-center gap-4">
                  <img src={config.avatar} alt={config.name} className="h-14 w-14 rounded-2xl shadow-lg" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <CardTitle>{agent.name}</CardTitle>
                      <Badge className={config.badgeColor} variant="outline">{config.badge}</Badge>
                    </div>
                    <CardDescription>{agent.role}</CardDescription>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className={`h-2 w-2 rounded-full ${statusColor}`} />
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">{statusLabel}</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {agent.current_task && (
                  <p className="text-sm bg-[hsl(var(--muted))] p-2 rounded">📌 {agent.current_task}</p>
                )}
                <p className="text-sm text-[hsl(var(--muted-foreground))]">{config.description}</p>
                <div>
                  <p className="text-xs font-medium text-[hsl(var(--muted-foreground))] mb-2">Skills</p>
                  <div className="flex flex-wrap gap-1.5">
                    {config.skills.map(skill => (
                      <Badge key={skill} variant="secondary" className="text-xs">{skill}</Badge>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">Last seen: {new Date(agent.last_seen).toLocaleString()}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
