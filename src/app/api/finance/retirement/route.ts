import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

function authOk(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key')
  if (apiKey === process.env.FINANCE_API_KEY || apiKey === process.env.SUPABASE_SERVICE_ROLE_KEY) return true
  const origin = req.headers.get('origin') || ''
  const host = req.headers.get('host') || ''
  return origin.includes('autonomis.co') || origin.includes('vercel.app') ||
    host.includes('localhost') || host.includes('autonomis.co') || host.includes('vercel.app')
}

// Simple compound projection: balance × (1+rate)^years
function project(balance: number, annualRate: number, years: number) {
  if (years <= 0) return balance
  return Math.round(balance * Math.pow(1 + annualRate, years))
}

export async function GET(req: NextRequest) {
  if (!authOk(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const supabase = getSupabase()
    const ownerFilter = req.nextUrl.searchParams.get('owner')

    let query = supabase
      .from('finance_retirement')
      .select('*')
      .order('owner', { ascending: true })

    if (ownerFilter && ownerFilter !== 'all') {
      query = query.eq('owner', ownerFilter.toLowerCase())
    }

    const { data: records, error } = await query
    if (error) throw error

    const items = records || []

    // Totals
    const totalBalance = items.reduce((s, r) => s + (r.current_balance || 0), 0)
    const westEarmarked = items.filter(r => r.is_usable_for_west).reduce((s, r) => s + (r.west_amount || 0), 0)

    // By owner
    const byOwner: Record<string, { afore: number; infonavit: number; total: number }> = {}
    for (const r of items) {
      const ownerKey = r.owner.charAt(0).toUpperCase() + r.owner.slice(1)
      if (!byOwner[ownerKey]) byOwner[ownerKey] = { afore: 0, infonavit: 0, total: 0 }
      if (r.instrument_type === 'afore') byOwner[ownerKey].afore += r.current_balance || 0
      if (r.instrument_type === 'infonavit') byOwner[ownerKey].infonavit += r.current_balance || 0
      byOwner[ownerKey].total += r.current_balance || 0
    }

    // Projections — use retirement_age, default 65
    // We don't have birth year, so we approximate years_to_65 from notes or default to 30 for Bernardo, 25 for Laura
    // Will be refined when boss provides ages
    const YEARS_TO_RETIREMENT: Record<string, number> = { bernardo: 30, laura: 25 }
    const projections: Record<string, {
      current: number
      monthly_contribution_estimate: number
      at_retirement_conservative: number
      at_retirement_base: number
      at_retirement_optimistic: number
    }> = {}

    for (const r of items) {
      if (r.instrument_type !== 'afore') continue
      const ownerKey = r.owner
      const years = YEARS_TO_RETIREMENT[ownerKey] ?? 30
      // Monthly contribution estimate: ~6.5% of salary, rough estimate
      // Bernardo ~$195,970/mo gross → ~$12,741/mo AFORE
      // Laura ~$73,990/mo gross → ~$4,810/mo AFORE
      const monthlyEst: Record<string, number> = { bernardo: 12741, laura: 4810 }
      projections[ownerKey] = {
        current: r.current_balance,
        monthly_contribution_estimate: monthlyEst[ownerKey] ?? 0,
        at_retirement_conservative: project(r.current_balance, 0.07, years),
        at_retirement_base: project(r.current_balance, 0.085, years),
        at_retirement_optimistic: project(r.current_balance, 0.10, years),
      }
    }

    return NextResponse.json({
      total_balance: Math.round(totalBalance),
      by_owner: byOwner,
      net_worth_contribution: Math.round(totalBalance),
      west_earmarked: Math.round(westEarmarked),
      west_available_note: westEarmarked > 0
        ? `Laura's Infonavit $${(westEarmarked / 1000).toFixed(0)}K is earmarked for WEST — appears in both tabs. Not double-counted in net worth.`
        : null,
      projections,
      records: items,
    })
  } catch (e: unknown) {
    console.error('Retirement API error:', e)
    return NextResponse.json({ error: 'Failed to load retirement data' }, { status: 500 })
  }
}

// PATCH — update balance for a record
export async function PATCH(req: NextRequest) {
  if (!authOk(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const supabase = getSupabase()
    const body = await req.json()
    const { id, current_balance, annual_return_rate, institution, notes } = body

    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (current_balance !== undefined) {
      updates.current_balance = current_balance
      updates.last_updated = new Date().toISOString().slice(0, 10)
    }
    if (annual_return_rate !== undefined) updates.annual_return_rate = annual_return_rate
    if (institution !== undefined) updates.institution = institution
    if (notes !== undefined) updates.notes = notes

    const { data, error } = await supabase
      .from('finance_retirement')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ record: data })
  } catch (e: unknown) {
    console.error('Retirement PATCH error:', e)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}
