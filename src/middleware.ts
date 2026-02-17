import { NextRequest, NextResponse } from 'next/server'

const FINANCE_HOST = 'finance.autonomis.co'

export function middleware(req: NextRequest) {
  const host = req.headers.get('host') || ''
  const { pathname } = req.nextUrl

  // finance.autonomis.co → serve finance pages
  if (host === FINANCE_HOST) {
    // Root → /finance
    if (pathname === '/') {
      const url = req.nextUrl.clone()
      url.pathname = '/finance'
      return NextResponse.rewrite(url)
    }

    // /api/finance/* → pass through (already correct path)
    if (pathname.startsWith('/api/finance')) {
      return NextResponse.next()
    }

    // /transactions → /finance/transactions (short URLs on subdomain)
    if (!pathname.startsWith('/finance') && !pathname.startsWith('/_next') && !pathname.startsWith('/api') && !pathname.startsWith('/avatars') && !pathname.startsWith('/favicon')) {
      const url = req.nextUrl.clone()
      url.pathname = `/finance${pathname}`
      return NextResponse.rewrite(url)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
