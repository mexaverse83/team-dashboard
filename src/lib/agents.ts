import { Shield, Code, Telescope, Mail, FlaskConical, Palette, type LucideIcon } from 'lucide-react'

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
]

export function getAgentConfig(id: string): AgentConfig | undefined {
  return agentConfigs.find(a => a.id === id)
}
