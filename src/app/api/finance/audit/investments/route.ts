import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'
import { canonicalOwner } from '@/lib/owners'
import { fetchCryptoPrices, impliedUsdMxn } from '@/lib/crypto-prices'
import { accruedValue } from '@/lib/fixed-income'
import { localDateKey } from '@/lib/dates'
import { ConfigError, configErrorResponse, getAdminClientInfo, withDegradedHeader } from '@/lib/supabase-admin'
import { propertyEquity, type PropertyLike, type WestPaidToDate } from '@/lib/property-equity'
import { getWestProjection } from '@/lib/server/west'
import { buildSummary } from '@/lib/server/summary'
import { formatMonthShort } from '@/lib/format'

// Used only when the live WEST projection can't be computed (no active target
// row, or the projection query failed); CH-06.
const WEST_FALLBACK = { target: 11_204_000, gapPct: 8.84, monthsToDelivery: 22 } as const
// Used only when no coin quote implies today's rate.
const FALLBACK_USD_MXN = Number(process.env.USD_MXN_FALLBACK) || 18.5

/** WEST inputs for the findings and the score, from the live projection. */
interface WestAudit {
  gap: number
  gap_pct: number
  months_to_delivery: number
  /** Saving at the real pace reaches the target (savings_plan.feasible); null = unknown. */
  feasible: boolean | null
  shortfall: number
  /** Month the purchase alone is funded at the real pace (behavioral run); null = not before delivery. */
  purchase_funded_month: string | null
  lump_sum_amount: number
  lump_sum_month: string | null
}

interface Finding {
  id: string
  severity: 'red' | 'amber' | 'green'
  category: 'crypto' | 'real_estate' | 'fixed_income' | 'retirement' | 'general'
  title: string
  detail: string
  suggestion: string
  action_url: string
}

// ─── Flag Rules ───
function runCryptoFlags(crypto: Record<string, unknown> | null, netWorth: number, findings: Finding[]) {
  if (!crypto) return
  const holdings = (crypto.holdings as Array<Record<string, unknown>>) || []
  const totalMXN = Number(crypto.total_value_mxn || 0)
  const totalCost = Number(crypto.total_cost_mxn || 0)
  const pnlPct = Number(crypto.pnl_pct || 0)

  // Concentration risk
  for (const h of holdings) {
    const pct = Number(h.allocation_pct || 0)
    if (pct > 70) {
      findings.push({
        id: `crypto-concentration-${h.symbol}`,
        severity: 'amber',
        category: 'crypto',
        title: `Crypto concentration: ${h.symbol} is ${pct.toFixed(0)}% of portfolio`,
        detail: `A single coin above 70% of crypto holdings amplifies volatility. ${h.symbol} is currently ${pct.toFixed(1)}% of the crypto portfolio.`,
        suggestion: 'Consider rebalancing across BTC, ETH, and SOL to reduce single-asset risk.',
        action_url: '/finance/investments?tab=Crypto',
      })
    }
  }

  // Large unrealized loss
  if (pnlPct < -25 && totalCost > 0) {
    findings.push({
      id: 'crypto-large-loss',
      severity: 'red',
      category: 'crypto',
      title: `Crypto portfolio down ${Math.abs(pnlPct).toFixed(1)}% from cost basis`,
      detail: `Unrealized loss of $${Math.abs(Number(crypto.pnl_mxn || 0)).toLocaleString()} MXN. Current value: $${totalMXN.toLocaleString()} MXN vs cost basis $${totalCost.toLocaleString()} MXN.`,
      suggestion: 'Review whether current allocation fits your risk tolerance. Consider DCA or holding strategy.',
      action_url: '/finance/investments?tab=Crypto',
    })
  }

  // Crypto as % of liquid net worth
  if (netWorth > 0) {
    const cryptoPct = (totalMXN / netWorth) * 100
    if (cryptoPct > 20) {
      findings.push({
        id: 'crypto-overweight',
        severity: 'amber',
        category: 'crypto',
        title: `Crypto is ${cryptoPct.toFixed(1)}% of total net worth`,
        detail: `With $${totalMXN.toLocaleString()} MXN in crypto against a total net worth of $${netWorth.toLocaleString()} MXN, crypto represents significant concentration risk.`,
        suggestion: 'Consider if this allocation is intentional given crypto volatility.',
        action_url: '/finance/investments?tab=Crypto',
      })
    }
  }
}

function runRealEstateFlags(reData: Array<Record<string, unknown>>, westData: WestAudit | null, findings: Finding[], now: Date) {
  const todayMs = now.getTime()

  for (const prop of reData) {
    // Stale valuation (>180 days)
    if (prop.last_valuation_date) {
      const valDate = new Date(prop.last_valuation_date as string)
      const daysSince = Math.floor((todayMs - valDate.getTime()) / (1000 * 60 * 60 * 24))
      if (daysSince > 180) {
        findings.push({
          id: `re-stale-valuation-${prop.id}`,
          severity: 'amber',
          category: 'real_estate',
          title: `${prop.name} valuation is ${Math.floor(daysSince / 30)} months old`,
          detail: `Last valuation date: ${prop.last_valuation_date}. Accurate valuation is needed for correct net worth reporting.`,
          suggestion: 'Update current market value based on recent comparable sales or agent estimate.',
          action_url: '/finance/investments?tab=Real Estate',
        })
      }
    }

    // Sale pending for >90 days
    if (prop.property_type === 'sale_pending' && prop.last_valuation_date) {
      // Use last_valuation_date as proxy for when sale was initiated
      const saleDate = new Date(prop.last_valuation_date as string)
      const daysPending = Math.floor((todayMs - saleDate.getTime()) / (1000 * 60 * 60 * 24))
      if (daysPending > 90) {
        findings.push({
          id: 're-sale-pending-long',
          severity: 'amber',
          category: 'real_estate',
          title: `Current apartment sale pending ${daysPending} days`,
          detail: `The apartment at sale price $${Number(prop.current_value || 0).toLocaleString()} MXN has been sale_pending for over 90 days.`,
          suggestion: 'Confirm closing status with notary. Ensure deposit and remaining balance are on schedule.',
          action_url: '/finance/investments?tab=Real Estate',
        })
      }
    }
  }

  // WEST verdict: the same feasibility the WEST tracker shows ("Needs
  // financing" vs on track), never a bare "gap under $1M".
  if (westData) {
    const { gap, gap_pct: gapPct, months_to_delivery: monthsToDelivery, feasible, shortfall } = westData
    const lump = westData.lump_sum_amount > 0 && westData.lump_sum_month && westData.lump_sum_month >= localDateKey(now).slice(0, 7)
      ? ` and the $${Math.round(westData.lump_sum_amount / 1000)}K ${formatMonthShort(westData.lump_sum_month, { withYear: true })} lump sum`
      : ''
    if (gapPct > 20 && monthsToDelivery <= 12) {
      findings.push({
        id: 'west-gap-urgent',
        severity: 'red',
        category: 'real_estate',
        title: `WEST gap $${Math.round(gap).toLocaleString()} MXN with ${monthsToDelivery} months to delivery`,
        detail: `${gapPct.toFixed(1)}% of target unfunded with less than 12 months remaining. Financing options may be needed.`,
        suggestion: 'Evaluate mortgage pre-approval for the remaining gap amount.',
        action_url: '/finance/investments?tab=Real Estate',
      })
    } else if (feasible === false) {
      findings.push({
        id: 'west-needs-financing',
        severity: 'amber',
        category: 'real_estate',
        title: `WEST + furnishing arrives $${Math.round(shortfall).toLocaleString()} short at your real saving pace`,
        detail: `${westData.purchase_funded_month ? `The purchase alone is funded by ${formatMonthShort(westData.purchase_funded_month, { withYear: true })}; the shortfall is the furnishing budget. ` : ''}${monthsToDelivery} months to delivery; with no extra saving, ${(100 - gapPct).toFixed(1)}% of the purchase is funded at delivery. The WEST tracker marks this as needing financing.`,
        suggestion: `Raise monthly WEST savings or line up financing for the shortfall; keep the scheduled payments${lump}.`,
        action_url: '/finance/investments?tab=Real Estate',
      })
    } else if (feasible === true) {
      findings.push({
        id: 'west-on-track',
        severity: 'green',
        category: 'real_estate',
        title: `WEST on track — ${(100 - gapPct).toFixed(1)}% projected at delivery`,
        detail: `At the real saving pace the plan reaches the target in ${monthsToDelivery} months.`,
        suggestion: `Keep the scheduled payments${lump}.`,
        action_url: '/finance/investments?tab=Real Estate',
      })
    }
  }
}

function runFixedIncomeFlags(fiData: Array<Record<string, unknown>>, findings: Finding[], now: Date) {
  const todayMs = now.getTime()
  const isTaxDeclarationWindow = now.getMonth() >= 1 && now.getMonth() <= 3 // Feb(1)–Apr(3)

  for (const inst of fiData) {
    // Maturing within 7 days
    if (inst.maturity_date) {
      const matDate = new Date(inst.maturity_date as string)
      const daysUntil = Math.floor((matDate.getTime() - todayMs) / (1000 * 60 * 60 * 24))
      if (daysUntil >= 0 && daysUntil <= 7) {
        findings.push({
          id: `fi-maturing-${inst.id}`,
          severity: 'amber',
          category: 'fixed_income',
          title: `${inst.name} matures in ${daysUntil} days`,
          detail: `$${Number(inst.principal || 0).toLocaleString()} MXN at ${((Number(inst.annual_rate || 0)) * 100).toFixed(2)}% matures on ${inst.maturity_date}. Renew or redeploy?`,
          suggestion: inst.auto_renew ? 'Auto-renew is enabled.' : 'Log in to renew or redirect funds.',
          action_url: '/finance/investments?tab=Fixed Income',
        })
      }
    }

    // GBM commission bracket opportunity
    if (inst.instrument_type === 'debt_fund' && inst.commission_rate) {
      const balance = Number(inst.principal || 0)
      const nextTierThreshold = 2500000
      const currentCommission = Number(inst.commission_rate || 0)

      if (balance < nextTierThreshold && balance >= nextTierThreshold * 0.95) {
        const deficit = nextTierThreshold - balance
        findings.push({
          id: 'gbm-commission-drop-approaching',
          severity: 'green',
          category: 'fixed_income',
          title: `GBM commission drops when balance reaches $${(nextTierThreshold / 1e6).toFixed(1)}M`,
          detail: `Only $${deficit.toLocaleString()} MXN away from the next fee tier. Commission drops from ${(currentCommission * 100).toFixed(2)}% → 0.82%, saving ~$${Math.round(balance * (currentCommission - 0.0082)).toLocaleString()}/yr.`,
          suggestion: `A $${deficit.toLocaleString()} deposit crosses the threshold.`,
          action_url: '/finance/investments?tab=Fixed Income',
        })
      }

      // The record still carries the old fee, and the WEST projection computes
      // with it — so this is a data fix to make, not a saving already banked.
      if (balance >= nextTierThreshold && currentCommission > 0.009) {
        const annualSavings = Math.round(balance * (currentCommission - 0.0082))
        findings.push({
          id: 'gbm-commission-record-stale',
          severity: 'amber',
          category: 'fixed_income',
          title: `GBM record still at ${(currentCommission * 100).toFixed(2)}% commission — balance qualifies for 0.82%`,
          detail: `Balance of $${balance.toLocaleString()} MXN is past the $2.5M tier, worth ~$${annualSavings.toLocaleString()}/yr. Projections (WEST, Real Estate) still compute with ${(currentCommission * 100).toFixed(2)}%.`,
          suggestion: 'Confirm the tier with GBM, then update the commission on the GBM record.',
          action_url: '/finance/investments?tab=Fixed Income',
        })
      }
    }
  }

  // GBM tax declaration reminder (Feb–Apr)
  const hasGBM = fiData.some(i => i.instrument_type === 'debt_fund')
  if (hasGBM && isTaxDeclarationWindow) {
    findings.push({
      id: 'gbm-tax-declaration',
      severity: 'amber',
      category: 'fixed_income',
      title: `GBM capital gains declaration window — April 30 deadline`,
      detail: 'GBM debt fund profits are subject to 10% capital gains tax. Must be declared in your annual tax return (declaración anual) by April 30.',
      suggestion: 'Gather GBM annual statement and declare with your accountant before April 30.',
      action_url: '/finance/investments?tab=Fixed Income',
    })
  }

  // GBM performance — green finding
  const gbm = fiData.find(i => i.instrument_type === 'debt_fund')
  if (gbm) {
    const netRate = Number(gbm.net_annual_rate || (Number(gbm.annual_rate) - Number(gbm.commission_rate || 0)))
    findings.push({
      id: 'gbm-performance',
      severity: 'green',
      category: 'fixed_income',
      title: `GBM growing at ${(netRate * 100).toFixed(1)}% net — above inflation`,
      detail: `$${Number(gbm.principal).toLocaleString()} MXN generating ${(netRate * 100).toFixed(2)}% net annual return. US Treasury bond fund, peso-hedged, no FX risk.`,
      suggestion: 'Continue holding.',
      action_url: '/finance/investments?tab=Fixed Income',
    })
  }
}

function runPrivateEquityFlags(stocks: Array<Record<string, unknown>>, findings: Finding[], now: Date) {
  const today = now
  for (const s of stocks) {
    if (s.asset_type !== 'private_equity') continue

    // Stale valuation (>180 days since updated_at)
    if (s.updated_at) {
      const updatedDate = new Date(s.updated_at as string)
      const daysSince = Math.floor((today.getTime() - updatedDate.getTime()) / (1000 * 60 * 60 * 24))
      if (daysSince > 180) {
        findings.push({
          id: `pe-stale-${s.ticker}`,
          severity: 'amber',
          category: 'general',
          title: `${s.ticker} equity valuation is ${Math.floor(daysSince / 30)} months old`,
          detail: `Last updated: ${(s.updated_at as string).slice(0, 10)}. Estimated price per share ($${s.current_price_usd}) may no longer reflect current company valuation.`,
          suggestion: 'Check with company for updated 409A valuation or estimated share price.',
          action_url: '/finance/investments?tab=Stocks',
        })
      }
    }

    // Exit window approaching — within 18 months
    if (s.expected_exit_end) {
      const exitEnd = new Date(s.expected_exit_end as string)
      const monthsToExit = Math.round((exitEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 30.4))
      if (monthsToExit <= 18 && monthsToExit > 0) {
        findings.push({
          id: `pe-exit-approaching-${s.ticker}`,
          severity: 'amber',
          category: 'general',
          title: `${s.name} exit window in ~${monthsToExit} months — prepare tax strategy`,
          detail: `Expected exit: ${s.expected_exit_start} – ${s.expected_exit_end}. Private company share sale is subject to ISR at marginal rate, not 10% flat.`,
          suggestion: 'Consult fiscal advisor on exit tax treatment before the event. Plan for ISR at marginal rate on capital gains.',
          action_url: '/finance/investments?tab=Stocks',
        })
      }
    }

    // Tax advisory flag — always show for private equity
    findings.push({
      id: 'pe-tax-advisory',
      severity: 'amber',
      category: 'general',
      title: 'Nexaminds exit: ISR at marginal rate, NOT 10% flat',
      detail: 'Private company (non-BMV) share sales are taxed at your marginal ISR rate. At $199,800 USD net gain, tax could be significant. The 10% preferential rate only applies to BMV-listed securities.',
      suggestion: 'Engage a fiscal advisor 12+ months before exit to structure the transaction optimally.',
      action_url: '/finance/investments?tab=Stocks',
    })
  }
}

function runRetirementFlags(retirementData: Array<Record<string, unknown>>, monthlyIncome: number, findings: Finding[], now: Date) {
  const todayMs = now.getTime()

  for (const r of retirementData) {
    if (r.instrument_type !== 'afore') continue

    // Stale balance (>90 days)
    if (r.last_updated) {
      const lastUpdate = new Date(r.last_updated as string)
      const daysSince = Math.floor((todayMs - lastUpdate.getTime()) / (1000 * 60 * 60 * 24))
      if (daysSince > 90) {
        findings.push({
          id: `afore-stale-${r.owner}`,
          severity: 'amber',
          category: 'retirement',
          title: `${canonicalOwner(r.owner as string)}'s AFORE balance is ${daysSince} days old`,
          detail: `Last updated: ${r.last_updated}. AFORE balances change monthly with employer contributions and returns.`,
          suggestion: 'Check afore.mx or your AFORE app for current balance.',
          action_url: '/finance/investments?tab=Retirement',
        })
      }
    }

    // Retirement projection vs 70% income replacement
    if (monthlyIncome > 0) {
      const annualIncome = monthlyIncome * 12
      const target70pct = annualIncome * 0.70 * 20 // 20 years of 70% income
      const ownerDOB: Record<string, string> = { bernardo: '1983-05-17', laura: '1989-10-22' }
      const dob = ownerDOB[String(r.owner).toLowerCase()]
      if (dob) {
        const birthDate = new Date(dob)
        const retirementDate = new Date(birthDate)
        retirementDate.setFullYear(birthDate.getFullYear() + 65)
        const yearsToRetirement = Math.max(0, (retirementDate.getTime() - todayMs) / (365.25 * 24 * 3600 * 1000))
        const projectedBase = Number(r.current_balance) * Math.pow(1.085, yearsToRetirement)

        if (projectedBase < target70pct * 0.5) {
          findings.push({
            id: `afore-projection-low-${r.owner}`,
            severity: 'amber',
            category: 'retirement',
            title: `${canonicalOwner(r.owner as string)}'s AFORE projection may fall short`,
            detail: `Projected $${projectedBase.toLocaleString('en-US', { maximumFractionDigits: 0 })} MXN at 65 (base 8.5%). Income replacement target (~$${(target70pct).toLocaleString('en-US', { maximumFractionDigits: 0 })} for 20yr) may require voluntary contributions.`,
            suggestion: 'Consider Aportaciones Voluntarias to AFORE — tax-deductible up to 10% of annual income.',
            action_url: '/finance/investments?tab=Retirement',
          })
        }
      }
    }
  }
}

// ─── Health Score ───
// Net worth trend isn't scored until there is snapshot history, so the score
// is the other five parts (max 90) scaled to 100, and the trend is null.
const SCORED_MAX = 90

function scoreLabel(total: number): string {
  return total >= 80 ? 'Good' : total >= 60 ? 'Fair' : 'Needs work'
}

function westReadinessScore(west: WestAudit | null, westGapPct: number): number {
  if (west?.feasible === true) return 25
  if (west?.feasible === false) return westGapPct <= 5 ? 18 : westGapPct <= 15 ? 12 : 5
  return westGapPct <= 10 ? 25 : westGapPct <= 20 ? 18 : westGapPct <= 30 ? 12 : 5
}

function calcHealthScore(westScore: number, hasMultipleAssets: boolean, liquidMonths: number, aforeProjectionOk: boolean, debtToIncome: number) {
  const debtScore = debtToIncome < 0.3 ? 20 : debtToIncome < 0.4 ? 15 : debtToIncome < 0.5 ? 10 : 5
  const diversityScore = hasMultipleAssets ? 15 : 8
  const liquidityScore = liquidMonths >= 6 ? 15 : liquidMonths >= 3 ? 10 : liquidMonths >= 1 ? 5 : 0
  const retirementScore = aforeProjectionOk ? 15 : 8
  const scored = westScore + debtScore + diversityScore + liquidityScore + retirementScore

  return {
    total: Math.round((scored / SCORED_MAX) * 100),
    breakdown: {
      west_readiness: westScore,
      debt_health: debtScore,
      investment_diversity: diversityScore,
      liquidity: liquidityScore,
      retirement: retirementScore,
      net_worth_trend: null as number | null,
    },
  }
}

export async function GET(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response

  const now = new Date()
  try {
    const { client: supabase, degraded } = getAdminClientInfo()

    // Parallel data fetch
    const [cryptoRes, fiRes, reRes, retirementRes, summaryRes] = await Promise.all([
      supabase.from('finance_crypto_holdings').select('*'),
      supabase.from('finance_fixed_income').select('*'),
      supabase.from('finance_real_estate').select('*'),
      supabase.from('finance_retirement').select('*'),
      supabase.from('finance_transactions').select('amount').gte('transaction_date', localDateKey(new Date(now.getFullYear(), now.getMonth() - 3, 1))),
    ])

    // Debt data
    const { data: debts } = await supabase.from('finance_debts').select('balance, minimum_payment').gt('balance', 0)
    const { data: emergencyFund } = await supabase.from('finance_emergency_fund').select('current_amount, target_amount').limit(1).single()
    const { data: income } = await supabase.from('finance_income_sources').select('monthly_amount').eq('is_active', true)

    const fiData = (fiRes.data || []) as Record<string, unknown>[]
    const reData = (reRes.data || []) as Record<string, unknown>[]
    const retirementData = (retirementRes.data || []) as Record<string, unknown>[]

    // Crypto summary
    let cryptoSummary: Record<string, unknown> | null = null
    let usdMxn = FALLBACK_USD_MXN
    if (cryptoRes.data && cryptoRes.data.length > 0) {
      const holdings = cryptoRes.data
      const prices = await fetchCryptoPrices(holdings.map(h => h.symbol as string)) ?? {}
      usdMxn = impliedUsdMxn(prices) ?? FALLBACK_USD_MXN

      let totalMXN = 0; let totalCost = 0
      const holdingsSummary = holdings.map(h => {
        const price = prices[h.symbol as string]?.mxn || 0
        const value = (h.quantity as number) * price
        const cost = (h.avg_cost_basis_usd as number || 0) * (h.quantity as number)
        totalMXN += value; totalCost += cost
        return { symbol: h.symbol, qty: h.quantity, value, cost, allocation_pct: 0 }
      })
      holdingsSummary.forEach(h => { h.allocation_pct = totalMXN > 0 ? (h.value / totalMXN) * 100 : 0 })
      const pnlPct = totalCost > 0 ? ((totalMXN - totalCost) / totalCost) * 100 : 0
      const maxCoin = holdingsSummary.reduce((a, b) => a.allocation_pct > b.allocation_pct ? a : b, holdingsSummary[0])

      cryptoSummary = {
        total_value_mxn: totalMXN,
        total_cost_mxn: totalCost,
        pnl_mxn: totalMXN - totalCost,
        pnl_pct: pnlPct.toFixed(1),
        holdings: holdingsSummary,
        risks: {
          concentration: maxCoin && maxCoin.allocation_pct > 70 ? { symbol: maxCoin.symbol, pct: maxCoin.allocation_pct.toFixed(1) } : null,
          large_loss: pnlPct < -25 ? { pnl_pct: pnlPct.toFixed(1) } : null,
        },
      }
    }

    // Net worth
    const fiTotal = fiData.reduce((s, i) => s + accruedValue(i, now), 0)
    const retirementTotal = retirementData.reduce((s, r) => s + (Number(r.current_balance) || 0), 0)
    const cryptoTotal = Number(cryptoSummary?.total_value_mxn || 0)

    // WEST: the live projection (same as the WEST tracker), else the fallback constants
    let westTarget: number = WEST_FALLBACK.target
    let westGapPct: number = WEST_FALLBACK.gapPct
    let monthsToDelivery: number = WEST_FALLBACK.monthsToDelivery
    let westFeasible: boolean | null = null
    let westShortfall = 0
    let westPaid: WestPaidToDate | null = null
    let purchaseFundedMonth: string | null = null
    let lumpSum = { amount: 0, month: null as string | null }
    try {
      const west = await getWestProjection(supabase, { now })
      const atDelivery = west.projected_at_delivery
      westTarget = Number(west.property?.purchase_price) || westTarget
      if (atDelivery) westGapPct = Math.max(0, Number(atDelivery.gap_pct) || 0)
      // months_to_delivery is what Home, the tracker and the Daily Brief show
      // (monthly_projection also counts the current month).
      if (Number.isFinite(west.months_to_delivery)) monthsToDelivery = west.months_to_delivery
      westPaid = { target: west.target, paid: west.current_status.amount_paid }
      purchaseFundedMonth = west.behavioral?.fully_funded_month ?? null
      if (typeof west.savings_plan?.feasible === 'boolean') westFeasible = west.savings_plan.feasible
      westShortfall = Math.max(0, Number(west.savings_plan?.projected_shortfall_at_delivery) || 0)
      lumpSum = { amount: Number(west.schedule?.lump_sum_amount) || 0, month: west.schedule?.lump_sum_month ?? null }
    } catch (e) {
      console.warn('Investment audit: WEST projection unavailable, using fallback', e instanceof Error ? e.message : e)
    }
    // Same equity rule as the net-worth snapshot (WEST owes target − paid-to-date).
    const reEquity = reData.reduce((s, p) => s + propertyEquity(p as PropertyLike, westPaid), 0)
    const totalNetWorth = reEquity + fiTotal + retirementTotal + cryptoTotal

    // Income and emergency-fund coverage come from the summary, so the audit
    // agrees with the Emergency Fund page (months of ESSENTIALS, not income).
    const summary = await buildSummary(supabase, { months: 3, now }).catch(e => {
      console.warn('Investment audit: summary unavailable', e instanceof Error ? e.message : e)
      return null
    })
    const extrasIncome = (income || []).reduce((s, i) => s + (Number(i.monthly_amount) || 0), 0)
    const monthlyIncome = Number(summary?.cash_flow?.monthly_income) || extrasIncome
    const debtBalances = (debts || []).reduce((s, d) => s + (Number(d.balance) || 0), 0)
    const debtMinimums = (debts || []).reduce((s, d) => s + (Number(d.minimum_payment) || 0), 0)
    const debtToIncome = monthlyIncome > 0 ? debtMinimums / monthlyIncome : 0
    const emergencyMonths = Number(summary?.emergency_fund?.months_covered) || 0
    const emergencyTargetMonths = Number(summary?.emergency_fund?.target_months) || 6
    const hasMultipleAssets = [cryptoTotal > 0, fiTotal > 0, reEquity > 0, retirementTotal > 0].filter(Boolean).length >= 3

    // Fetch stocks for PE flags
    const { data: stocksData } = await supabase.from('finance_stock_holdings').select('*')
    const peData = (stocksData || []) as Record<string, unknown>[]
    const peCurrentValue = peData.filter(s => s.asset_type === 'private_equity')
      .reduce((sum, s) => sum + (Number(s.shares || 0) * Number(s.current_price_usd || 0) * usdMxn), 0)
    const finalNetWorth = totalNetWorth + peCurrentValue

    // Run all flag rules
    const findings: Finding[] = []
    runCryptoFlags(cryptoSummary, finalNetWorth, findings)
    const westAudit: WestAudit = {
      gap: westTarget * (westGapPct / 100),
      gap_pct: westGapPct,
      months_to_delivery: monthsToDelivery,
      feasible: westFeasible,
      shortfall: westShortfall,
      purchase_funded_month: purchaseFundedMonth,
      lump_sum_amount: lumpSum.amount,
      lump_sum_month: lumpSum.month,
    }
    runRealEstateFlags(reData, westAudit, findings, now)
    runFixedIncomeFlags(fiData, findings, now)
    runRetirementFlags(retirementData, monthlyIncome, findings, now)
    runPrivateEquityFlags(peData, findings, now)

    // Emergency fund green finding
    if (emergencyMonths >= emergencyTargetMonths) {
      findings.push({
        id: 'emergency-fund-healthy',
        severity: 'green',
        category: 'general',
        title: `Emergency fund covers ${emergencyMonths.toFixed(1)} months of expenses`,
        detail: `$${Number(summary?.emergency_fund?.current ?? emergencyFund?.current_amount ?? 0).toLocaleString()} MXN covers ${emergencyMonths.toFixed(1)} months of essential spending. Target: ${emergencyTargetMonths} months.`,
        suggestion: 'Emergency fund is healthy. Consider redirecting surplus savings to WEST or investments.',
        action_url: '/finance/emergency-fund',
      })
    }

    // Calc health score
    const score = calcHealthScore(westReadinessScore(westAudit, westGapPct), hasMultipleAssets, emergencyMonths, true, debtToIncome)

    // Sort: red first, then amber, then green
    findings.sort((a, b) => {
      const order = { red: 0, amber: 1, green: 2 }
      return order[a.severity] - order[b.severity]
    })

    return withDegradedHeader(NextResponse.json({
      score: score.total,
      score_label: scoreLabel(score.total),
      score_breakdown: score.breakdown,
      findings,
      net_worth: {
        total: Math.round(finalNetWorth),
        by_class: {
          crypto: Math.round(cryptoTotal),
          fixed_income: Math.round(fiTotal),
          real_estate: Math.round(reEquity),
          retirement: Math.round(retirementTotal),
          private_equity: Math.round(peCurrentValue),
        },
      },
      summary: {
        monthly_income: Math.round(monthlyIncome),
        debt_to_income: Math.round(debtToIncome * 100),
        emergency_months: Math.round(emergencyMonths * 10) / 10,
        usd_mxn: Math.round(usdMxn * 100) / 100,
        total_debt: Math.round(debtBalances),
      },
    }, { headers: { 'Cache-Control': 'private, no-store' } }), degraded)
  } catch (e) {
    if (e instanceof ConfigError) return configErrorResponse(e)
    console.error('Investment audit error:', e)
    return NextResponse.json({ error: 'Audit failed' }, { status: 500 })
  }
}
