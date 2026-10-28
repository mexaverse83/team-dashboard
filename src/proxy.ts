import { NextRequest, NextResponse } from 'next/server'

// Finance-only app: every host serves the finance dashboard.
// Short URLs (/transactions, /budgets, …) rewrite to /finance/*.
// Next 16 "proxy" convention (formerly middleware.ts). The matcher keeps API
// routes and static/PWA assets out entirely, so it only runs for pages.
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

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
  matcher: ['/((?!api/|_next/|icons/|brand/|sw\\.js|manifest\\.webmanifest|offline\\.html|favicon|wolff-mark\\.svg|robots\\.txt).*)'],
}
