import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })
  }

  try {
    // Use count_tokens — free endpoint, no tokens consumed, but still returns rate-limit headers
    const res = await fetch('https://api.anthropic.com/v1/messages/count_tokens', {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'token-counting-2024-11-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        messages: [{ role: 'user', content: 'ping' }],
      }),
    })

    // Harvest every anthropic rate-limit header
    const headers: Record<string, string> = {}
    res.headers.forEach((val, key) => {
      if (key.startsWith('anthropic-ratelimit')) headers[key] = val
    })

    // Parse the useful ones
    const tokensLimit     = parseInt(headers['anthropic-ratelimit-tokens-limit'] ?? '0', 10)
    const tokensRemaining = parseInt(headers['anthropic-ratelimit-tokens-remaining'] ?? '0', 10)
    const tokensReset     = headers['anthropic-ratelimit-tokens-reset'] ?? null

    const inputLimit     = parseInt(headers['anthropic-ratelimit-input-tokens-limit'] ?? '0', 10)
    const inputRemaining = parseInt(headers['anthropic-ratelimit-input-tokens-remaining'] ?? '0', 10)
    const outputLimit    = parseInt(headers['anthropic-ratelimit-output-tokens-limit'] ?? '0', 10)
    const outputRemaining= parseInt(headers['anthropic-ratelimit-output-tokens-remaining'] ?? '0', 10)

    const reqLimit     = parseInt(headers['anthropic-ratelimit-requests-limit'] ?? '0', 10)
    const reqRemaining = parseInt(headers['anthropic-ratelimit-requests-remaining'] ?? '0', 10)
    const reqReset     = headers['anthropic-ratelimit-requests-reset'] ?? null

    const tokensUsed = tokensLimit > 0 ? tokensLimit - tokensRemaining : null
    const usedPct    = tokensLimit > 0 ? Math.round(((tokensLimit - tokensRemaining) / tokensLimit) * 100) : null

    return NextResponse.json({
      ok: true,
      status: res.status,
      rateWindow: {
        tokensLimit,
        tokensRemaining,
        tokensUsed,
        usedPct,
        tokensReset,
        inputLimit,
        inputRemaining,
        outputLimit,
        outputRemaining,
        reqLimit,
        reqRemaining,
        reqReset,
      },
      rawHeaders: headers,
    })
  } catch (e) {
    console.error('Anthropic usage error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
