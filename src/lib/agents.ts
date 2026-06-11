import { Shield, Code, Telescope, Mail, FlaskConical, Palette, Server, type LucideIcon } from 'lucide-react'

export interface AgentConfig {
  id: string
  name: string
  role: string
  icon: LucideIcon
  gradient: string
  avatar: string
  badge: string
  badgeColor: string
  skills: string[]
  description: string
}

export const agentConfigs: AgentConfig[] = [
  {
    id: 'tars',
    name: 'TARS',
    role: 'Squad Lead & Coordinator',
    icon: Shield,
    gradient: 'from-amber-500 to-orange-600',
    avatar: '/avatars/tars.png',
    badge: 'LEAD',
    badgeColor: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    skills: ['coordination', 'task management', 'scheduling', 'escalation'],
    description: 'Squad lead. Coordinates all agents, manages priorities, runs daily standups, and interfaces with the boss.',
  },
  {
    id: 'cooper',
    name: 'COOPER',
    role: 'Full-Stack Developer & Git Specialist',
    icon: Code,
    gradient: 'from-blue-500 to-cyan-600',
    avatar: '/avatars/cooper.png',
    badge: 'DEV',
    badgeColor: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    skills: ['Node.js', 'TypeScript', 'React', 'Git', 'CI/CD'],
    description: 'Full-stack developer. Writes production-ready code, manages GitHub repos, and maintains infrastructure.',
  },
  {
    id: 'murph',
    name: 'MURPH',
    role: 'Research & Analysis',
    icon: Telescope,
    gradient: 'from-violet-500 to-purple-600',
    avatar: '/avatars/murph.png',
    badge: 'RES',
    badgeColor: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
    skills: ['research', 'analysis', 'documentation', 'tech evaluation'],
    description: 'Research specialist. Deep dives into technologies, comparisons, and provides evidence-based recommendations.',
  },
  {
    id: 'brand',
    name: 'BRAND',
    role: 'Email Classification Specialist',
    icon: Mail,
    gradient: 'from-green-500 to-emerald-600',
    avatar: '/avatars/brand.png',
    badge: 'CLS',
    badgeColor: 'bg-green-500/20 text-green-400 border-green-500/30',
    skills: ['email processing', 'classification', 'Gmail', 'automation'],
    description: 'Email classification specialist. Processes and labels emails by purpose using AI classification.',
  },
  {
    id: 'mann',
    name: 'MANN',
    role: 'SDET / QA Engineer',
    icon: FlaskConical,
    gradient: 'from-rose-500 to-pink-600',
    avatar: '/avatars/mann.png',
    badge: 'QA',
    badgeColor: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
    skills: ['testing', 'pytest', 'test automation', 'CI/CD', 'security'],
    description: 'QA engineer. Writes test suites, audits code quality, and ensures everything works before shipping.',
  },
  {
    id: 'tom',
    name: 'TOM',
    role: 'Visual Architect & Document Designer',
    icon: Palette,
    gradient: 'from-teal-500 to-cyan-600',
    avatar: '/avatars/tom.png',
    badge: 'DES',
    badgeColor: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
    skills: ['UI design', 'Tailwind CSS', 'typography', 'color systems', 'document styling'],
    description: 'Visual architect. Designs interfaces, documents, and data presentations with modern minimalist aesthetics.',
  },
  {
    id: 'hashimoto',
    name: 'HASHIMOTO',
    role: 'HashiCorp Stack Specialist',
    icon: Server,
    gradient: 'from-indigo-500 to-indigo-600',
    avatar: '/avatars/hashimoto.png',
    badge: 'INFRA',
    badgeColor: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
    skills: ['Terraform', 'Vault', 'Consul', 'Nomad', 'Packer'],
    description: 'HashiCorp stack specialist. Infrastructure as code, secrets management, service mesh, and orchestration.',
  },
  {
    id: 'wolff',
    name: 'WOLFF',
    role: 'Personal Finance Assistant',
    icon: Server,
    gradient: 'from-amber-500 to-orange-600',
    avatar: '/avatars/wolff.png',
    badge: 'FINANCE',
    badgeColor: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    skills: ['Budgeting', 'Debt Strategy', 'Savings Goals', 'Expense Analysis', 'MX Finance'],
    description: 'Personal finance domain expert. Budget planning, debt elimination, savings goals, and expense auditing.',
  },
]

export function getAgentConfig(id: string): AgentConfig | undefined {
  return agentConfigs.find(a => a.id === id)
}

// Signature colors, single source of truth for charts/feeds/glows.
// (Previously copy-pasted into four client components, drifting out of sync
// and missing the newer agents.)
export const AGENT_COLORS: Record<string, string> = {
  tars: 'hsl(35, 92%, 50%)',
  cooper: 'hsl(205, 84%, 50%)',
  murph: 'hsl(263, 70%, 58%)',
  brand: 'hsl(145, 63%, 42%)',
  mann: 'hsl(350, 80%, 55%)',
  tom: 'hsl(174, 60%, 47%)',
  hashimoto: 'hsl(239, 70%, 62%)',
  wolff: 'hsl(25, 90%, 52%)',
}

export const FALLBACK_AGENT_COLOR = 'hsl(var(--text-tertiary))'

export function agentColor(id: string): string {
  return AGENT_COLORS[id] || FALLBACK_AGENT_COLOR
}

// Agents report their own status and may die without flipping themselves to
// offline; treat anything silent past this window as offline in the UI.
export const STALE_AGENT_MS = 10 * 60 * 1000

export type EffectiveStatus = 'online' | 'busy' | 'offline'

export function effectiveStatus(
  status: string,
  lastSeen: string | null | undefined,
  now: number = Date.now(),
): EffectiveStatus {
  if (status !== 'online' && status !== 'busy') return 'offline'
  if (!lastSeen) return status
  const seen = new Date(lastSeen).getTime()
  if (!Number.isNaN(seen) && now - seen > STALE_AGENT_MS) return 'offline'
  return status
}
