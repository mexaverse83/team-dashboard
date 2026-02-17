import { NextRequest, NextResponse } from 'next/server'

const FINANCE_HOST = 'finance.autonomis.co'
const DASHBOARD_HOST = 'dashboard.autonomis.co'

// Paths that are always allowed (static assets, API infra)
const PASSTHROUGH_PREFIXES = ['/_next', '/api/', '/avatars', '/favicon']

function isPassthrough(pathname: string) {
  return PASSTHROUGH_PREFIXES.some(p => pathname.startsWith(p))
}

export function middleware(req: NextRequest) {
  const host = req.headers.get('host') || ''
  const { pathname } = req.nextUrl

  if (isPassthrough(pathname)) {
    // On dashboard domain, block /api/finance/* (except process-recurring for cron)
    if (host === DASHBOARD_HOST && pathname.startsWith('/api/finance') && !pathname.includes('process-recurring')) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.next()
  }

  // ── finance.autonomis.co ──
  if (host === FINANCE_HOST) {
    // Root → /finance overview
    if (pathname === '/') {
      const url = req.nextUrl.clone()
      url.pathname = '/finance'
      return NextResponse.rewrite(url)
    }

    // Already under /finance → allow
    if (pathname.startsWith('/finance')) {
      return NextResponse.next()
    }

    // Short URLs: /transactions → /finance/transactions
    const url = req.nextUrl.clone()
    url.pathname = `/finance${pathname}`
    return NextResponse.rewrite(url)
  }

  // ── dashboard.autonomis.co ──
  if (host === DASHBOARD_HOST) {
    // Block all /finance/* pages
    if (pathname.startsWith('/finance')) {
      const url = req.nextUrl.clone()
      url.pathname = '/'
      return NextResponse.redirect(url)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
