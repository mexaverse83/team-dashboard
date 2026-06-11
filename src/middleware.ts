import { NextRequest, NextResponse } from 'next/server'

// Finance-only app: every host serves the finance dashboard.
// Short URLs (/transactions, /budgets, …) rewrite to /finance/*.

// Paths that are always allowed (static assets, API infra)
const PASSTHROUGH_PREFIXES = ['/_next', '/api/', '/favicon']

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PASSTHROUGH_PREFIXES.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Root redirects via app/page.tsx; /finance/* serves directly
  if (pathname === '/' || pathname.startsWith('/finance')) {
    return NextResponse.next()
  }

  // Short URLs: /transactions → /finance/transactions
  const url = req.nextUrl.clone()
  url.pathname = `/finance${pathname}`
  return NextResponse.rewrite(url)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
