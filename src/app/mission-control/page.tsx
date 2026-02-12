import type { Metadata } from 'next'
import MissionControlClient from '@/components/mission-control-client'

export const metadata: Metadata = {
  title: 'Mission Control — Interstellar Squad',
  description: 'Real-time agent monitoring and communications',
}

export default function MissionControlPage() {
  return <MissionControlClient />
}
