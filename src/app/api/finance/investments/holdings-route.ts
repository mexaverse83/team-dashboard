import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'
import { configErrorResponse, ConfigError, getAdminClientInfo, withDegradedHeader } from '@/lib/supabase-admin'
import { canonicalOwner } from '@/lib/owners'

// Shared CRUD for the three investments tables (stocks, fixed income, real
// estate). Reads fail loudly — 5xx with an error body — so the page can show
// "couldn't load" instead of a believable $0 (F18, VIS-17).

function failure(e: unknown, label: string, message: string) {
  if (e instanceof ConfigError) return configErrorResponse(e)
  console.error(`${label} error:`, e)
  return NextResponse.json({ error: message }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
}

export function holdingsRoute(table: string, listKey: string, label: string) {
  async function GET(req: NextRequest) {
    const auth = await authorizeFinanceRequest(req)
    if (!auth.ok) return auth.response
    try {
      const { client, degraded } = getAdminClientInfo()
      const { data, error } = await client.from(table).select('*').order('created_at', { ascending: false })
      if (error) throw error
      return withDegradedHeader(NextResponse.json({ [listKey]: data || [] }, { headers: { 'Cache-Control': 'private, no-store' } }), degraded)
    } catch (e: unknown) {
      return failure(e, `${label} GET`, `Failed to load ${label.toLowerCase()}`)
    }
  }

  async function POST(req: NextRequest) {
    const auth = await authorizeFinanceRequest(req)
    if (!auth.ok) return auth.response
    try {
      const supabase = getAdminClientInfo().client
      const body = await req.json()
      const { id, ...fields } = body
      if (typeof fields.owner === 'string') fields.owner = canonicalOwner(fields.owner)

      if (id) {
        const { error } = await supabase.from(table).update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from(table).insert(fields)
        if (error) throw error
      }
      return NextResponse.json({ ok: true })
    } catch (e: unknown) {
      return failure(e, `${label} POST`, 'Save failed')
    }
  }

  async function DELETE(req: NextRequest) {
    const auth = await authorizeFinanceRequest(req)
    if (!auth.ok) return auth.response
    try {
      const supabase = getAdminClientInfo().client
      const { id } = await req.json()
      if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
      const { error } = await supabase.from(table).delete().eq('id', id)
      if (error) throw error
      return NextResponse.json({ ok: true })
    } catch (e: unknown) {
      return failure(e, `${label} DELETE`, 'Delete failed')
    }
  }

  return { GET, POST, DELETE }
}
