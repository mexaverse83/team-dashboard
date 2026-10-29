import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { authorizeWidgetRequest } from '@/lib/widget-auth'
import { WIDGET_SOURCE } from '@/widget/finance-widget.source'

// The widget's full logic, fetched by the tiny loader installed on the phones
// (see widget-script). It lives as a plain script in src/widget so the
// harness can run and screenshot it; design changes deploy here and reach
// every phone without a re-download. Expects API_URL / APP_URL and
// WIDGET_TOKEN (or the legacy API_KEY) from the loader. Bundled as a string
// (finance-widget.source.ts) so nothing has to be read from disk at runtime.
const SOURCE = WIDGET_SOURCE
const ETAG = `"${createHash('sha1').update(SOURCE).digest('hex').slice(0, 16)}"`

export async function GET(req: NextRequest) {
  const auth = await authorizeWidgetRequest(req)
  if (!auth.ok) return auth.response

  const headers = {
    'Content-Type': 'text/javascript; charset=utf-8',
    'Cache-Control': 'no-cache',
    ETag: ETAG,
  }
  if (req.headers.get('if-none-match') === ETAG) return new NextResponse(null, { status: 304, headers })
  return new NextResponse(SOURCE, { headers })
}
