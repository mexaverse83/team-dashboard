// Static seed data for costs tab when Supabase table doesn't exist yet
import type { AgentCost } from './supabase'

const AGENTS = ['tars', 'cooper', 'murph', 'brand', 'mann', 'tom', 'hashimoto']
const SESSION_HOURS = [1, 4, 8, 11, 15]

function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 16807 + 0) % 2147483647
    return s / 2147483647
  }
}

function generateSeedCosts(): AgentCost[] {
  const costs: AgentCost[] = []
  const now = Date.now()
  const rand = seededRandom(42)

  const tokensConfig: Record<string, { inBase: number; inVar: number; outBase: number; outVar: number }> = {
    tars:      { inBase: 2000, inVar: 3000, outBase: 800, outVar: 1200 },
    cooper:    { inBase: 4000, inVar: 6000, outBase: 2000, outVar: 4000 },
    murph:     { inBase: 5000, inVar: 8000, outBase: 1500, outVar: 3000 },
    brand:     { inBase: 1500, inVar: 2500, outBase: 600, outVar: 1000 },
    mann:      { inBase: 3000, inVar: 4000, outBase: 1500, outVar: 2500 },
    tom:       { inBase: 2000, inVar: 3000, outBase: 1000, outVar: 2000 },
    hashimoto: { inBase: 2500, inVar: 3500, outBase: 1200, outVar: 2000 },
  }

  for (let day = 14; day >= 0; day--) {
    const dayMs = now - day * 24 * 60 * 60 * 1000
    for (const agent of AGENTS) {
      const cfg = tokensConfig[agent]
      const model = agent === 'murph' ? 'gemini-2.5-pro' : 'claude-opus-4-6'
      for (const hour of SESSION_HOURS) {
        const ts = new Date(dayMs + hour * 60 * 60 * 1000).toISOString()
        const tokens_in = Math.floor(cfg.inBase + rand() * cfg.inVar)
        const tokens_out = Math.floor(cfg.outBase + rand() * cfg.outVar)
        const cache_read = Math.floor(rand() * 5000)
        const cache_write = Math.floor(rand() * 2000)
        const cost_usd = agent === 'murph'
          ? (tokens_in * 1.25 + tokens_out * 5.0 + cache_read * 0.3) / 1_000_000
          : (tokens_in * 15.0 + tokens_out * 75.0 + cache_read * 3.75 + cache_write * 3.75) / 1_000_000

        costs.push({
          id: `seed-${agent}-${day}-${hour}`,
          agent_name: agent,
          timestamp: ts,
          model,
          tokens_in,
          tokens_out,
          cache_read,
          cache_write,
          cost_usd: Math.round(cost_usd * 1_000_000) / 1_000_000,
          session_id: `seed-${agent}-${day}`,
          created_at: ts,
        })
      }
    }
  }

  return costs
}

export const SEED_COSTS = generateSeedCosts()
