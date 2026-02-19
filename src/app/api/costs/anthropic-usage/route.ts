import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })
  }

  try {
    // Use a minimal messages call with max_tokens=1 + claude-haiku-3 (cheapest possible)
    // count_tokens beta doesn't return rate-limit headers; messages endpoint does
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1,
        messages: [{ role: 'user', content: '0' }],
      }),
    })

    // Always capture all headers for debugging
    const allHeaders: Record<string, string> = {}
    res.headers.forEach((val, key) => { allHeaders[key] = val })

    const rateLimitHeaders: Record<string, string> = {}
    Object.entries(allHeaders).forEach(([k, v]) => {
      if (k.startsWith('anthropic-ratelimit') || k.startsWith('x-ratelimit') || k.startsWith('retry-after')) {
        rateLimitHeaders[k] = v
      }
    })

    // If non-200, surface the body so we can diagnose
    if (!res.ok) {
      const body = await res.text().catch(() => '(unreadable)')
      return NextResponse.json({
        ok: false,
        status: res.status,
        error: `Anthropic returned ${res.status}`,
        body,
        rateLimitHeaders,
        allHeaderKeys: Object.keys(allHeaders),
      })
    }

    // Parse the useful rate-limit headers
    const tokensLimit     = parseInt(rateLimitHeaders['anthropic-ratelimit-tokens-limit'] ?? '0', 10)
    const tokensRemaining = parseInt(rateLimitHeaders['anthropic-ratelimit-tokens-remaining'] ?? '0', 10)
    const tokensReset     = rateLimitHeaders['anthropic-ratelimit-tokens-reset'] ?? null

    const inputLimit      = parseInt(rateLimitHeaders['anthropic-ratelimit-input-tokens-limit'] ?? '0', 10)
    const inputRemaining  = parseInt(rateLimitHeaders['anthropic-ratelimit-input-tokens-remaining'] ?? '0', 10)
    const outputLimit     = parseInt(rateLimitHeaders['anthropic-ratelimit-output-tokens-limit'] ?? '0', 10)
    const outputRemaining = parseInt(rateLimitHeaders['anthropic-ratelimit-output-tokens-remaining'] ?? '0', 10)

    const reqLimit     = parseInt(rateLimitHeaders['anthropic-ratelimit-requests-limit'] ?? '0', 10)
    const reqRemaining = parseInt(rateLimitHeaders['anthropic-ratelimit-requests-remaining'] ?? '0', 10)
    const reqReset     = rateLimitHeaders['anthropic-ratelimit-requests-reset'] ?? null

    const tokensUsed = tokensLimit > 0 ? tokensLimit - tokensRemaining : null
    const usedPct    = tokensLimit > 0 ? Math.round(((tokensLimit - tokensRemaining) / tokensLimit) * 100) : null

    return NextResponse.json({
      ok: true,
      status: res.status,
      rateWindow: {
        tokensLimit, tokensRemaining, tokensUsed, usedPct, tokensReset,
        inputLimit, inputRemaining, outputLimit, outputRemaining,
        reqLimit, reqRemaining, reqReset,
      },
      rawHeaders: rateLimitHeaders,
      allHeaderKeys: Object.keys(allHeaders),
    })
  } catch (e) {
    console.error('Anthropic usage error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
