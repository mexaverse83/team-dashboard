import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { agentConfigs } from "@/lib/agents"

export default function AgentsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Agents</h1>
        <p className="text-[hsl(var(--muted-foreground))]">Team roster and agent profiles</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {agentConfigs.map((agent) => (
          <Card key={agent.id}>
            <CardHeader>
              <div className="flex items-center gap-4">
                <div className={`flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br ${agent.gradient}`}>
                  <agent.icon className="h-7 w-7 text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <CardTitle>{agent.name}</CardTitle>
                    <Badge className={agent.badgeColor} variant="outline">{agent.badge}</Badge>
                  </div>
                  <CardDescription>{agent.role}</CardDescription>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">Online</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-[hsl(var(--muted-foreground))]">{agent.description}</p>
              <div>
                <p className="text-xs font-medium text-[hsl(var(--muted-foreground))] mb-2">Skills</p>
                <div className="flex flex-wrap gap-1.5">
                  {agent.skills.map(skill => (
                    <Badge key={skill} variant="secondary" className="text-xs">{skill}</Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
