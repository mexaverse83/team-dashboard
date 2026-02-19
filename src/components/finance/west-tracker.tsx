'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { GlassCard } from '@/components/ui/glass-card'
import { Check } from 'lucide-react'
import Link from 'next/link'
import {
  ResponsiveContainer, AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts'

function cn(...c: (string | false | null | undefined)[]) { return c.filter(Boolean).join(' ') }
function fmt(n: number, d = 0) { return new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n) }
function fmtMXN(n: number) { return `$${fmt(n)} MXN` }
function fmtShort(n: number) { return `$${(n / 1e6).toFixed(1)}M` }

interface WestData {
  target: number
  delivery_date: string
  months_to_delivery: number
  current_status: {
    amount_paid: number
    pct_paid: number
    investment_value: number
    crypto_value: number
    infonavit_laura: number
    total_available: number
    gap: number
  }
  projected_at_delivery: {
    total_paid: number
    investment_value: number
    crypto_value: number
    infonavit_laura: number
    total_projected: number
    gap: number
    gap_pct: number
    financing_needed: number
    sub_million_gap: boolean
  } | null
  monthly_projection: Array<{
    month: string; paid: number; investments: number; crypto: number; infonavit: number; total: number; gap: number; property_value: number
  }>
  milestones: Array<{ date: string; label: string; status: string }>
  property: {
    purchase_price: number; current_market_value: number; appreciation_rate: number
    projected_value_at_delivery: number; equity_at_delivery: number
  }
  assumptions: { investment_return: number; appreciation_rate: number; debt_payoff_total: number }
}

// ─── Legend Item ───
function LegendItem({ color, label, value, striped, border }: {
  color: string; label: string; value?: string; striped?: boolean; border?: boolean
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={cn("h-2.5 w-2.5 rounded-sm shrink-0", color, border && "border border-[hsl(var(--border))]")}
        style={striped ? { backgroundImage: 'repeating-linear-gradient(135deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)' } : undefined} />
      <span className="text-xs text-[hsl(var(--text-secondary))]">{label}</span>
      {value && <span className="text-xs font-semibold tabular-nums">{value}</span>}
    </div>
  )
}

// ─── Status Pill ───
function StatusPill({ status }: { status: string }) {
  const config: Record<string, { label: string; cls: string }> = {
    on_track: { label: 'On track', cls: 'bg-emerald-500/10 text-emerald-400' },
    growing: { label: 'Growing', cls: 'bg-blue-500/10 text-blue-400' },
    static: { label: 'Static', cls: 'bg-amber-500/10 text-amber-400' },
    not_set: { label: 'Not set', cls: 'bg-[hsl(var(--accent))] text-[hsl(var(--text-secondary))]' },
    gap: { label: 'Needs plan', cls: 'bg-red-500/10 text-red-400' },
  }
  const c = config[status] || config.not_set
  return <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", c.cls)}>{c.label}</span>
}

// ─── Client-side projection recalculation ───
function recalcProjection(data: WestData, rate: number, appreciationPct: number, cryptoGrowthPct: number) {
  const monthlyRate = Math.pow(1 + rate / 100, 1 / 12) - 1
  const monthlyAppreciation = Math.pow(1 + appreciationPct / 100, 1 / 12) - 1
  const monthlyCryptoGrowth = Math.pow(1 + cryptoGrowthPct / 100, 1 / 12) - 1
  const saleDate = '2026-04'
  const lumpDate = '2026-12'
  const paymentEnd = '2027-03'

  let paid = data.current_status.amount_paid
  let inv = data.current_status.investment_value
  let crypto = data.current_status.crypto_value
  const infonavit = data.current_status.infonavit_laura || 350000 // Laura's Infonavit — fixed, no compounding
  const debtPayoff = data.assumptions.debt_payoff_total
  const saleRemaining = 7200000 - 750000
  let propVal = data.property?.current_market_value || data.target

  const months: Array<{ month: string; paid: number; investments: number; crypto: number; infonavit: number; total: number; gap: number; property_value: number }> = []

  for (const mp of data.monthly_projection) {
    const isFirst = mp.month === data.monthly_projection[0].month

    if (!isFirst) {
      if (mp.month <= paymentEnd) paid += 10000
      if (mp.month === lumpDate) paid += 100000
      if (mp.month === saleDate) inv += Math.max(0, saleRemaining - debtPayoff)
      inv *= (1 + monthlyRate)
      crypto *= (1 + monthlyCryptoGrowth)
      propVal *= (1 + monthlyAppreciation)
    }

    const total = paid + inv + crypto + infonavit
    months.push({
      month: mp.month,
      paid: Math.round(paid),
      investments: Math.round(inv),
      crypto: Math.round(crypto),
      infonavit: Math.round(infonavit),
      total: Math.round(total),
      gap: Math.round(data.target - total),
      property_value: Math.round(propVal),
    })
  }

  const last = months[months.length - 1]
  return {
    months,
    projectedTotal: last?.total || 0,
    gap: last?.gap || 0,
    projectedPropertyValue: last?.property_value || propVal,
    equityAtDelivery: (last?.property_value || propVal) - data.target,
  }
}

// ═══════════════════════════════════════════
// FULL WEST TRACKER (Portfolio tab)
// ═══════════════════════════════════════════
export function WestTracker() {
  const [data, setData] = useState<WestData | null>(null)
  const [loading, setLoading] = useState(true)
  const [returnRate, setReturnRate] = useState(9.5) // net after 1.25% commission
  const [appreciationRate, setAppreciationRate] = useState(12.5)
  const [cryptoGrowth, setCryptoGrowth] = useState(15)

  useEffect(() => {
    fetch('/api/finance/investments/west-projection')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        setData(d)
        if (d?.assumptions?.investment_return) setReturnRate(d.assumptions.investment_return * 100)
        if (d?.assumptions?.appreciation_rate) setAppreciationRate(d.assumptions.appreciation_rate * 100)
        if (d?.assumptions?.crypto_growth) setCryptoGrowth(d.assumptions.crypto_growth * 100)
      })
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [])

  // Client-side recalc when sliders move
  const projection = useMemo(() => {
    if (!data) return null
    return recalcProjection(data, returnRate, appreciationRate, cryptoGrowth)
  }, [data, returnRate, appreciationRate, cryptoGrowth])

  if (loading) {
    return <div className="h-64 rounded-xl bg-[hsl(var(--accent))] animate-pulse" />
  }
  if (!data || !projection) return null

  const target = data.target
  const amountPaid = data.current_status.amount_paid
  const investmentValue = data.current_status.investment_value
  const cryptoValue = data.current_status.crypto_value
  const projectedTotal = projection.projectedTotal
  const gap = Math.max(0, projection.gap)
  const subMillionGap = gap > 0 && gap < 1_000_000
  const projectedGrowth = Math.max(0, projectedTotal - amountPaid - investmentValue - cryptoValue - (data.current_status.infonavit_laura || 350000))

  const paidPct = (amountPaid / target) * 100
  const investmentPct = (investmentValue / target) * 100
  const growthPct = Math.min((projectedGrowth / target) * 100, 100 - paidPct - investmentPct)
  const fundedPct = (projectedTotal / target) * 100
  const gapPct = gap > 0 ? (gap / target) * 100 : 0

  const deliveryDate = new Date(data.delivery_date)
  const now = new Date()
  const totalDays = Math.max(0, Math.ceil((deliveryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
  const monthsRemaining = data.months_to_delivery
  const daysRemaining = totalDays % 30

  // Funding sources
  const lastProj = projection.months[projection.months.length - 1]
  const infonavitValue = data.current_status.infonavit_laura || 350000
  const fundingSources = [
    { name: 'Direct Payments', current: amountPaid, atDelivery: lastProj?.paid || 0, dotColor: 'bg-emerald-500', status: 'on_track', owner: 'Bernardo' },
    { name: 'GBM Investment', current: investmentValue, atDelivery: lastProj?.investments || 0, dotColor: 'bg-blue-500', status: 'growing', owner: 'Bernardo' },
    { name: 'Crypto', current: cryptoValue, atDelivery: lastProj?.crypto || 0, dotColor: 'bg-amber-500', status: cryptoValue > 0 ? 'growing' : 'not_set', owner: 'Bernardo' },
    { name: "Laura's Infonavit", current: infonavitValue, atDelivery: infonavitValue, dotColor: 'bg-pink-500', status: 'on_track', owner: 'Laura' },
  ]

  return (
    <div className="space-y-4">
      {/* ── HERO ── */}
      <GlassCard className="p-5 sm:p-8 relative overflow-hidden">
        <div className={cn("absolute -top-24 -right-24 w-48 h-48 rounded-full blur-3xl", gapPct < 20 ? "bg-emerald-500/5" : "bg-amber-500/5")} />
        <div className="relative">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-xl">🏗️</div>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight">WEST Apartment</h2>
                <p className="text-sm text-[hsl(var(--text-secondary))]">
                  Target: <span className="font-semibold text-[hsl(var(--foreground))]">{fmtMXN(target)}</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 sm:gap-6">
              <div className="text-center">
                <p className="text-2xl sm:text-3xl font-bold tabular-nums">{monthsRemaining}</p>
                <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--text-secondary))]">Months</p>
              </div>
              <div className="h-8 w-px bg-[hsl(var(--border))]" />
              <div className="text-center">
                <p className="text-2xl sm:text-3xl font-bold tabular-nums">{daysRemaining}</p>
                <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--text-secondary))]">Days</p>
              </div>
              <div className="h-8 w-px bg-[hsl(var(--border))]" />
              <div className="text-center">
                <p className="text-2xl sm:text-3xl font-bold tabular-nums text-emerald-400">{fundedPct.toFixed(1)}%</p>
                <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--text-secondary))]">Funded</p>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-2">
            <div className="flex h-4 sm:h-5 w-full rounded-full overflow-hidden bg-[hsl(var(--bg-elevated))]">
              <div className="h-full bg-emerald-500 transition-all duration-700" style={{ width: `${paidPct}%` }} title={`Paid: ${fmtMXN(amountPaid)}`} />
              <div className="h-full bg-blue-500 transition-all duration-700" style={{ width: `${investmentPct}%` }} title={`Investments: ${fmtMXN(investmentValue)}`} />
              <div className="h-full bg-amber-500/60 transition-all duration-700"
                style={{ width: `${growthPct}%`, backgroundImage: 'repeating-linear-gradient(135deg, transparent, transparent 3px, rgba(0,0,0,0.1) 3px, rgba(0,0,0,0.1) 6px)' }}
                title={`Projected Growth: ${fmtMXN(projectedGrowth)}`} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <LegendItem color="bg-emerald-500" label="Paid" value={fmtMXN(amountPaid)} />
              <LegendItem color="bg-blue-500" label="Investments" value={fmtMXN(investmentValue)} />
              <LegendItem color="bg-amber-500/60" label="Projected Growth" value={fmtMXN(projectedGrowth)} striped />
              <LegendItem color="bg-[hsl(var(--bg-elevated))]" label="Gap" value={fmtMXN(gap)} border />
            </div>
          </div>
        </div>
      </GlassCard>

      {/* ── SUB-$1M GAP CALLOUT ── */}
      {subMillionGap && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
          <span className="text-2xl">🎯</span>
          <div>
            <p className="text-sm font-bold text-emerald-400">Gap is under $1M!</p>
            <p className="text-xs text-[hsl(var(--text-secondary))] mt-0.5">
              Only <span className="font-semibold text-emerald-400">{fmtMXN(gap)}</span> remaining — within mortgage financing range.
            </p>
          </div>
        </div>
      )}

      {/* ── FUNDING SOURCES ── */}
      <GlassCard className="p-4 sm:p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-4">Funding Sources</h3>

        {/* Desktop */}
        <div className="hidden sm:block">
          <div className="grid grid-cols-12 gap-3 text-xs font-medium text-[hsl(var(--text-secondary))] uppercase tracking-wider pb-2 border-b border-[hsl(var(--border))]">
            <div className="col-span-4">Source</div>
            <div className="col-span-2 text-right">Current</div>
            <div className="col-span-3 text-right">At Delivery</div>
            <div className="col-span-1 text-center">Owner</div>
            <div className="col-span-2 text-center">Status</div>
          </div>
          {fundingSources.map(src => (
            <div key={src.name} className="grid grid-cols-12 gap-3 py-3 items-center text-sm border-b border-[hsl(var(--border))] last:border-0">
              <div className="col-span-4 flex items-center gap-2">
                <div className={cn("h-2 w-2 rounded-full shrink-0", src.dotColor)} />
                <span className="font-medium">{src.name}</span>
              </div>
              <div className="col-span-2 text-right tabular-nums">{fmtMXN(src.current)}</div>
              <div className="col-span-3 text-right tabular-nums font-semibold">{fmtMXN(src.atDelivery)}</div>
              <div className="col-span-1 text-center">
                {src.owner === 'shared' ? (
                  <span className="flex items-center justify-center gap-0.5">
                    <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" title="Bernardo" />
                    <span className="h-2 w-2 rounded-full bg-pink-500 shrink-0" title="Laura" />
                  </span>
                ) : (
                  <span className={cn("text-[10px] font-medium capitalize", src.owner === 'laura' ? 'text-pink-400' : 'text-blue-400')}>{src.owner}</span>
                )}
              </div>
              <div className="col-span-2 text-center"><StatusPill status={src.status} /></div>
            </div>
          ))}
          <div className="grid grid-cols-12 gap-3 py-3 items-center text-sm font-bold bg-[hsl(var(--bg-elevated))]/50 rounded-lg px-2 mt-1">
            <div className="col-span-4">Total Projected</div>
            <div className="col-span-2 text-right tabular-nums">{fmtMXN(amountPaid + investmentValue + cryptoValue + infonavitValue)}</div>
            <div className="col-span-3 text-right tabular-nums text-emerald-400">{fmtMXN(projectedTotal)}</div>
            <div className="col-span-3" />
          </div>
          {gap > 0 && (
            <div className="grid grid-cols-12 gap-3 py-3 items-center text-sm font-bold px-2">
              <div className={cn("col-span-4", subMillionGap ? "text-emerald-400" : "text-red-400")}>
                Gap (Financing Needed) {subMillionGap && '🎯'}
              </div>
              <div className="col-span-2" />
              <div className={cn("col-span-3 text-right tabular-nums", subMillionGap ? "text-emerald-400" : "text-red-400")}>{fmtMXN(gap)}</div>
              <div className="col-span-3 text-center"><StatusPill status={subMillionGap ? 'on_track' : 'gap'} /></div>
            </div>
          )}
        </div>

        {/* Mobile */}
        <div className="sm:hidden space-y-2">
          {fundingSources.map(src => (
            <div key={src.name} className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--bg-elevated))]/30 border border-[hsl(var(--border))]">
              <div className="flex items-center gap-2">
                <div className={cn("h-2 w-2 rounded-full shrink-0", src.dotColor)} />
                <div>
                  <p className="text-sm font-medium">{src.name}</p>
                  <p className="text-xs text-[hsl(var(--text-secondary))] tabular-nums">Now: {fmtMXN(src.current)}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold tabular-nums">{fmtMXN(src.atDelivery)}</p>
                <StatusPill status={src.status} />
              </div>
            </div>
          ))}
          {gap > 0 && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-red-500/5 border border-red-500/20">
              <span className="text-sm font-bold text-red-400">Gap</span>
              <span className="text-sm font-bold tabular-nums text-red-400">{fmtMXN(gap)}</span>
            </div>
          )}
        </div>
      </GlassCard>

      {/* ── PROJECTION CHART ── */}
      <GlassCard className="p-4 sm:p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-4">Projection</h3>
        <div className="h-56 sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={projection.months}>
              <defs>
                <linearGradient id="westPaidGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10B981" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#10B981" stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="westInvestGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="westCryptoGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#F59E0B" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 14%)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(222, 15%, 55%)' }} tickFormatter={m => m.slice(5)} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(222, 15%, 55%)' }} tickFormatter={v => `$${(Number(v) / 1e6).toFixed(1)}M`} />
              <Tooltip
                contentStyle={{ background: 'hsl(222, 47%, 6%)', border: '1px solid hsl(222, 20%, 18%)', borderRadius: '8px', fontSize: '12px' }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(val: any, name: any) => [fmtMXN(Number(val) || 0), String(name)]}
                labelFormatter={m => `Month: ${m}`}
              />
              <Area type="monotone" dataKey="paid" stackId="1" stroke="#10B981" strokeWidth={1.5} fill="url(#westPaidGrad)" name="Paid" />
              <Area type="monotone" dataKey="investments" stackId="1" stroke="#3B82F6" strokeWidth={1.5} fill="url(#westInvestGrad)" name="Investments" />
              <Area type="monotone" dataKey="crypto" stackId="1" stroke="#F59E0B" strokeWidth={1} fill="url(#westCryptoGrad)" name="Crypto" />
              <Line type="monotone" dataKey="property_value" stroke="#10B981" strokeDasharray="6 4" strokeWidth={1.5} dot={false} name="Property Value" />
              <ReferenceLine y={target} stroke="#EF4444" strokeDasharray="6 4" strokeWidth={1.5}
                label={{ value: 'Target $11.2M', position: 'right', fill: '#EF4444', fontSize: 11, fontWeight: 600 }} />
              <ReferenceLine x="2026-04" stroke="hsl(222, 15%, 35%)" strokeDasharray="3 3"
                label={{ value: '📍 Apt. sale', position: 'top', fill: 'hsl(222, 15%, 55%)', fontSize: 10 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
          <LegendItem color="bg-emerald-500" label="Direct Payments" />
          <LegendItem color="bg-blue-500" label="Investments (GBM)" />
          <LegendItem color="bg-amber-500" label="Crypto" />
          <div className="flex items-center gap-1.5">
            <div className="h-0.5 w-4 border-t-2 border-dashed border-emerald-500" />
            <span className="text-xs text-[hsl(var(--text-secondary))]">Property Value</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-0.5 w-4 border-t-2 border-dashed border-red-500" />
            <span className="text-xs text-[hsl(var(--text-secondary))]">Target</span>
          </div>
        </div>
      </GlassCard>

      {/* ── SCENARIO SLIDER ── */}
      <GlassCard className="p-4 sm:p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-4">Scenarios</h3>
        <div className="flex gap-2 mb-4">
          {[
            { label: 'Conservative', rate: 8.0 },
            { label: 'Base', rate: 9.5 },
            { label: 'Optimistic', rate: 11.0 },
          ].map(preset => (
            <button key={preset.label} onClick={() => setReturnRate(preset.rate)}
              className={cn(
                "flex-1 py-2 rounded-lg text-xs font-medium transition-all border",
                Math.abs(returnRate - preset.rate) < 0.1
                  ? "border-blue-500 bg-blue-500/10 text-blue-400"
                  : "border-[hsl(var(--border))] text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--foreground))]"
              )}>
              {preset.label} ({preset.rate}%)
            </button>
          ))}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-[hsl(var(--text-secondary))]">Annual Net Return Rate (after commission)</label>
            <span className="text-sm font-bold tabular-nums">{returnRate.toFixed(1)}%</span>
          </div>
          <input type="range" min={5} max={13} step={0.1} value={returnRate}
            onChange={e => setReturnRate(parseFloat(e.target.value))}
            className="w-full h-2 rounded-full appearance-none cursor-pointer bg-[hsl(var(--bg-elevated))]
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5
              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:shadow-lg
              [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing" />
          <div className="flex justify-between text-[10px] text-[hsl(var(--text-tertiary))]">
            <span>5%</span>
            <span className="text-center">Based on 2023–25 avg ~10.3% gross − 1.25% commission</span>
            <span>13%</span>
          </div>
        </div>

        {/* Crypto growth slider */}
        <div className="space-y-2 mt-4 pt-4 border-t border-[hsl(var(--border))]">
          <div className="flex items-center justify-between">
            <label className="text-xs text-[hsl(var(--text-secondary))]">Crypto Annual Growth</label>
            <span className="text-sm font-bold tabular-nums text-amber-400">{cryptoGrowth.toFixed(0)}%</span>
          </div>
          <div className="flex gap-2 mb-2">
            {[
              { label: 'Bear', rate: 0 },
              { label: 'Moderate', rate: 15 },
              { label: 'Bull', rate: 40 },
            ].map(preset => (
              <button key={preset.label} onClick={() => setCryptoGrowth(preset.rate)}
                className={cn(
                  "flex-1 py-1.5 rounded-lg text-[10px] font-medium transition-all border",
                  Math.abs(cryptoGrowth - preset.rate) < 1
                    ? "border-amber-500 bg-amber-500/10 text-amber-400"
                    : "border-[hsl(var(--border))] text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--foreground))]"
                )}>
                {preset.label} ({preset.rate}%)
              </button>
            ))}
          </div>
          <input type="range" min={-20} max={60} step={1} value={cryptoGrowth}
            onChange={e => setCryptoGrowth(parseFloat(e.target.value))}
            className="w-full h-2 rounded-full appearance-none cursor-pointer bg-[hsl(var(--bg-elevated))]
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5
              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-500 [&::-webkit-slider-thumb]:shadow-lg
              [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing" />
          <div className="flex justify-between text-[10px] text-[hsl(var(--text-tertiary))]">
            <span>-20%</span><span>60%</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-4 p-3 rounded-lg bg-[hsl(var(--bg-elevated))]/50">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-[hsl(var(--text-secondary))]">Projected Total</span>
            <p className="text-lg font-bold tabular-nums text-emerald-400">{fmtMXN(projectedTotal)}</p>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-[hsl(var(--text-secondary))]">Gap</span>
            <p className={cn("text-lg font-bold tabular-nums", gap > 0 ? "text-red-400" : "text-emerald-400")}>
              {gap > 0 ? fmtMXN(gap) : '✅ Fully funded!'}
            </p>
          </div>
        </div>
      </GlassCard>

      {/* ── MILESTONES ── */}
      <GlassCard className="p-4 sm:p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-4">Milestones</h3>
        <div className="relative pl-7 space-y-5">
          <div className="absolute left-3 top-1 bottom-1 w-px bg-[hsl(var(--border))]" />
          {data.milestones.map((ms, i) => {
            const isDone = ms.status === 'done'
            const isCurrent = i === data.milestones.findIndex(m => m.status !== 'done')
            const isTarget = ms.status === 'target'
            return (
              <div key={i} className="relative">
                <div className={cn(
                  "absolute -left-7 top-0.5 w-[14px] h-[14px] rounded-full border-2 flex items-center justify-center",
                  isDone ? "bg-emerald-500 border-emerald-500"
                    : isCurrent && !isDone ? "bg-blue-500 border-blue-500 animate-pulse"
                    : isTarget ? "bg-violet-500 border-violet-500"
                    : "bg-[hsl(var(--background))] border-[hsl(var(--border))]"
                )}>
                  {isDone && <Check className="h-2.5 w-2.5 text-white" />}
                  {isTarget && <span className="text-[8px] text-white">🎯</span>}
                </div>
                <div>
                  <span className="text-xs font-semibold text-[hsl(var(--text-secondary))]">{ms.date}</span>
                  <p className="text-sm font-medium mt-0.5">{ms.label}</p>
                </div>
              </div>
            )
          })}

          {/* Post-delivery: Nexaminds exit — speculative, dashed dot */}
          {(() => {
            // Dynamic: 20000 shares × $10 target × live FX (approximated at 17.13)
            const nexamindsAtTarget = 20000 * 10 * 17.13
            return (
              <div className="relative opacity-70">
                <div className="absolute -left-7 top-0.5 w-[14px] h-[14px] rounded-full border-2 border-dashed border-[hsl(var(--text-tertiary))] bg-[hsl(var(--background))] flex items-center justify-center">
                  <span className="text-[8px]">🔮</span>
                </div>
                <div>
                  <span className="text-xs font-semibold text-[hsl(var(--text-secondary))]">2028–2029</span>
                  {' '}
                  <span className="text-xs font-medium tabular-nums text-amber-400">Est. {fmtMXN(nexamindsAtTarget)}</span>
                  <p className="text-sm font-medium mt-0.5">Nexaminds Exit Event</p>
                  <p className="text-xs text-[hsl(var(--text-secondary))] mt-0.5 leading-relaxed">
                    At $10/share target. Could eliminate WEST bridge financing within 12–24 months of delivery.
                  </p>
                </div>
              </div>
            )
          })()}
        </div>
      </GlassCard>

      {/* ── EQUITY OUTLOOK ── */}
      {data.property && (
        <GlassCard className="p-4 sm:p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-4">Equity Outlook</h3>

          {/* Value progression */}
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <div className="text-center px-3 py-2 rounded-lg bg-[hsl(var(--bg-elevated))]/50">
              <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--text-secondary))]">Purchase</p>
              <p className="text-sm font-bold tabular-nums">{fmtShort(data.property.purchase_price)}</p>
            </div>
            <span className="text-[hsl(var(--text-tertiary))]">→</span>
            <div className="text-center px-3 py-2 rounded-lg bg-[hsl(var(--bg-elevated))]/50">
              <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--text-secondary))]">Current</p>
              <p className="text-sm font-bold tabular-nums">{fmtShort(data.property.current_market_value)}</p>
              <p className="text-[10px] text-emerald-400">+{(((data.property.current_market_value - data.property.purchase_price) / data.property.purchase_price) * 100).toFixed(1)}%</p>
            </div>
            <span className="text-[hsl(var(--text-tertiary))]">→</span>
            <div className="text-center px-4 py-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <p className="text-[10px] uppercase tracking-wider text-emerald-400">Projected</p>
              <p className="text-lg font-bold tabular-nums text-emerald-400">{fmtShort(projection.projectedPropertyValue)}</p>
            </div>
          </div>

          {/* Equity hero */}
          <div className="p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/20 mb-4">
            <p className="text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-1">Equity at Delivery</p>
            <p className="text-2xl sm:text-3xl font-bold text-emerald-400 tabular-nums">
              {fmtMXN(projection.equityAtDelivery)}
            </p>
            <p className="text-xs text-[hsl(var(--text-secondary))] mt-1">
              Even with a {fmtMXN(gap)} financing gap, you&apos;re walking into {fmtShort(projection.equityAtDelivery)}+ equity on day one.
            </p>
          </div>

          {/* Appreciation slider */}
          <div className="space-y-3">
            <div className="flex gap-2">
              {[
                { label: 'Conservative', rate: 10 },
                { label: 'Base', rate: 12.5 },
                { label: 'Optimistic', rate: 15 },
              ].map(preset => (
                <button key={preset.label} onClick={() => setAppreciationRate(preset.rate)}
                  className={cn(
                    "flex-1 py-2 rounded-lg text-xs font-medium transition-all border",
                    Math.abs(appreciationRate - preset.rate) < 0.1
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                      : "border-[hsl(var(--border))] text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--foreground))]"
                  )}>
                  {preset.label} ({preset.rate}%)
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <label className="text-xs text-[hsl(var(--text-secondary))]">Annual Appreciation</label>
              <span className="text-sm font-bold tabular-nums">{appreciationRate.toFixed(1)}%</span>
            </div>
            <input type="range" min={5} max={20} step={0.5} value={appreciationRate}
              onChange={e => setAppreciationRate(parseFloat(e.target.value))}
              className="w-full h-2 rounded-full appearance-none cursor-pointer bg-[hsl(var(--bg-elevated))]
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-500 [&::-webkit-slider-thumb]:shadow-lg
                [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing" />
            <div className="flex justify-between text-[10px] text-[hsl(var(--text-tertiary))]">
              <span>5%</span><span>20%</span>
            </div>
          </div>
        </GlassCard>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════
// COMPACT WEST WIDGET (Finance Overview)
// ═══════════════════════════════════════════
// ─── Standalone projection chart — used in Portfolio tab ───────────────────
export function WestProjectionChart() {
  const [data, setData] = useState<WestData | null>(null)
  const [returnRate, setReturnRate] = useState(9.5)
  const [cryptoGrowth, setCryptoGrowth] = useState(15)

  useEffect(() => {
    fetch('/api/finance/investments/west-projection')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        setData(d)
        if (d?.assumptions?.investment_return) setReturnRate(d.assumptions.investment_return * 100)
        if (d?.assumptions?.crypto_growth) setCryptoGrowth(d.assumptions.crypto_growth * 100)
      })
      .catch(() => null)
  }, [])

  const projection = useMemo(() => {
    if (!data) return null
    return recalcProjection(data, returnRate, 12.5, cryptoGrowth)
  }, [data, returnRate, cryptoGrowth])

  if (!data || !projection) return null

  const target = data.target

  return (
    <GlassCard className="p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--text-secondary))]">WEST Projection</h3>
          <p className="text-xs text-[hsl(var(--text-tertiary))] mt-0.5">Monthly growth toward $11.2M target · {data.months_to_delivery}mo to delivery</p>
        </div>
        <Link href="/finance/investments?tab=Real%20Estate" className="text-xs text-blue-400 hover:underline">Full tracker →</Link>
      </div>
      <div className="h-56 sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={projection.months}>
            <defs>
              <linearGradient id="pcPaidGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10B981" stopOpacity={0.4} /><stop offset="100%" stopColor="#10B981" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="pcInvestGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.4} /><stop offset="100%" stopColor="#3B82F6" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="pcCryptoGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.3} /><stop offset="100%" stopColor="#F59E0B" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 14%)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(222, 15%, 55%)' }} tickFormatter={(m: string) => m.slice(5)} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: 'hsl(222, 15%, 55%)' }} tickFormatter={(v: number) => `$${(v / 1e6).toFixed(1)}M`} />
            <Tooltip
              contentStyle={{ background: 'hsl(222, 47%, 6%)', border: '1px solid hsl(222, 20%, 18%)', borderRadius: '8px', fontSize: '12px' }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(val: any, name: any) => [fmtMXN(Number(val) || 0), String(name)]}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              labelFormatter={(m: any) => `Month: ${m}`}
            />
            <Area type="monotone" dataKey="paid" stackId="1" stroke="#10B981" strokeWidth={1.5} fill="url(#pcPaidGrad)" name="Direct Payments" />
            <Area type="monotone" dataKey="investments" stackId="1" stroke="#3B82F6" strokeWidth={1.5} fill="url(#pcInvestGrad)" name="Investments (GBM)" />
            <Area type="monotone" dataKey="crypto" stackId="1" stroke="#F59E0B" strokeWidth={1} fill="url(#pcCryptoGrad)" name="Crypto" />
            <Line type="monotone" dataKey="property_value" stroke="#10B981" strokeDasharray="6 4" strokeWidth={1.5} dot={false} name="Property Value" />
            <ReferenceLine y={target} stroke="#EF4444" strokeDasharray="6 4" strokeWidth={1.5}
              label={{ value: 'Target $11.2M', position: 'right', fill: '#EF4444', fontSize: 11, fontWeight: 600 }} />
            <ReferenceLine x="2026-04" stroke="hsl(222, 15%, 35%)" strokeDasharray="3 3"
              label={{ value: '📍 Apt. sale', position: 'top', fill: 'hsl(222, 15%, 55%)', fontSize: 10 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
        <LegendItem color="bg-emerald-500" label="Direct Payments" />
        <LegendItem color="bg-blue-500" label="Investments (GBM)" />
        <LegendItem color="bg-amber-500" label="Crypto" />
        <div className="flex items-center gap-1.5">
          <div className="h-0.5 w-4 border-t-2 border-dashed border-emerald-500" />
          <span className="text-xs text-[hsl(var(--text-secondary))]">Property Value</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-0.5 w-4 border-t-2 border-dashed border-red-500" />
          <span className="text-xs text-[hsl(var(--text-secondary))]">Target</span>
        </div>
      </div>
    </GlassCard>
  )
}

export function WestCompactWidget() {
  const [data, setData] = useState<WestData | null>(null)

  useEffect(() => {
    fetch('/api/finance/investments/west-projection')
      .then(r => r.ok ? r.json() : null)
      .then(setData)
      .catch(() => null)
  }, [])

  if (!data || !data.projected_at_delivery) return null

  const target = data.target
  const proj = data.projected_at_delivery
  const paidPct = (data.current_status.amount_paid / target) * 100
  const investPct = (data.current_status.investment_value / target) * 100
  const growthPct = Math.max(0, ((proj.total_projected - data.current_status.total_available) / target) * 100)
  const fundedPct = (proj.total_projected / target) * 100
  const gap = Math.max(0, proj.gap)

  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">🏗️</span>
          <span className="text-sm font-semibold">WEST Apartment</span>
        </div>
        <Link href="/finance/investments" className="text-xs text-blue-400 hover:underline">Details →</Link>
      </div>
      <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-[hsl(var(--bg-elevated))]">
        <div className="h-full bg-emerald-500" style={{ width: `${paidPct}%` }} />
        <div className="h-full bg-blue-500" style={{ width: `${investPct}%` }} />
        <div className="h-full bg-amber-500/60" style={{ width: `${growthPct}%` }} />
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-[hsl(var(--text-secondary))]">
          Projected: <span className="font-semibold text-[hsl(var(--foreground))] tabular-nums">{fmtMXN(proj.total_projected)}</span>
          <span className="text-[hsl(var(--text-tertiary))]"> / {fmtMXN(target)}</span>
        </span>
        <span className="text-xs font-semibold tabular-nums text-emerald-400">{fundedPct.toFixed(0)}%</span>
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-xs text-red-400 tabular-nums">Gap: {fmtMXN(gap)}</span>
        <span className="text-xs text-[hsl(var(--text-secondary))]">{data.months_to_delivery}mo to delivery</span>
      </div>
      {data.property && (
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-emerald-400 tabular-nums">
            Est. value: {fmtMXN(data.property.projected_value_at_delivery)} (+{fmtMXN(data.property.equity_at_delivery)} equity)
          </span>
        </div>
      )}
    </GlassCard>
  )
}
