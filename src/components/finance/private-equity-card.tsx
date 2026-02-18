'use client'

import { useState, useMemo } from 'react'
import { Clock } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import { OwnerDot } from '@/components/finance/owner-dot'

function cn(...c: (string | false | null | undefined)[]) { return c.filter(Boolean).join(' ') }
function fmtMXN(n: number) { return `$${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)} MXN` }
function fmtUSD(n: number) { return `$${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)} USD` }
function monthsBetween(a: Date, b: Date) {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24 * 30.4)))
}

export interface PrivateEquityHolding {
  id: string
  name: string
  ticker: string
  owner: string
  shares: number
  current_price_usd: number
  target_price_usd: number
  avg_cost_basis: number        // cost per share in USD
  expected_exit_start: string   // ISO date
  expected_exit_end: string     // ISO date
}

interface Props {
  holding: PrivateEquityHolding
  fxRate: number                // live USD/MXN rate
}

export function PrivateEquityCard({ holding, fxRate }: Props) {
  const [scenarioPrice, setScenarioPrice] = useState(holding.target_price_usd)

  const costPerShare = holding.avg_cost_basis || 0.01
  const totalCostUSD = holding.shares * costPerShare

  const currentValueUSD = holding.shares * holding.current_price_usd
  const currentValueMXN = currentValueUSD * fxRate
  const targetValueUSD = holding.shares * holding.target_price_usd
  const targetValueMXN = targetValueUSD * fxRate
  const upsideMXN = targetValueMXN - currentValueMXN
  const upsideMultiple = holding.current_price_usd > 0
    ? (holding.target_price_usd / holding.current_price_usd).toFixed(1) : '—'

  // Net proceeds = (scenarioPrice - costPerShare) × shares
  const scenarioValueMXN = useMemo(() => {
    const netUSD = holding.shares * (scenarioPrice - costPerShare)
    return netUSD * fxRate
  }, [scenarioPrice, holding.shares, costPerShare, fxRate])

  const netTargetUSD = targetValueUSD - totalCostUSD
  const netTargetMXN = netTargetUSD * fxRate

  const now = new Date()
  const monthsToStart = monthsBetween(now, new Date(holding.expected_exit_start))
  const monthsToEnd = monthsBetween(now, new Date(holding.expected_exit_end))

  const presets = [
    { label: 'Pessimistic', price: 1,  color: 'text-red-400 border-red-500/30 bg-red-500/5' },
    { label: 'Current',     price: 2,  color: 'text-[hsl(var(--text-secondary))]' },
    { label: 'Target',      price: 10, color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5' },
    { label: 'Stretch',     price: 15, color: 'text-blue-400 border-blue-500/30 bg-blue-500/5' },
  ]

  return (
    <GlassCard className="p-4 sm:p-5 mb-6 border-l-2 border-amber-500/50 relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute -top-16 -right-16 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />

      <div className="relative">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-xl border border-slate-600/50">
              🏢
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold">{holding.name}</h3>
                <OwnerDot owner={holding.owner} size="sm" />
              </div>
              <p className="text-xs text-[hsl(var(--text-secondary))]">
                {holding.ticker} · {holding.shares.toLocaleString()} shares · Cost: {fmtUSD(totalCostUSD)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
              🔒 PRIVATE
            </span>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[hsl(var(--bg-elevated))] text-[hsl(var(--text-secondary))]">
              Est.
            </span>
          </div>
        </div>

        {/* Value boxes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div className="p-3 rounded-lg bg-[hsl(var(--bg-elevated))]/50 border border-[hsl(var(--border))]">
            <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-1">Current (estimated)</p>
            <p className="text-xl font-bold tabular-nums">{fmtMXN(currentValueMXN)}</p>
            <p className="text-xs text-[hsl(var(--text-secondary))] tabular-nums mt-0.5">
              {holding.shares.toLocaleString()} × ${holding.current_price_usd.toFixed(2)} USD
            </p>
          </div>
          <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
            <p className="text-[10px] uppercase tracking-wider text-emerald-400 mb-1">
              At Target (${holding.target_price_usd}/share) — Net
            </p>
            <p className="text-xl font-bold text-emerald-400 tabular-nums">{fmtMXN(netTargetMXN)}</p>
            <p className="text-xs text-emerald-400/70 tabular-nums mt-0.5">
              +{upsideMultiple}x · +{fmtMXN(upsideMXN)} upside · {fmtUSD(netTargetUSD)} net
            </p>
          </div>
        </div>

        {/* Exit window */}
        <div className="flex items-center gap-2 mb-4 text-xs text-[hsl(var(--text-secondary))]">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>
            Exit window: <span className="font-medium text-[hsl(var(--foreground))]">2028–2029</span>
            {' · '}
            <span className="tabular-nums">{monthsToStart}–{monthsToEnd} months away</span>
          </span>
        </div>

        <div className="border-t border-[hsl(var(--border))] mb-4" />

        {/* Upside slider */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-[hsl(var(--text-secondary))]">Exit Price Scenario</label>
            <span className="text-sm font-bold tabular-nums">${scenarioPrice.toFixed(2)}/share</span>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {presets.map(p => (
              <button key={p.label} onClick={() => setScenarioPrice(p.price)}
                className={cn("py-1.5 rounded-lg transition-all border text-center",
                  Math.abs(scenarioPrice - p.price) < 0.01
                    ? p.color + " shadow-sm"
                    : "border-[hsl(var(--border))] text-[hsl(var(--text-tertiary))] hover:text-[hsl(var(--text-secondary))]"
                )}>
                <span className="block text-[10px] font-medium">{p.label}</span>
                <span className="block text-[10px] tabular-nums">${p.price}</span>
              </button>
            ))}
          </div>
          <input type="range" min={0} max={15} step={0.5} value={scenarioPrice}
            onChange={e => setScenarioPrice(parseFloat(e.target.value))}
            className="w-full h-2 rounded-full appearance-none cursor-pointer bg-[hsl(var(--bg-elevated))]
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5
              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-500
              [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-grab
              [&::-webkit-slider-thumb]:active:cursor-grabbing" />
          <div className="flex justify-between text-[10px] text-[hsl(var(--text-tertiary))] -mt-1">
            <span>$0</span><span>$15</span>
          </div>
          {/* Scenario result */}
          <div className={cn("p-3 rounded-lg flex items-center justify-between",
            scenarioPrice >= holding.target_price_usd
              ? "bg-emerald-500/5 border border-emerald-500/20"
              : scenarioPrice >= holding.current_price_usd
              ? "bg-[hsl(var(--bg-elevated))]/50 border border-[hsl(var(--border))]"
              : "bg-red-500/5 border border-red-500/20"
          )}>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--text-secondary))]">
                At ${scenarioPrice.toFixed(2)}/share (net)
              </p>
              <p className={cn("text-lg font-bold tabular-nums",
                scenarioValueMXN >= 0 ? "text-emerald-400" : "text-red-400")}>
                {fmtMXN(Math.abs(scenarioValueMXN))}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-[hsl(var(--text-secondary))]">vs current</p>
              <p className={cn("text-sm font-semibold tabular-nums",
                scenarioValueMXN >= currentValueMXN ? "text-emerald-400" : "text-red-400")}>
                {scenarioValueMXN >= currentValueMXN ? '+' : ''}{fmtMXN(scenarioValueMXN - currentValueMXN)}
              </p>
            </div>
          </div>

          {/* Tax note */}
          <p className="text-[10px] text-[hsl(var(--text-tertiary))] leading-relaxed">
            ⚠️ Private company share sale subject to ISR at marginal rate (not 10% flat). Consult fiscal advisor before exit.
          </p>
        </div>
      </div>
    </GlassCard>
  )
}
