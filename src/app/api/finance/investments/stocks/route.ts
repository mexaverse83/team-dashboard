import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error(`Missing env: URL=${!!url} KEY=${!!key}`)
  return createClient(url, key)
}

export async function GET() {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase.from('finance_stock_holdings').select('*').order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json({ stocks: data || [] })
  } catch (e: unknown) {
    console.error('Stocks GET error:', e)
    return NextResponse.json({ stocks: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase()
    const body = await req.json()
    const { id, ...fields } = body

    if (id) {
      const { error } = await supabase.from('finance_stock_holdings').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('finance_stock_holdings').insert(fields)
      if (error) throw error
    }
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    console.error('Stocks POST error:', e)
    return NextResponse.json({ error: 'Save failed' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = getSupabase()
    const { id } = await req.json()
    const { error } = await supabase.from('finance_stock_holdings').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    console.error('Stocks DELETE error:', e)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
