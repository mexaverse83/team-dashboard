import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'
import { getWestProjection, WestTargetNotFoundError } from '@/lib/server/west'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  // Anon fallback mirrors the summary route: lets local dev (no service key)
  // serve the projection; production always has the service role.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error(`Missing env: URL=${!!url} KEY=${!!key}`)
  return createClient(url, key)
}

const numberParam = (value: string | null) => (value ? parseFloat(value) : undefined)

export async function GET(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response

  try {
    const projection = await getWestProjection(getSupabase(), {
      rate: numberParam(req.nextUrl.searchParams.get('rate')),
      cryptoGrowth: numberParam(req.nextUrl.searchParams.get('cryptoGrowth')),
    })
    return NextResponse.json(projection)
  } catch (e: unknown) {
    if (e instanceof WestTargetNotFoundError) {
      return NextResponse.json({ error: 'No active target found' }, { status: 404 })
    }
    console.error('WEST projection error:', e)
    return NextResponse.json({ error: 'Projection failed' }, { status: 500 })
  }
}
