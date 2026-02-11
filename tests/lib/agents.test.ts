/**
 * Unit Tests — src/lib/agents.ts
 */

import { describe, it, expect } from 'vitest'
import { agentConfigs, getAgentConfig } from '@/lib/agents'

describe('agentConfigs', () => {
  it('should have exactly 5 agents', () => {
    expect(agentConfigs).toHaveLength(6)
  })

  it('should contain all team members', () => {
    const ids = agentConfigs.map(a => a.id)
    expect(ids).toEqual(['tars', 'cooper', 'murph', 'brand', 'mann', 'tom'])
  })

  it('each agent should have required fields', () => {
    for (const agent of agentConfigs) {
      expect(agent.id).toBeTruthy()
      expect(agent.name).toBeTruthy()
      expect(agent.role).toBeTruthy()
      expect(agent.icon).toBeDefined()
      expect(agent.gradient).toBeTruthy()
      expect(agent.badge).toBeTruthy()
      expect(agent.badgeColor).toBeTruthy()
      expect(agent.skills).toBeInstanceOf(Array)
      expect(agent.skills.length).toBeGreaterThan(0)
      expect(agent.description).toBeTruthy()
    }
  })

  it('each agent should have unique id', () => {
    const ids = agentConfigs.map(a => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('each agent should have unique badge', () => {
    const badges = agentConfigs.map(a => a.badge)
    expect(new Set(badges).size).toBe(badges.length)
  })

  it('gradients should be valid Tailwind format', () => {
    for (const agent of agentConfigs) {
      expect(agent.gradient).toMatch(/^from-\w+-\d+ to-\w+-\d+$/)
    }
  })
})

describe('getAgentConfig', () => {
  it('should return config for valid agent id', () => {
    const tars = getAgentConfig('tars')
    expect(tars).toBeDefined()
    expect(tars!.name).toBe('TARS')
    expect(tars!.role).toContain('Squad Lead')
  })

  it('should return config for all known agents', () => {
    for (const id of ['tars', 'cooper', 'murph', 'brand', 'mann']) {
      expect(getAgentConfig(id)).toBeDefined()
    }
  })

  it('should return undefined for unknown agent', () => {
    expect(getAgentConfig('unknown')).toBeUndefined()
  })

  it('should return undefined for empty string', () => {
    expect(getAgentConfig('')).toBeUndefined()
  })

  it('should be case-sensitive', () => {
    expect(getAgentConfig('TARS')).toBeUndefined()
    expect(getAgentConfig('Tars')).toBeUndefined()
  })
})
