import { describe, expect, it } from 'vitest'
import {
  coinpaprikaIdFor, holdingCoinId, isPendingCoinMigrationError, normalizeCoingeckoId, normalizeSymbol, resolveCoinIds,
} from '@/lib/crypto-coins'

describe('crypto coin identity', () => {
  it('normalizes tickers to the stored format and rejects junk', () => {
    expect(normalizeSymbol(' pepe ')).toBe('PEPE')
    expect(normalizeSymbol('1inch')).toBe('1INCH')
    expect(normalizeSymbol('USDC.E')).toBe('USDC.E')
    expect(normalizeSymbol('')).toBeNull()
    expect(normalizeSymbol('BTC; drop table')).toBeNull()
    expect(normalizeSymbol('A'.repeat(16))).toBeNull()
    expect(normalizeSymbol(42)).toBeNull()
  })

  it('accepts CoinGecko slugs only', () => {
    expect(normalizeCoingeckoId('Dogecoin')).toBe('dogecoin')
    expect(normalizeCoingeckoId('aerodrome-finance')).toBe('aerodrome-finance')
    expect(normalizeCoingeckoId('../simple/price')).toBeNull()
    expect(normalizeCoingeckoId('a b')).toBeNull()
  })

  it("resolves ids: a row's own coingecko_id wins, built-ins fill in, unknown tickers drop out", () => {
    expect(resolveCoinIds(['BTC', { symbol: 'PEPE', coingecko_id: 'pepe' }, 'NOPE', { symbol: 'ZZZ' }])).toEqual({ BTC: 'bitcoin', PEPE: 'pepe' })
    // A holding that re-uses a built-in ticker for another coin is priced as that coin.
    expect(resolveCoinIds(['LIT', { symbol: 'LIT', coingecko_id: 'litentry' }])).toEqual({ LIT: 'litentry' })
    expect(resolveCoinIds([{ symbol: 'lit', coingecko_id: 'litentry' }, 'LIT'])).toEqual({ LIT: 'litentry' })
    // Pre-migration rows have no coingecko_id at all.
    expect(resolveCoinIds([{ symbol: 'KAS', quantity: 3 } as { symbol: string }])).toEqual({ KAS: 'kaspa' })
  })

  it('knows which coin a stored holding is', () => {
    expect(holdingCoinId({ symbol: 'SOL' })).toBe('solana')
    expect(holdingCoinId({ symbol: 'SOL', coingecko_id: null })).toBe('solana')
    expect(holdingCoinId({ symbol: 'PEPE', coingecko_id: 'pepe' })).toBe('pepe')
    expect(holdingCoinId({ symbol: 'PEPE' })).toBeNull()
  })

  it('guesses Coinpaprika ids for non-built-in coins', () => {
    expect(coinpaprikaIdFor('BTC', 'bitcoin')).toBe('btc-bitcoin')
    expect(coinpaprikaIdFor('DOGE', 'dogecoin')).toBe('doge-dogecoin')
    expect(coinpaprikaIdFor('LIT', 'litentry')).toBe('lit-litentry')
  })

  it('recognizes the errors of a database without the any-coin migration', () => {
    expect(isPendingCoinMigrationError({ code: 'PGRST204', message: "Could not find the 'coingecko_id' column of 'finance_crypto_holdings' in the schema cache" })).toBe(true)
    expect(isPendingCoinMigrationError({ code: '42703', message: 'column "coingecko_id" of relation "finance_crypto_holdings" does not exist' })).toBe(true)
    expect(isPendingCoinMigrationError({ code: '23514', message: 'new row for relation "finance_crypto_holdings" violates check constraint "finance_crypto_holdings_symbol_check"' })).toBe(true)
    expect(isPendingCoinMigrationError({ code: '23505', message: 'duplicate key' })).toBe(false)
    expect(isPendingCoinMigrationError({ code: '42703', message: 'column "foo" does not exist' })).toBe(false)
    expect(isPendingCoinMigrationError(null)).toBe(false)
  })
})
