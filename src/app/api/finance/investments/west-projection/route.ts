import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'
import { accruedValue } from '@/lib/fixed-income'
import { fetchAllRows } from '@/lib/supabase-fetch-all'
import { FERTILITY_TREATMENT_PLAN, getTreatmentEventForMonth } from '@/lib/fertility-plan'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  // Anon fallback mirrors the summary route: lets local dev (no service key)
  // serve the projection; production always has the service role.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
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
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response

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
      .select('principal, annual_rate, commission_rate, net_annual_rate, updated_at')
      .eq('institution', 'GBM')
    // Start from the estimated current value (principal accrued since last
    // confirmed), so the projection picks up where the live balance actually is.
    const liveGBMBalance = gbmRecords && gbmRecords.length > 0
      ? gbmRecords.reduce((s: number, r) => s + accruedValue(r), 0)
      : (target.sale_deposit_received || 0)

    // 4. Fetch crypto total
    const cryptoValue = await getCryptoTotal()

    // 3b. amount_paid is anchored at the target's last manual update; WEST
    // payments post as transactions monthly and must roll in automatically
    // or "paid" silently drifts $10k/month behind reality.
    const paidAnchor = (target.updated_at || target.purchase_date || '2026-01-01').slice(0, 10)
    const { data: postedWest } = await supabase
      .from('finance_transactions')
      .select('amount_mxn, transaction_date')
      .eq('merchant', 'WEST')
      .eq('type', 'expense')
      .gt('transaction_date', paidAnchor)
    const postedSincePaidAnchor = (postedWest || []).reduce((s: number, t: { amount_mxn: number }) => s + (t.amount_mxn || 0), 0)
    const paidToDate = (target.amount_paid || 0) + postedSincePaidAnchor

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
    let paidCumulative = paidToDate
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

      // Apartment sale proceeds land — include even in current month if date is still in the future
      if (saleRemainingDate &&
        current.getFullYear() === saleRemainingDate.getFullYear() &&
        current.getMonth() === saleRemainingDate.getMonth() &&
        saleRemainingDate > now) {
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

    // 6. Scenario calculations. `monthlyContribution` models extra household
    // savings flowing into GBM each month on top of the scheduled plan.
    const calcScenario = (rate: number, monthlyContribution = 0) => {
      const mr = Math.pow(1 + rate, 1 / 12) - 1
      let inv = liveGBMBalance
      let paid = paidToDate
      let crypto = cryptoValue
      let fullyFundedMonth: string | null = null
      const cur = new Date(startMonth)

      while (cur <= deliveryDate) {
        const isCur = cur.getFullYear() === now.getFullYear() && cur.getMonth() === now.getMonth()
        if (!isCur && target.monthly_payment && (!monthlyPaymentEnd || cur <= monthlyPaymentEnd)) paid += target.monthly_payment
        if (!isCur && lumpSumDate && cur.getFullYear() === lumpSumDate.getFullYear() && cur.getMonth() === lumpSumDate.getMonth()) paid += target.lump_sum_amount || 0
        if (saleRemainingDate && cur.getFullYear() === saleRemainingDate.getFullYear() && cur.getMonth() === saleRemainingDate.getMonth() && saleRemainingDate > now) {
          inv += Math.max(0, saleRemaining - debtPayoffTotal)
        }
        if (!isCur) {
          inv += monthlyContribution
          inv *= (1 + mr)
          crypto *= (1 + cryptoMonthlyGrowth)
        }
        if (!fullyFundedMonth && paid + inv + crypto + lauraInfonvait >= targetAmount) {
          fullyFundedMonth = cur.toISOString().slice(0, 7)
        }
        cur.setMonth(cur.getMonth() + 1)
      }
      const total = paid + inv + crypto + lauraInfonvait
      return { total: Math.round(total), gap: Math.round(targetAmount - total), fully_funded_month: fullyFundedMonth }
    }

    // 6b. Behavioral layer — what the household ACTUALLY saves per month,
    // from real transactions over the last 6 full months. This is the input
    // the scheduled plan ignores: whether spending behavior leaves a surplus
    // that could flow into GBM and close the delivery gap.
    const historyStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 1)).toISOString().slice(0, 10)
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const savingsTxs = await fetchAllRows<{ transaction_date: string; type: string; amount_mxn: number; tags: string[] | null }>(
      (from, to) => supabase
        .from('finance_transactions')
        .select('transaction_date, type, amount_mxn, tags')
        .gte('transaction_date', historyStart)
        .order('transaction_date')
        .range(from, to)
    )
    const byMonth: Record<string, { income: number; expenses: number }> = {}
    for (const t of savingsTxs) {
      const m = t.transaction_date.slice(0, 7)
      if (m >= currentMonthKey) continue // exclude partial current month
      byMonth[m] = byMonth[m] || { income: 0, expenses: 0 }
      if (t.type === 'income') byMonth[m].income += t.amount_mxn || 0
      else if (t.type === 'expense') byMonth[m].expenses += t.amount_mxn || 0
    }
    const savingsHistory = Object.entries(byMonth)
      .map(([month, v]) => ({ month, income: Math.round(v.income), expenses: Math.round(v.expenses), net: Math.round(v.income - v.expenses) }))
      // Zero-income months predate transaction tracking (app started Feb 2026)
      // — they'd read as pure deficit and poison the run-rate.
      .filter(m => m.income > 0)
      .sort((a, b) => a.month.localeCompare(b.month))
    const avgNet = savingsHistory.length > 0
      ? savingsHistory.reduce((s, m) => s + m.net, 0) / savingsHistory.length
      : 0
    const last3 = savingsHistory.slice(-3)
    const recentNet = last3.length > 0 ? last3.reduce((s, m) => s + m.net, 0) / last3.length : 0
    // Contribution assumption: the average real surplus, floored at zero — a
    // deficit household adds nothing (we don't model drawdowns here).
    const assumedContribution = Math.round(Math.max(0, avgNet))
    const behavioralRun = calcScenario(annualRate, assumedContribution)
    const baseRun = calcScenario(annualRate)
    // Monthly contribution that closes the base-case gap by delivery
    // (future value of an annuity: C·((1+r)^N − 1)/r = gap).
    const monthsN = Math.max(1,
      (deliveryDate.getFullYear() - now.getFullYear()) * 12 + (deliveryDate.getMonth() - now.getMonth()))
    const requiredMonthly = baseRun.gap > 0
      ? Math.ceil(baseRun.gap * monthlyRate / (Math.pow(1 + monthlyRate, monthsN) - 1))
      : 0

    // Furnishing / fit-out budget needed at delivery ON TOP of the purchase
    // price (added 2026-07-03 per Bernardo). The savings plan accumulates
    // purchase gap + furnishing; readiness stats stay purchase-only.
    const FURNISHING_BUDGET_MXN = 1_000_000

    // 6c. Month-by-month savings plan. Each future month gets a saving
    // capacity anchored on the historical average, adjusted for what we KNOW
    // changes: MSI installments ending free their payment, aguinaldo months
    // add yearly income, and the fertility drag inside the historical average
    // is added back once treatment ends. Targets are capacity-proportional,
    // scaled so their future value at delivery closes the base-case gap.
    const [{ data: activeInstallments }, { data: yearlyIncome }] = await Promise.all([
      supabase.from('finance_installments').select('name, installment_amount, end_date').eq('is_active', true),
      supabase.from('finance_income_sources').select('name, amount').eq('is_active', true).eq('frequency', 'yearly'),
    ])
    const fertilityByMonth: Record<string, number> = {}
    for (const t of savingsTxs) {
      if (t.type !== 'expense' || !(t.tags || []).includes('fertility')) continue
      const m = t.transaction_date.slice(0, 7)
      if (m >= currentMonthKey) continue
      fertilityByMonth[m] = (fertilityByMonth[m] || 0) + (t.amount_mxn || 0)
    }
    // Post-treatment saving capacity: average of months with NO fertility
    // spending (empirical, not inferred). Fallback: add the average drag back
    // to the overall mean when there aren't enough clean months.
    const cleanNets = savingsHistory.filter(m => !(fertilityByMonth[m.month] > 0)).map(m => m.net)
    const fertilityDragTotal = Object.values(fertilityByMonth).reduce((s, v) => s + v, 0)
    const baseCapacity = cleanNets.length >= 2
      ? cleanNets.reduce((s, v) => s + v, 0) / cleanNets.length
      : avgNet + fertilityDragTotal / Math.max(1, savingsHistory.length)
    const msiNow = (activeInstallments || []).reduce((s, i) => s + (i.installment_amount || 0), 0)
    const yearlyBonusTotal = (yearlyIncome || []).reduce((s, i) => s + (i.amount || 0), 0)

    // Plan starts with the CURRENT month — partially elapsed, but its target
    // is still actionable (and its treatment payments still need planning).
    const planMonths: Array<{ month: string; capacity: number; target: number; notes: string[] }> = []
    const planCursor = new Date(now.getFullYear(), now.getMonth(), 1)
    // Start from what's already freed today so the first plan month annotates
    // installments ending in the current month (e.g. the July IVF MSIs).
    let prevFreed = (activeInstallments || [])
      .filter(i => i.end_date && i.end_date.slice(0, 7) < currentMonthKey)
      .reduce((s, i) => s + (i.installment_amount || 0), 0)
    while (planCursor <= deliveryDate) {
      const mKey = `${planCursor.getFullYear()}-${String(planCursor.getMonth() + 1).padStart(2, '0')}`
      const notes: string[] = []
      // MSI payments freed: installments whose end_date falls before this month
      const endedInstallments = (activeInstallments || []).filter(i => i.end_date && i.end_date.slice(0, 7) < mKey)
      const freed = endedInstallments.reduce((s, i) => s + (i.installment_amount || 0), 0)
      if (prevFreed >= 0 && freed > prevFreed) {
        notes.push(`+$${Math.round(freed - prevFreed).toLocaleString()}/mo freed (MSI ended)`)
      }
      prevFreed = freed
      const treatmentEvent = getTreatmentEventForMonth(mKey)
      if (treatmentEvent) notes.push(`−$${treatmentEvent.amount.toLocaleString()} ${treatmentEvent.label}`)
      const isAguinaldoMonth = planCursor.getMonth() === 11 && yearlyBonusTotal > 0
      if (isAguinaldoMonth) notes.push(`+$${Math.round(yearlyBonusTotal).toLocaleString()} aguinaldo`)
      if (mKey === FERTILITY_TREATMENT_PLAN.endMonth) notes.push('last treatment month')
      const capacity = Math.max(0, Math.round(
        baseCapacity
        + freed
        + (isAguinaldoMonth ? yearlyBonusTotal : 0)
        - (treatmentEvent ? treatmentEvent.amount : 0)
      ))
      planMonths.push({ month: mKey, capacity, target: 0, notes })
      planCursor.setMonth(planCursor.getMonth() + 1)
    }
    // Scale capacity-proportional targets so their future value closes the
    // purchase gap PLUS the furnishing budget
    const planGapToClose = Math.max(0, baseRun.gap) + FURNISHING_BUDGET_MXN
    const fvWeight = (idx: number) => Math.pow(1 + monthlyRate, planMonths.length - idx)
    const capacityFV = planMonths.reduce((s, m, idx) => s + m.capacity * fvWeight(idx), 0)
    const stretchFactor = planGapToClose > 0 && capacityFV > 0 ? planGapToClose / capacityFV : 0
    for (const m of planMonths) {
      m.target = Math.round(m.capacity * stretchFactor)
      if (m.capacity === 0 && planGapToClose > 0) m.notes.push('no expected surplus — skip month')
    }
    const planTotalNominal = planMonths.reduce((s, m) => s + m.target, 0)
    // Flat monthly equivalent (annuity) for the same combined goal
    const flatMonthlyEquivalent = planGapToClose > 0
      ? Math.ceil(planGapToClose * monthlyRate / (Math.pow(1 + monthlyRate, planMonths.length) - 1))
      : 0

    // 7. Milestones
    const milestones = [
      { date: now.toISOString().slice(0, 10), label: `$${(paidToDate / 1e6).toFixed(1)}M paid (${((paidToDate / targetAmount) * 100).toFixed(1)}%)`, status: 'done' },
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
        amount_paid: Math.round(paidToDate),
        pct_paid: ((paidToDate / targetAmount) * 100),
        investment_value: Math.round(liveGBMBalance),
        crypto_value: Math.round(cryptoValue),
        infonavit_laura: Math.round(lauraInfonvait),
        total_available: Math.round(paidToDate + (target.sale_deposit_received || 0) + cryptoValue + lauraInfonvait),
        gap: Math.round(targetAmount - paidToDate - (target.sale_deposit_received || 0) - cryptoValue - lauraInfonvait),
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
      behavioral: {
        monthly_net_savings_history: savingsHistory,
        avg_monthly_net_savings: Math.round(avgNet),
        recent_3mo_net_savings: Math.round(recentNet),
        assumed_monthly_contribution: assumedContribution,
        projected_total_at_delivery: behavioralRun.total,
        projected_gap_at_delivery: behavioralRun.gap,
        fully_funded_month: behavioralRun.fully_funded_month,
        required_monthly_contribution: requiredMonthly,
      },
      savings_plan: {
        goal: 'fully fund WEST purchase + furnishing at delivery (base-case return)',
        gap_to_close: planGapToClose,
        purchase_gap: Math.max(0, baseRun.gap),
        furnishing_budget: FURNISHING_BUDGET_MXN,
        flat_monthly_equivalent: flatMonthlyEquivalent,
        months: planMonths,
        total_nominal: planTotalNominal,
        // >1 means the plan asks for more than historical capacity every month
        stretch_factor: Math.round(stretchFactor * 100) / 100,
        assumptions: {
          base_capacity: Math.round(baseCapacity),
          clean_months_used: cleanNets.length,
          msi_monthly_now: Math.round(msiNow),
          aguinaldo_yearly: Math.round(yearlyBonusTotal),
        },
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
        { name: 'Direct Payments', current: Math.round(paidToDate), at_delivery: lastMonth?.paid || 0, owner: 'bernardo', status: 'on_track' },
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
