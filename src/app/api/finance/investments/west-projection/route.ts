import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error(`Missing env: URL=${!!url} KEY=${!!key}`)
  return createClient(url, key)
}

// CoinGecko proxy for crypto total
async function getCryptoTotal(): Promise<number> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return 0
    const supabase = createClient(url, key)
    const { data: holdings } = await supabase.from('finance_crypto_holdings').select('symbol, quantity')
    if (!holdings || holdings.length === 0) return 0

    const ids = ['bitcoin', 'ethereum', 'solana']
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=mxn`,
      { next: { revalidate: 300 } }
    )
    if (!res.ok) return 0
    const prices = await res.json()
    const symbolMap: Record<string, string> = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana' }

    return holdings.reduce((total, h) => {
      const cgId = symbolMap[h.symbol]
      const price = cgId ? prices[cgId]?.mxn || 0 : 0
      return total + (h.quantity || 0) * price
    }, 0)
  } catch {
    return 0
  }
}

interface MonthProjection {
  month: string
  paid: number
  investments: number
  crypto: number
  infonavit: number
  total: number
  gap: number
  property_value: number
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase()

    // 1. Fetch active target
    const { data: targets, error: tErr } = await supabase
      .from('finance_real_estate_targets')
      .select('*')
      .eq('is_active', true)
      .limit(1)
    if (tErr) throw tErr
    if (!targets || targets.length === 0) {
      return NextResponse.json({ error: 'No active target found' }, { status: 404 })
    }
    const target = targets[0]

    // 2. Fetch live debt balances for payoff calculation
    let debtPayoffTotal = 0
    if (target.debt_ids_to_payoff && target.debt_ids_to_payoff.length > 0) {
      const { data: debts } = await supabase
        .from('finance_debts')
        .select('id, balance')
        .in('id', target.debt_ids_to_payoff)
      debtPayoffTotal = (debts || []).reduce((s: number, d: { balance: number }) => s + (d.balance || 0), 0)
    } else {
      // Fallback: pull all active debts
      const { data: debts } = await supabase
        .from('finance_debts')
        .select('balance')
        .gt('balance', 0)
      debtPayoffTotal = (debts || []).reduce((s: number, d: { balance: number }) => s + (d.balance || 0), 0)
    }

    // 3. Fetch live GBM balance from finance_fixed_income (sum all GBM debt funds)
    const { data: gbmRecords } = await supabase
      .from('finance_fixed_income')
      .select('principal')
      .eq('institution', 'GBM')
    const liveGBMBalance = gbmRecords && gbmRecords.length > 0
      ? gbmRecords.reduce((s: number, r: { principal: number }) => s + (r.principal || 0), 0)
      : (target.sale_deposit_received || 0)

    // 4. Fetch crypto total
    const cryptoValue = await getCryptoTotal()

    // 4. Parse override return rate from query
    const overrideRate = req.nextUrl.searchParams.get('rate')
    // 9.5% net = 10.75% gross − 1.25% commission (based on 2023-2025 avg ~10.3% gross)
    const annualRate = overrideRate ? parseFloat(overrideRate) : (target.investment_annual_return || 0.095)
    const monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1

    // Crypto growth rate (default 15% annual — conservative for BTC/ETH/SOL mix)
    const overrideCryptoGrowth = req.nextUrl.searchParams.get('cryptoGrowth')
    const cryptoAnnualGrowth = overrideCryptoGrowth ? parseFloat(overrideCryptoGrowth) : 0.15
    const cryptoMonthlyGrowth = Math.pow(1 + cryptoAnnualGrowth, 1 / 12) - 1

    // 5. Build month-by-month projection
    const now = new Date()
    const deliveryDate = new Date(target.delivery_date)
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const saleRemainingDate = target.sale_remaining_date ? new Date(target.sale_remaining_date) : null
    const monthlyPaymentEnd = target.monthly_payment_end ? new Date(target.monthly_payment_end) : null
    const lumpSumDate = target.lump_sum_date ? new Date(target.lump_sum_date) : null

    const saleRemaining = (target.sale_price || 0) - (target.sale_deposit_received || 0)
    let investmentBalance = liveGBMBalance // GBM starting balance (live from DB)
    let paidCumulative = target.amount_paid || 0
    // Laura's Infonavit subcuenta — confirmed $350K, applied at delivery, no compounding
    const lauraInfonvait = target.laura_infonavit_mxn || 350000

    // Property appreciation
    const targetAmount = target.target_amount || 11204000
    const currentMarketValue = target.current_market_value || targetAmount
    const appreciationRate = target.appreciation_rate_annual || 0.125
    const monthlyAppreciation = Math.pow(1 + appreciationRate, 1 / 12) - 1
    let propertyValue = currentMarketValue
    let cryptoProjected = cryptoValue // Start from live value, compound forward

    const monthly: MonthProjection[] = []

    const current = new Date(startMonth)

    while (current <= deliveryDate) {
      const monthStr = current.toISOString().slice(0, 7)
      const isCurrentMonth = current.getFullYear() === now.getFullYear() && current.getMonth() === now.getMonth()

      // Monthly payment
      if (!isCurrentMonth && target.monthly_payment && (!monthlyPaymentEnd || current <= monthlyPaymentEnd)) {
        paidCumulative += target.monthly_payment
      }

      // Lump sum
      if (!isCurrentMonth && lumpSumDate &&
        current.getFullYear() === lumpSumDate.getFullYear() &&
        current.getMonth() === lumpSumDate.getMonth()) {
        paidCumulative += target.lump_sum_amount || 0
      }

      // Apartment sale proceeds land
      if (!isCurrentMonth && saleRemainingDate &&
        current.getFullYear() === saleRemainingDate.getFullYear() &&
        current.getMonth() === saleRemainingDate.getMonth()) {
        // Net proceeds = remaining sale price - debt payoffs
        const netProceeds = saleRemaining - debtPayoffTotal
        investmentBalance += Math.max(0, netProceeds)
      }

      // Monthly investment compounding + crypto growth
      if (!isCurrentMonth) {
        investmentBalance *= (1 + monthlyRate)
        cryptoProjected *= (1 + cryptoMonthlyGrowth)
        propertyValue *= (1 + monthlyAppreciation)
      }

      const total = paidCumulative + investmentBalance + cryptoProjected + lauraInfonvait
      const gap = targetAmount - total

      monthly.push({
        month: monthStr,
        property_value: Math.round(propertyValue),
        paid: Math.round(paidCumulative),
        investments: Math.round(investmentBalance),
        crypto: Math.round(cryptoProjected),
        infonavit: Math.round(lauraInfonvait),
        total: Math.round(total),
        gap: Math.round(gap),
      })

      current.setMonth(current.getMonth() + 1)
    }

    const lastMonth = monthly[monthly.length - 1]

    // 6. Scenario calculations
    const calcScenario = (rate: number) => {
      const mr = Math.pow(1 + rate, 1 / 12) - 1
      let inv = liveGBMBalance
      let paid = target.amount_paid || 0
      let crypto = cryptoValue
      const cur = new Date(startMonth)

      while (cur <= deliveryDate) {
        const isCur = cur.getFullYear() === now.getFullYear() && cur.getMonth() === now.getMonth()
        if (!isCur && target.monthly_payment && (!monthlyPaymentEnd || cur <= monthlyPaymentEnd)) paid += target.monthly_payment
        if (!isCur && lumpSumDate && cur.getFullYear() === lumpSumDate.getFullYear() && cur.getMonth() === lumpSumDate.getMonth()) paid += target.lump_sum_amount || 0
        if (!isCur && saleRemainingDate && cur.getFullYear() === saleRemainingDate.getFullYear() && cur.getMonth() === saleRemainingDate.getMonth()) {
          inv += Math.max(0, saleRemaining - debtPayoffTotal)
        }
        if (!isCur) {
          inv *= (1 + mr)
          crypto *= (1 + cryptoMonthlyGrowth)
        }
        cur.setMonth(cur.getMonth() + 1)
      }
      const total = paid + inv + crypto + lauraInfonvait
      return { total: Math.round(total), gap: Math.round(targetAmount - total) }
    }

    // 7. Milestones
    const milestones = [
      { date: now.toISOString().slice(0, 10), label: `$${(target.amount_paid / 1e6).toFixed(1)}M paid (${((target.amount_paid / targetAmount) * 100).toFixed(1)}%)`, status: 'done' },
    ]

    if (saleRemainingDate) {
      const past = saleRemainingDate <= now
      milestones.push({
        date: target.sale_remaining_date,
        label: `Apartment sale proceeds land (~$${((saleRemaining - debtPayoffTotal) / 1e6).toFixed(1)}M net)`,
        status: past ? 'done' : 'pending',
      })
      milestones.push({
        date: target.sale_remaining_date,
        label: `BBVA + Infonavit paid off`,
        status: past ? 'done' : 'pending',
      })
      // GBM commission drops from 1.25% → 0.82% when balance crosses $2.5M (April proceeds land)
      const postAprilBalance = Math.max(0, saleRemaining - debtPayoffTotal) + (target.sale_deposit_received || 0)
      const annualSavings = Math.round(postAprilBalance * (0.0125 - 0.0082))
      milestones.push({
        date: target.sale_remaining_date,
        label: `GBM commission 1.25% → 0.82% (+$${(annualSavings / 1000).toFixed(0)}K/yr saved)`,
        status: past ? 'done' : 'pending',
      })
    }

    if (lumpSumDate) {
      milestones.push({
        date: target.lump_sum_date,
        label: `$${((target.lump_sum_amount || 0) / 1000).toFixed(0)}K lump sum payment`,
        status: lumpSumDate <= now ? 'done' : 'pending',
      })
    }

    if (monthlyPaymentEnd) {
      milestones.push({
        date: target.monthly_payment_end,
        label: `Last monthly $${((target.monthly_payment || 0) / 1000).toFixed(0)}K payment`,
        status: monthlyPaymentEnd <= now ? 'done' : 'pending',
      })
    }

    milestones.push({
      date: target.delivery_date,
      label: `Laura's Infonavit ($${(lauraInfonvait / 1000).toFixed(0)}K) applied to balance`,
      status: 'pending',
    })

    milestones.push({
      date: target.delivery_date,
      label: `WEST delivery — final balance due`,
      status: 'target',
    })

    // Sort milestones by date
    milestones.sort((a, b) => a.date.localeCompare(b.date))

    const monthsToDelivery = Math.max(0,
      (deliveryDate.getFullYear() - now.getFullYear()) * 12 + (deliveryDate.getMonth() - now.getMonth())
    )

    return NextResponse.json({
      target: targetAmount,
      delivery_date: target.delivery_date,
      months_to_delivery: monthsToDelivery,
      current_status: {
        amount_paid: target.amount_paid,
        pct_paid: ((target.amount_paid / targetAmount) * 100),
        investment_value: Math.round(liveGBMBalance),
        crypto_value: Math.round(cryptoValue),
        infonavit_laura: Math.round(lauraInfonvait),
        total_available: Math.round((target.amount_paid || 0) + (target.sale_deposit_received || 0) + cryptoValue + lauraInfonvait),
        gap: Math.round(targetAmount - (target.amount_paid || 0) - (target.sale_deposit_received || 0) - cryptoValue - lauraInfonvait),
      },
      projected_at_delivery: lastMonth ? {
        total_paid: lastMonth.paid,
        investment_value: lastMonth.investments,
        crypto_value: lastMonth.crypto,
        infonavit_laura: lastMonth.infonavit,
        total_projected: lastMonth.total,
        gap: lastMonth.gap,
        gap_pct: ((lastMonth.gap / targetAmount) * 100),
        financing_needed: Math.max(0, lastMonth.gap),
        sub_million_gap: lastMonth.gap < 1000000,
      } : null,
      monthly_projection: monthly,
      scenarios: {
        // Net rates (after commission): conservative −1.25%, base −1.25%, optimistic −1.25%
        conservative_8pct: calcScenario(0.08),   // 9.25% gross − 1.25%
        base_9_5pct: calcScenario(0.095),         // 10.75% gross − 1.25%
        optimistic_11pct: calcScenario(0.11),     // 12.25% gross − 1.25%
      },
      milestones,
      property: {
        purchase_price: targetAmount,
        current_market_value: currentMarketValue,
        purchase_date: target.purchase_date,
        last_valuation_date: target.last_valuation_date,
        appreciation_rate: appreciationRate,
        projected_value_at_delivery: lastMonth?.property_value || currentMarketValue,
        equity_at_delivery: (lastMonth?.property_value || currentMarketValue) - targetAmount,
      },
      funding_sources: [
        { name: 'Direct Payments', current: Math.round(target.amount_paid || 0), at_delivery: lastMonth?.paid || 0, owner: 'bernardo', status: 'on_track' },
        { name: 'GBM Investment', current: Math.round(liveGBMBalance), at_delivery: lastMonth?.investments || 0, owner: 'shared', status: 'growing' },
        { name: 'Crypto', current: Math.round(cryptoValue), at_delivery: lastMonth?.crypto || 0, owner: 'shared', status: 'growing' },
        { name: "Laura's Infonavit", current: Math.round(lauraInfonvait), at_delivery: Math.round(lauraInfonvait), owner: 'laura', status: 'on_track' },
      ],
      assumptions: {
        investment_return: annualRate,
        appreciation_rate: appreciationRate,
        debt_payoff_total: debtPayoffTotal,
        crypto_growth: cryptoAnnualGrowth,
        laura_infonavit: lauraInfonvait,
        monthly_savings: 0,
      },
    })
  } catch (e: unknown) {
    console.error('WEST projection error:', e)
    return NextResponse.json({ error: 'Projection failed' }, { status: 500 })
  }
}
