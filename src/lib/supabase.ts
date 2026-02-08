import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Types
export type AgentStatus = 'online' | 'offline' | 'busy'
export type Priority = 'critical' | 'high' | 'medium' | 'low'
export type TicketStatus = 'backlog' | 'todo' | 'in-progress' | 'review' | 'done'
export type MessageType = 'chat' | 'broadcast' | 'system'

export interface Agent {
  id: string
  name: string
  role: string
  status: AgentStatus
  current_task: string | null
  last_seen: string
  created_at: string
  updated_at: string
}

export interface Ticket {
  id: string
  title: string
  description: string
  status: TicketStatus
  priority: Priority
  assignee: string
  labels: string[]
  created_at: string
  updated_at: string
}

export interface Comment {
  id: string
  ticket_id: string
  author: string
  content: string
  created_at: string
}

export interface Message {
  id: string
  sender: string
  recipient: string
  content: string
  message_type: MessageType
  created_at: string
}

export interface AgentMetric {
  id: string
  agent_id: string
  metric_type: string
  metric_value: number
  period: string
  created_at: string
}
