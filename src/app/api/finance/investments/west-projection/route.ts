import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'
import { getWestProjection, WestTargetNotFoundError } from '@/lib/server/west'
import { ConfigError, configErrorResponse, getAdminClientInfo, withDegradedHeader } from '@/lib/supabase-admin'

const numberParam = (value: string | null) => {
  const n = value ? parseFloat(value) : NaN
  return Number.isFinite(n) ? n : undefined
}

export async function GET(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response

  try {
    const { client, degraded } = getAdminClientInfo()
    const projection = await getWestProjection(client, {
      rate: numberParam(req.nextUrl.searchParams.get('rate')),
      cryptoGrowth: numberParam(req.nextUrl.searchParams.get('cryptoGrowth')),
    })
    return withDegradedHeader(NextResponse.json(projection, { headers: { 'Cache-Control': 'private, no-store' } }), degraded)
  } catch (e: unknown) {
    if (e instanceof ConfigError) return configErrorResponse(e)
    if (e instanceof WestTargetNotFoundError) {
      return NextResponse.json({ error: 'No active target found' }, { status: 404 })
    }
    console.error('WEST projection error:', e)
    return NextResponse.json({ error: 'Projection failed' }, { status: 500 })
  }
}
