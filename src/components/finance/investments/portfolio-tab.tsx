'use client'

import Link from 'next/link'
import { Bitcoin, BarChart3, Home, Landmark, Lock, Shield } from 'lucide-react'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, AreaChart, Area, XAxis, YAxis } from 'recharts'
import { Card, CardHeader } from '@/components/ui/card'
import { Stat } from '@/components/ui/stat'
import { MoneyText } from '@/components/ui/money-text'
import { ChartFigure, chartTooltipProps, moneyTooltipFormatter } from '@/components/ui/finance-chart'
import { OwnerBar } from '@/components/finance/owner-dot'
import { FamilyFutureStrip, type FamilyFutureBaby } from '@/components/finance/family-tracker'
// Static: this whole tab is already a dynamic chunk, so WEST and recharts share it
import { WestProjectionWithScenarios } from '@/components/finance/west-tracker'
import { formatDateShort, formatDelta, formatMoney, formatPct, EMPTY_VALUE } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ASSET_COLOR } from './shared'
import type { Portfolio } from './portfolio'
import type { InvestmentSource, InvestmentsTab } from './types'
import type { NetWorthData } from './use-investments-data'


interface Props {
  portfolio: Portfolio
  ownerFilter: string
  errors: Partial<Record<InvestmentSource, string>>
  netWorth: NetWorthData | undefined
  baby: FamilyFutureBaby | null | undefined
  onOpenTab: (tab: InvestmentsTab) => void
}

type AssetName = keyof typeof ASSET_COLOR

export function PortfolioTab({ portfolio, ownerFilter, errors, netWorth, baby, onOpenTab }: Props) {
  const { totals, positions, byOwner, pl, plPct } = portfolio
  const anyError = Object.keys(errors).length > 0

  const classes: Array<{ name: AssetName; tab: InvestmentsTab; icon: typeof Bitcoin; value: number; source: InvestmentSource; count: number; noun: string; split?: { a: number; b: number }; locked?: boolean; note?: string }> = [
    { name: 'Crypto', tab: 'Crypto', icon: Bitcoin, value: totals.crypto, source: 'crypto', count: positions.crypto, noun: 'coin', split: byOwner.crypto },
    { name: 'Stocks', tab: 'Stocks', icon: BarChart3, value: totals.stocks, source: 'stocks', count: positions.stocks, noun: 'position', split: byOwner.stocks, note: totals.privateEquity > 0 ? 'incl. private equity est.' : undefined },
    { name: 'Fixed Income', tab: 'Fixed Income', icon: Shield, value: totals.fixedIncome, source: 'fixedIncome', count: positions.fixedIncome, noun: 'fund', split: byOwner.fixedIncome },
    { name: 'Real Estate', tab: 'Real Estate', icon: Home, value: totals.realEstate, source: 'realEstate', count: positions.realEstate, noun: 'property', split: byOwner.realEstate },
    { name: 'Retirement', tab: 'Retirement', icon: Lock, value: totals.retirement, source: 'retirement', count: positions.retirement, noun: 'account', locked: true },
  ]
  const allocation = classes
    .filter(c => !errors[c.source] && c.value > 0)
    .map(c => ({ name: c.name, value: c.value, pct: totals.total > 0 ? (c.value / totals.total) * 100 : 0 }))

  const points = netWorth?.points ?? []
  const latest = netWorth?.latest ?? null

  return (
    <div className="space-y-4">
      <Card variant="hero">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <Stat
            size="hero"
            money
            label={ownerFilter === 'All' ? 'Invested assets' : `${ownerFilter}'s invested assets`}
            value={anyError ? <span title="Some holdings didn't load">{formatMoney(totals.total)}<span className="text-fg-tertiary">*</span></span> : formatMoney(totals.total)}
            delta={pl !== null ? `${formatDelta(pl)} (${formatPct(plPct ?? 0, { decimals: 1, sign: 'always' })})` : undefined}
            hint={pl !== null ? 'on crypto, stocks & fixed income cost' : undefined}
            tone={pl === null ? 'neutral' : pl >= 0 ? 'positive' : 'negative'}
          />
          {latest && ownerFilter === 'All' && (
            <div className="min-w-0 sm:text-right">
              <p className="text-label font-medium text-fg-secondary">Household net worth</p>
              <p className="text-xl font-semibold"><MoneyText value={latest.net_worth} /></p>
              <p className="text-label text-fg-tertiary">
                Snapshot {formatDateShort(latest.date, { withYear: 'auto' })} · <Link href="/finance" className="underline-offset-2 hover:underline">same as Home</Link>
              </p>
            </div>
          )}
        </div>
        {anyError && <p className="mt-3 text-label text-warning">* Excludes holdings that didn&apos;t load — see the tabs marked below.</p>}
        {points.length > 1 && ownerFilter === 'All' && (
          <ChartFigure summary={`Household net worth from ${formatMoney(points[0].net_worth, { mode: 'compact' })} to ${formatMoney(points[points.length - 1].net_worth, { mode: 'compact' })}`} className="mt-4">
            <div className="h-16 sm:h-20">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="netWorthGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--positive))" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="hsl(var(--positive))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" hide />
                <YAxis hide domain={['dataMin', 'dataMax']} />
                <Tooltip {...chartTooltipProps} formatter={v => [moneyTooltipFormatter(v), 'Net worth']} labelFormatter={l => formatDateShort(String(l), { withYear: true })} />
                <Area type="monotone" dataKey="net_worth" stroke="hsl(var(--positive))" strokeWidth={1.5} fill="url(#netWorthGrad)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
            </div>
          </ChartFigure>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {allocation.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader title="Allocation" />
            <ChartFigure
              summary={`Allocation: ${allocation.map(a => `${a.name} ${formatPct(a.pct)}`).join(', ')}`}
              className="mx-auto w-44 sm:w-52"
            >
              <div className="h-44 w-44 sm:h-52 sm:w-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={allocation} cx="50%" cy="50%" innerRadius="68%" outerRadius="100%" paddingAngle={2} dataKey="value" strokeWidth={0} isAnimationActive={false}>
                    {allocation.map(a => <Cell key={a.name} fill={ASSET_COLOR[a.name]} />)}
                  </Pie>
                  <Tooltip {...chartTooltipProps} formatter={(v, n) => [moneyTooltipFormatter(v), String(n)]} />
                </PieChart>
              </ResponsiveContainer>
              </div>
            </ChartFigure>
            <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5">
              {allocation.map(a => (
                <li key={a.name} className="flex items-center gap-2 text-label">
                  <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ASSET_COLOR[a.name] }} />
                  <span className="text-fg-secondary">{a.name}</span>
                  <span className="tabular-nums ml-auto font-medium text-fg">{formatPct(a.pct)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <div className={cn('grid grid-cols-2 gap-3', allocation.length > 0 ? 'lg:col-span-3' : 'lg:col-span-5')}>
          {classes.map((c, i) => {
            const failed = Boolean(errors[c.source])
            return (
              <button
                key={c.name}
                type="button"
                onClick={() => onOpenTab(c.tab)}
                className={cn('min-w-0 text-left', i === classes.length - 1 && classes.length % 2 === 1 && 'col-span-2 sm:col-span-1')}
                aria-label={`${c.name}: ${failed ? 'not loaded' : formatMoney(c.value)}. Open ${c.name}`}
              >
                <Card interactive className="h-full">
                  <div className="flex items-center gap-2">
                    <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${ASSET_COLOR[c.name]} 16%, transparent)`, color: ASSET_COLOR[c.name] }}>
                      <c.icon className="h-4 w-4" />
                    </span>
                    <span className="text-label font-medium text-fg-secondary">{c.name}</span>
                  </div>
                  <p className="mt-2 text-lg font-semibold sm:text-xl">
                    {failed ? <span className="text-fg-tertiary">{EMPTY_VALUE}</span> : <MoneyText value={c.value} />}
                  </p>
                  <p className="mt-0.5 text-label text-fg-tertiary">
                    {failed ? <span className="text-warning">Didn&apos;t load · tap to retry</span>
                      : c.locked ? <span className="inline-flex items-center gap-1"><Landmark aria-hidden className="h-3 w-3" />Locked until 65</span>
                      : `${c.count} ${c.count === 1 ? c.noun : c.noun === 'property' ? 'properties' : `${c.noun}s`}${c.note ? ` · ${c.note}` : ''}`}
                  </p>
                  {!failed && !c.locked && ownerFilter === 'All' && c.split && (c.split.a > 0 || c.split.b > 0) && (
                    <OwnerBar bernardo={c.split.a} laura={c.split.b} className="mt-2" />
                  )}
                </Card>
              </button>
            )
          })}
        </div>
      </div>

      <WestProjectionWithScenarios />
      {baby && <FamilyFutureStrip baby={baby} />}
    </div>
  )
}
