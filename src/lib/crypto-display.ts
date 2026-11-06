// Display currency for the crypto tab. Holdings, cost basis and P/L are kept
// in MXN; USD view converts at the live rate implied by the coin quotes (prices
// themselves come straight from the USD quote). Transactions stay in the MXN
// that was actually paid.
import { formatCoinPrice, formatMoney, type Currency, type FormatMoneyOptions } from '@/lib/format'

export const CRYPTO_CURRENCY_KEY = 'mona:crypto-currency'

export interface CryptoDisplay {
  currency: Currency
  /** An MXN amount in the display currency. */
  amount: (mxn: number) => number
  /** Format an MXN amount in the display currency ('US$' prefix in USD view). */
  money: (mxn: number | null | undefined, opts?: Omit<FormatMoneyOptions, 'currency' | 'showCurrency'>) => string
  /** A coin price in the display currency, or '—' when unpriced. */
  price: (quote: { mxn?: number | null; usd?: number | null } | null | undefined, opts?: { suffix?: boolean }) => string
  /** Props for <MoneyText> so it formats in the display currency. */
  textProps: { currency: Currency; showCurrency: boolean }
}

export function cryptoDisplay(currency: Currency, usdToMxn: number): CryptoDisplay {
  const usd = currency === 'USD'
  const amount = (mxn: number) => (usd && usdToMxn > 0 ? mxn / usdToMxn : mxn)
  return {
    currency,
    amount,
    money: (mxn, opts = {}) => (mxn == null || !Number.isFinite(mxn) ? formatMoney(mxn) : formatMoney(amount(mxn), { ...opts, currency, showCurrency: usd })),
    price: (quote, { suffix = false } = {}) => {
      const p = usd ? quote?.usd : quote?.mxn
      return p != null && p > 0 ? formatCoinPrice(p, { currency, suffix }) : '—'
    },
    textProps: { currency, showCurrency: usd },
  }
}

export function readCryptoCurrency(): Currency {
  try { return window.localStorage.getItem(CRYPTO_CURRENCY_KEY) === 'USD' ? 'USD' : 'MXN' } catch { return 'MXN' }
}

export function saveCryptoCurrency(currency: Currency) {
  try { window.localStorage.setItem(CRYPTO_CURRENCY_KEY, currency) } catch { /* private mode */ }
}
