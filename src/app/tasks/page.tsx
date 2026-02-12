import type { Metadata } from 'next'
import TasksClient from '@/components/tasks-client'

export const metadata: Metadata = {
  title: 'Tasks — Interstellar Squad',
  description: 'Kanban board with real-time updates',
}

export default function TasksPage() {
  return <TasksClient />
}
