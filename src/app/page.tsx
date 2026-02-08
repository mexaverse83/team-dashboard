import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { agentConfigs } from "@/lib/agents"
import { Users, CheckSquare, MessageCircle, Activity } from "lucide-react"

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

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-[hsl(var(--muted-foreground))]">Interstellar Squad — Mission Overview</p>
      </div>

      {/* Quick Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Agents" value="5" description="All online" icon={Users} />
        <MetricCard title="Open Tasks" value="0" description="Across all agents" icon={CheckSquare} />
        <MetricCard title="Messages Today" value="0" description="Inter-agent comms" icon={MessageCircle} />
        <MetricCard title="Uptime" value="99.9%" description="Last 24 hours" icon={Activity} />
      </div>

      {/* Agent Status Grid */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Agent Status</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agentConfigs.map((agent) => (
            <Card key={agent.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${agent.gradient}`}>
                      <agent.icon className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{agent.name}</CardTitle>
                      <CardDescription className="text-xs">{agent.role}</CardDescription>
                    </div>
                  </div>
                  <Badge className={agent.badgeColor} variant="outline">{agent.badge}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="text-sm text-[hsl(var(--muted-foreground))]">Online — Ready</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {agent.skills.slice(0, 3).map((skill) => (
                    <Badge key={skill} variant="secondary" className="text-xs">{skill}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest events across the squad</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <ActivityItem agent="COOPER" action="Created team-dashboard repo" time="Just now" />
            <ActivityItem agent="MANN" action="Wrote 76 tests for crewai-agents-deployment" time="5 min ago" />
            <ActivityItem agent="TARS" action="Assigned dashboard project to Cooper" time="10 min ago" />
            <ActivityItem agent="MURPH" action="Completed tech stack analysis" time="15 min ago" />
            <ActivityItem agent="BRAND" action="Joined the squad" time="30 min ago" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function ActivityItem({ agent, action, time }: { agent: string; action: string; time: string }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border bg-[hsl(var(--card))] hover:bg-[hsl(var(--accent))]/50 transition-colors">
      <div className="flex items-center gap-3">
        <Badge variant="outline" className="font-mono text-xs">{agent}</Badge>
        <span className="text-sm">{action}</span>
      </div>
      <span className="text-xs text-[hsl(var(--muted-foreground))]">{time}</span>
    </div>
  )
}
