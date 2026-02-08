/**
 * Unit Tests — Agents Page (static, no Supabase dependency)
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import AgentsPage from '@/app/agents/page'

describe('Agents Page', () => {
  it('renders page title', () => {
    render(<AgentsPage />)
    expect(screen.getByText('Agents')).toBeInTheDocument()
  })

  it('renders subtitle', () => {
    render(<AgentsPage />)
    expect(screen.getByText('Team roster and agent profiles')).toBeInTheDocument()
  })

  it('renders all 5 agent cards', () => {
    render(<AgentsPage />)
    expect(screen.getByText('TARS')).toBeInTheDocument()
    expect(screen.getByText('COOPER')).toBeInTheDocument()
    expect(screen.getByText('MURPH')).toBeInTheDocument()
    expect(screen.getByText('BRAND')).toBeInTheDocument()
    expect(screen.getByText('MANN')).toBeInTheDocument()
  })

  it('renders agent roles', () => {
    render(<AgentsPage />)
    expect(screen.getByText('Squad Lead & Coordinator')).toBeInTheDocument()
    expect(screen.getByText('Full-Stack Developer & Git Specialist')).toBeInTheDocument()
    expect(screen.getByText('Research & Analysis')).toBeInTheDocument()
    expect(screen.getByText('Email Classification Specialist')).toBeInTheDocument()
    expect(screen.getByText('SDET / QA Engineer')).toBeInTheDocument()
  })

  it('renders agent badges', () => {
    render(<AgentsPage />)
    expect(screen.getByText('LEAD')).toBeInTheDocument()
    expect(screen.getByText('DEV')).toBeInTheDocument()
    expect(screen.getByText('RES')).toBeInTheDocument()
    expect(screen.getByText('CLS')).toBeInTheDocument()
    expect(screen.getByText('QA')).toBeInTheDocument()
  })

  it('renders agent descriptions', () => {
    render(<AgentsPage />)
    expect(screen.getByText(/Squad lead\. Coordinates all agents/)).toBeInTheDocument()
    expect(screen.getByText(/Full-stack developer\. Writes production/)).toBeInTheDocument()
  })

  it('renders skills for each agent', () => {
    render(<AgentsPage />)
    expect(screen.getByText('coordination')).toBeInTheDocument()
    expect(screen.getByText('TypeScript')).toBeInTheDocument()
    expect(screen.getByText('research')).toBeInTheDocument()
    expect(screen.getByText('email processing')).toBeInTheDocument()
    expect(screen.getByText('testing')).toBeInTheDocument()
  })

  it('shows online status for all agents', () => {
    render(<AgentsPage />)
    const onlineLabels = screen.getAllByText('Online')
    expect(onlineLabels.length).toBe(5)
  })
})
