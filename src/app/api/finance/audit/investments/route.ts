import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  return createClient(url, key)
}

function authOk(req: NextRequest) {
  const key = req.headers.get('x-api-key')
  if (key === process.env.FINANCE_API_KEY || key === process.env.SUPABASE_SERVICE_ROLE_KEY) return true
  const referer = req.headers.get('referer') || ''
  const host = req.headers.get('host') || ''
  return referer.includes(req.nextUrl.host) || host.includes('localhost') || host.includes('autonomis.co') || host.includes('vercel.app')
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

const now = new Date()

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

function runRealEstateFlags(reData: Array<Record<string, unknown>>, westData: Record<string, unknown> | null, findings: Finding[]) {
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

  // WEST gap dynamic flag
  if (westData) {
    const gapPct = Number(westData.gap_pct || 0)
    const monthsToDelivery = Number(westData.months_to_delivery || 24)

    if (gapPct > 20 && monthsToDelivery <= 12) {
      findings.push({
        id: 'west-gap-urgent',
        severity: 'red',
        category: 'real_estate',
        title: `WEST gap $${Number(westData.gap || 0).toLocaleString()} MXN with ${monthsToDelivery} months to delivery`,
        detail: `${gapPct.toFixed(1)}% of target unfunded with less than 12 months remaining. Financing options may be needed.`,
        suggestion: 'Evaluate mortgage pre-approval for the remaining gap amount.',
        action_url: '/finance/investments?tab=Real Estate',
      })
    } else if (gapPct < 10 && monthsToDelivery > 0) {
      findings.push({
        id: 'west-gap-healthy',
        severity: 'green',
        category: 'real_estate',
        title: `WEST ${(100 - gapPct).toFixed(1)}% funded — gap under $1M 🎯`,
        detail: `Gap of $${Number(westData.gap || 0).toLocaleString()} MXN is within standard mortgage financing range. On track for Dec 2027 delivery.`,
        suggestion: 'Maintain $10K/mo payments and $100K Dec 2026 lump sum as planned.',
        action_url: '/finance/investments?tab=Real Estate',
      })
    }

    // Green: apartment mortgages paid off April 2026
    findings.push({
      id: 'west-mortgages-payoff',
      severity: 'green',
      category: 'real_estate',
      title: 'BBVA + Infonavit paid off April 2026 — freeing $18,925/mo',
      detail: 'Current apartment sale proceeds in April 2026 pay off both mortgages (~$1.67M). Monthly mortgage payments of $18,925 are freed up permanently.',
      suggestion: 'Allocate freed cash flow toward WEST payments or AFORE voluntary contributions.',
      action_url: '/finance/investments?tab=Real Estate',
    })
  }
}

function runFixedIncomeFlags(fiData: Array<Record<string, unknown>>, findings: Finding[]) {
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
          suggestion: 'April apartment sale proceeds will push balance well past this threshold.',
          action_url: '/finance/investments?tab=Fixed Income',
        })
      }

      if (balance >= nextTierThreshold && currentCommission > 0.009) {
        const annualSavings = Math.round(balance * (currentCommission - 0.0082))
        findings.push({
          id: 'gbm-commission-dropped',
          severity: 'green',
          category: 'fixed_income',
          title: `GBM commission reduced to 0.82% — saving ~$${annualSavings.toLocaleString()}/yr`,
          detail: `Balance of $${balance.toLocaleString()} MXN exceeds the $2.5M threshold. Commission fell from ${(currentCommission * 100).toFixed(2)}% to 0.82%.`,
          suggestion: 'Update the GBM record to reflect the new commission rate.',
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
      suggestion: 'Continue holding. Balance will grow significantly after April apartment sale proceeds land.',
      action_url: '/finance/investments?tab=Fixed Income',
    })
  }
}

function runPrivateEquityFlags(stocks: Array<Record<string, unknown>>, findings: Finding[]) {
  const today = new Date()
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

function runRetirementFlags(retirementData: Array<Record<string, unknown>>, monthlyIncome: number, findings: Finding[]) {
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
          title: `${r.owner === 'bernardo' ? 'Bernardo' : 'Laura'}'s AFORE balance is ${daysSince} days old`,
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
      const dob = ownerDOB[r.owner as string]
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
            title: `${r.owner === 'bernardo' ? 'Bernardo' : 'Laura'}'s AFORE projection may fall short`,
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
function calcHealthScore(westGapPct: number, hasMultipleAssets: boolean, liquidMonths: number, aforeProjectionOk: boolean, debtToIncome: number) {
  const westScore = westGapPct <= 10 ? 25 : westGapPct <= 20 ? 18 : westGapPct <= 30 ? 12 : 5
  const debtScore = debtToIncome < 0.3 ? 20 : debtToIncome < 0.4 ? 15 : debtToIncome < 0.5 ? 10 : 5
  const diversityScore = hasMultipleAssets ? 15 : 8
  const liquidityScore = liquidMonths >= 6 ? 15 : liquidMonths >= 3 ? 10 : liquidMonths >= 1 ? 5 : 0
  const retirementScore = aforeProjectionOk ? 15 : 8
  const netWorthTrendScore = 8 // placeholder until we have historical snapshots

  return {
    total: westScore + debtScore + diversityScore + liquidityScore + retirementScore + netWorthTrendScore,
    breakdown: {
      west_readiness: westScore,
      debt_health: debtScore,
      investment_diversity: diversityScore,
      liquidity: liquidityScore,
      retirement: retirementScore,
      net_worth_trend: netWorthTrendScore,
    },
  }
}

export async function GET(req: NextRequest) {
  if (!authOk(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const supabase = getSupabase()

    // Parallel data fetch
    const [cryptoRes, fiRes, reRes, retirementRes, summaryRes] = await Promise.all([
      supabase.from('finance_crypto_holdings').select('*'),
      supabase.from('finance_fixed_income').select('*'),
      supabase.from('finance_real_estate').select('*'),
      supabase.from('finance_retirement').select('*'),
      supabase.from('finance_transactions').select('amount').gte('transaction_date', new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().slice(0, 10)),
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
    if (cryptoRes.data && cryptoRes.data.length > 0) {
      const holdings = cryptoRes.data
      const symbolMap: Record<string, string> = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana' }
      let prices: Record<string, { mxn: number }> = {}
      try {
        const priceRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=mxn', { next: { revalidate: 300 } })
        if (priceRes.ok) prices = await priceRes.json()
      } catch { /* use 0 prices */ }

      let totalMXN = 0; let totalCost = 0
      const holdingsSummary = holdings.map(h => {
        const cgId = symbolMap[h.symbol as string]
        const price = cgId ? (prices[cgId]?.mxn || 0) : 0
        const value = (h.quantity as number) * price
        const cost = (h.avg_cost_basis_mxn as number || 0) * (h.quantity as number)
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
    const reEquity = reData.reduce((s, p) => s + (Number(p.current_value) || 0) - (Number(p.mortgage_balance) || 0), 0)
    const fiTotal = fiData.reduce((s, i) => s + (Number(i.principal) || 0), 0)
    const retirementTotal = retirementData.reduce((s, r) => s + (Number(r.current_balance) || 0), 0)
    const cryptoTotal = Number(cryptoSummary?.total_value_mxn || 0)
    const totalNetWorth = reEquity + fiTotal + retirementTotal + cryptoTotal

    // WEST data
    const west = reData.find(p => p.property_type === 'pre_sale')
    const westGap = west ? Math.max(0, Number(west.current_value || 0) * 0 + (Number(west.mortgage_balance || 0))) : 0
    // Simple: projected gap from WEST tracker ≈ 8.84% of target
    const westTarget = 11204000
    const westGapPct = 8.84 // known from projection

    // Financial metrics
    const monthlyIncome = (income || []).reduce((s, i) => s + (Number(i.monthly_amount) || 0), 0)
    const debtBalances = (debts || []).reduce((s, d) => s + (Number(d.balance) || 0), 0)
    const debtMinimums = (debts || []).reduce((s, d) => s + (Number(d.minimum_payment) || 0), 0)
    const debtToIncome = monthlyIncome > 0 ? debtMinimums / monthlyIncome : 0
    const emergencyMonths = emergencyFund && monthlyIncome > 0
      ? (Number(emergencyFund.current_amount) || 0) / monthlyIncome : 0
    const hasMultipleAssets = [cryptoTotal > 0, fiTotal > 0, reEquity > 0, retirementTotal > 0].filter(Boolean).length >= 3

    // Fetch stocks for PE flags
    const { data: stocksData } = await supabase.from('finance_stock_holdings').select('*')
    const peData = (stocksData || []) as Record<string, unknown>[]
    const peCurrentValue = peData.filter(s => s.asset_type === 'private_equity')
      .reduce((sum, s) => sum + (Number(s.shares || 0) * Number(s.current_price_usd || 0) * 17.13), 0)
    const finalNetWorth = totalNetWorth + peCurrentValue

    // Run all flag rules
    const findings: Finding[] = []
    runCryptoFlags(cryptoSummary, finalNetWorth, findings)
    runRealEstateFlags(reData, {
      gap: westTarget * (westGapPct / 100),
      gap_pct: westGapPct,
      months_to_delivery: 22,
    }, findings)
    runFixedIncomeFlags(fiData, findings)
    runRetirementFlags(retirementData, monthlyIncome, findings)
    runPrivateEquityFlags(peData, findings)

    // Emergency fund green finding
    if (emergencyMonths >= 6) {
      findings.push({
        id: 'emergency-fund-healthy',
        severity: 'green',
        category: 'general',
        title: `Emergency fund covers ${emergencyMonths.toFixed(1)} months of expenses`,
        detail: `$${Number(emergencyFund?.current_amount || 0).toLocaleString()} MXN provides ${emergencyMonths.toFixed(1)} months of coverage. Target: ${Math.ceil((Number(emergencyFund?.target_amount || 0)) / monthlyIncome)} months.`,
        suggestion: 'Emergency fund is healthy. Consider redirecting surplus savings to WEST or investments.',
        action_url: '/finance/emergency-fund',
      })
    }

    // Calc health score
    const score = calcHealthScore(westGapPct, hasMultipleAssets, emergencyMonths, true, debtToIncome)

    // Sort: red first, then amber, then green
    findings.sort((a, b) => {
      const order = { red: 0, amber: 1, green: 2 }
      return order[a.severity] - order[b.severity]
    })

    return NextResponse.json({
      score: score.total,
      score_label: score.total >= 80 ? 'Excellent' : score.total >= 65 ? 'Good' : score.total >= 50 ? 'Fair' : 'Needs Attention',
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
        total_debt: Math.round(debtBalances),
      },
    })
  } catch (e) {
    console.error('Investment audit error:', e)
    return NextResponse.json({ error: 'Audit failed' }, { status: 500 })
  }
}
