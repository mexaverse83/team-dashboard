'use client'

import { useState } from 'react'
import { Building2, Clock } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Segmented } from '@/components/ui/segmented'
import { StatusPill } from '@/components/ui/status-pill'
import { OwnerAvatar } from '@/components/ui/owner-avatar'
import { RangeField } from '@/components/finance/investments/shared'
import { formatCoinPrice, formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

function monthsBetween(a: Date, b: Date) {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24 * 30.4)))
}
const usd = (n: number) => formatMoney(n, { currency: 'USD', showCurrency: true })
const perShare = (n: number) => formatCoinPrice(n, { currency: 'USD' })
const shares = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)

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

const PRESETS = [
  { label: 'Pessimistic', price: 1 },
  { label: 'Current', price: 2 },
  { label: 'Target', price: 10 },
  { label: 'Stretch', price: 15 },
]

export function PrivateEquityCard({ holding, fxRate }: Props) {
  const [scenarioPrice, setScenarioPrice] = useState(holding.target_price_usd)
  // Computed once per mount: the exit countdown moves monthly, not per render
  const [now] = useState(() => new Date())

  const costPerShare = holding.avg_cost_basis || 0.01
  const totalCostUSD = holding.shares * costPerShare
  const currentValueMXN = holding.shares * holding.current_price_usd * fxRate
  const targetValueUSD = holding.shares * holding.target_price_usd
  const upsideMXN = targetValueUSD * fxRate - currentValueMXN
  const upsideMultiple = holding.current_price_usd > 0 ? `${(holding.target_price_usd / holding.current_price_usd).toFixed(1)}×` : '—'
  const netTargetUSD = targetValueUSD - totalCostUSD
  const netTargetMXN = netTargetUSD * fxRate
  // Net proceeds = (scenarioPrice - costPerShare) × shares
  const scenarioValueMXN = holding.shares * (scenarioPrice - costPerShare) * fxRate
  const vsCurrent = scenarioValueMXN - currentValueMXN

  const exitStart = new Date(holding.expected_exit_start)
  const exitEnd = new Date(holding.expected_exit_end)
  const validExit = !Number.isNaN(exitStart.getTime()) && !Number.isNaN(exitEnd.getTime())
  const exitYears = validExit ? (exitStart.getFullYear() === exitEnd.getFullYear() ? `${exitStart.getFullYear()}` : `${exitStart.getFullYear()}–${exitEnd.getFullYear()}`) : 'TBD'
  const preset = PRESETS.find(p => Math.abs(scenarioPrice - p.price) < 0.01)?.label ?? ''

  return (
    <Card>
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-fg-secondary">
          <Building2 className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="flex flex-wrap items-center gap-2 text-[0.9375rem] font-semibold">
            {holding.name} <OwnerAvatar owner={holding.owner} size={16} />
          </h3>
          <p className="text-label text-fg-secondary">{holding.ticker} · {shares(holding.shares)} shares · private company</p>
        </div>
        <StatusPill tone="warning" className="shrink-0">Illiquid · est.</StatusPill>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface-2 p-3">
          <p className="text-label text-fg-secondary">Current (estimated)</p>
          <p className="tabular-nums mt-1 text-xl font-semibold" data-money="">{formatMoney(currentValueMXN)}</p>
          <p className="tabular-nums mt-0.5 text-label text-fg-tertiary">{shares(holding.shares)} × {perShare(holding.current_price_usd)} USD</p>
        </div>
        <div className="rounded-xl border border-positive/30 bg-positive-bg p-3">
          <p className="text-label text-fg-secondary">Net at target ({perShare(holding.target_price_usd)}/share)</p>
          <p className="tabular-nums mt-1 text-xl font-semibold text-fg" data-money="">{formatMoney(netTargetMXN)}</p>
          <p className="tabular-nums mt-0.5 text-label text-positive">{upsideMultiple} · {formatMoney(upsideMXN, { mode: 'compact', sign: 'always' })} upside · {usd(netTargetUSD)} net</p>
        </div>
      </div>

      <p className="mt-4 flex items-center gap-2 text-label text-fg-secondary">
        <Clock aria-hidden className="h-3.5 w-3.5 shrink-0" />
        <span>
          Exit window <span className="font-medium text-fg">{exitYears}</span>
          {validExit && <span className="tabular-nums"> · {monthsBetween(now, exitStart)}–{monthsBetween(now, exitEnd)} months away</span>}
        </span>
      </p>

      <div className="mt-4 space-y-3 border-t border-border pt-4">
        <Segmented ariaLabel="Exit price preset" size="sm" fullWidth value={preset} onChange={label => setScenarioPrice(PRESETS.find(p => p.label === label)!.price)}
          options={PRESETS.map(p => ({ value: p.label, label: <span className="text-label">{p.label} <span className="hidden tabular-nums text-fg-tertiary sm:inline">${p.price}</span></span> }))} />
        <RangeField id={`pe-${holding.id}`} label="Exit price scenario" value={scenarioPrice} min={0} max={15} step={0.5}
          onChange={setScenarioPrice} valueText={`${perShare(scenarioPrice)} per share`} hintMin="$0" hintMax="$15" />
        <div className={cn('flex items-center justify-between gap-3 rounded-xl border p-3',
          scenarioPrice >= holding.target_price_usd ? 'border-positive/30 bg-positive-bg'
            : scenarioPrice >= holding.current_price_usd ? 'border-border bg-surface-2' : 'border-negative/30 bg-negative-bg')}>
          <div>
            <p className="text-label text-fg-secondary">At {perShare(scenarioPrice)}/share (net)</p>
            <p className="tabular-nums text-lg font-semibold" data-money="">{formatMoney(scenarioValueMXN)}</p>
          </div>
          <div className="text-right">
            <p className="text-label text-fg-secondary">vs current</p>
            <p className={cn('tabular-nums text-sm font-semibold', vsCurrent >= 0 ? 'text-positive' : 'text-negative')} data-money="">{formatMoney(vsCurrent, { sign: 'always' })}</p>
          </div>
        </div>
        <p className="text-label text-fg-tertiary">
          Cost basis {usd(totalCostUSD)} ({shares(holding.shares)} × {perShare(costPerShare)}). Private-company share sales pay ISR at the marginal rate, not the 10% BMV rate — talk to a fiscal advisor before exit.
        </p>
      </div>
    </Card>
  )
}
