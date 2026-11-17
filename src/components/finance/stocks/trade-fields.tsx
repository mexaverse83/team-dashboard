'use client'

// The buy/sell fields shared by "Add stock" (first buy) and "Log transaction":
// shares, price in USD or MXN, commission, the USD/MXN rate of the day, date,
// broker and notes, with a running total.
import { Segmented } from '@/components/ui/segmented'
import { OwnerAvatar } from '@/components/ui/owner-avatar'
import { localDateKey } from '@/lib/dates'
import { formatMoney } from '@/lib/format'
import { OWNERS, ownersEqual } from '@/lib/owners'
import { cn } from '@/lib/utils'

export const inputClass = 'h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-fg placeholder:text-fg-tertiary'
export const labelClass = 'mb-1 block text-label font-medium text-fg-secondary'

/** GBM's commission on US stocks (Nov 2026 receipt: 0.25%). */
export const GBM_COMMISSION_RATE = 0.0025
export const DEFAULT_BROKER = 'GBM'

export interface TradeForm {
  shares: string
  price: string
  currency: 'USD' | 'MXN'
  commission: string
  /** USD/MXN on the day (USD prices only). */
  fx: string
  date: string
  broker: string
  notes: string
}

// "Today" is read when a form opens, never at module load.
export function emptyTrade(currency: 'USD' | 'MXN' = 'USD'): TradeForm {
  return { shares: '', price: '', currency, commission: '', fx: '', date: localDateKey(), broker: DEFAULT_BROKER, notes: '' }
}

const n = (s: string) => {
  const v = parseFloat(s)
  return Number.isFinite(v) ? v : NaN
}

export function tradeNumbers(f: TradeForm, type: 'buy' | 'sell') {
  const shares = n(f.shares)
  const price = n(f.price)
  const commission = f.commission.trim() ? n(f.commission) : 0
  const fx = f.fx.trim() ? n(f.fx) : NaN
  const valid = shares > 0 && (type === 'sell' ? price >= 0 : price > 0) && commission >= 0 && (!f.fx.trim() || (fx > 5 && fx < 50))
  const gross = shares * price
  const total = type === 'sell' ? gross - commission : gross + commission
  return { shares, price, commission, fx, valid, total }
}

/** The transactions API body for this form (without holding_id). */
export function tradePayload(f: TradeForm, type: 'buy' | 'sell') {
  const t = tradeNumbers(f, type)
  return {
    type,
    shares: t.shares,
    price: t.price,
    price_currency: f.currency,
    commission: t.commission,
    ...(Number.isFinite(t.fx) ? { fx_usd_mxn: t.fx } : {}),
    transaction_date: f.date || localDateKey(),
    broker: f.broker.trim() || null,
    notes: f.notes.trim() || null,
  }
}

export function OwnerPicker({ value, onChange, label = 'Owner' }: { value: string; onChange: (owner: string) => void; label?: string }) {
  return (
    <Segmented ariaLabel={label} size="sm" fullWidth value={OWNERS.find(o => ownersEqual(o, value)) ?? OWNERS[0]} onChange={onChange}
      options={OWNERS.map(o => ({ value: o, label: o, icon: <OwnerAvatar owner={o} size={16} aria-hidden /> }))} />
  )
}

interface TradeFieldsProps {
  idPrefix: string
  form: TradeForm
  onChange: (next: TradeForm) => void
  type: 'buy' | 'sell'
  /** Live USD/MXN (placeholder for the rate and the MXN preview). */
  usdToMxn: number
  /** Today's price in the listing currency, if known. */
  nowHint?: string | null
  showNotes?: boolean
}

export function TradeFields({ idPrefix, form, onChange, type, usdToMxn, nowHint, showNotes = true }: TradeFieldsProps) {
  const set = (patch: Partial<TradeForm>) => onChange({ ...form, ...patch })
  const t = tradeNumbers(form, type)
  const rate = Number.isFinite(t.fx) && t.fx > 0 ? t.fx : usdToMxn
  const totalOk = t.shares > 0 && t.price > 0 && Number.isFinite(t.total)
  const gbmFee = t.shares > 0 && t.price > 0 ? Math.round(t.shares * t.price * GBM_COMMISSION_RATE * 100) / 100 : null

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${idPrefix}-shares`} className={labelClass}>Shares *</label>
          <input id={`${idPrefix}-shares`} type="number" inputMode="decimal" step="any" min="0" placeholder="0.34692423" value={form.shares}
            onChange={e => set({ shares: e.target.value })} className={cn(inputClass, 'num font-mono')} />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-price`} className={labelClass}>Price per share *</label>
          <div className="flex gap-2">
            <input id={`${idPrefix}-price`} type="number" inputMode="decimal" step="any" min="0" placeholder={form.currency === 'USD' ? '153.81' : '2,850'} value={form.price}
              onChange={e => set({ price: e.target.value })} className={cn(inputClass, 'tabular-nums min-w-0 flex-1 font-mono')} />
            <Segmented ariaLabel="Price currency" size="sm" value={form.currency} onChange={currency => set({ currency })}
              options={[{ value: 'USD', label: 'USD' }, { value: 'MXN', label: 'MXN' }]} />
          </div>
          {nowHint && <p className="mt-1 text-label text-fg-tertiary">Now {nowHint}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${idPrefix}-commission`} className={labelClass}>Commission ({form.currency})</label>
          <input id={`${idPrefix}-commission`} type="number" inputMode="decimal" step="any" min="0" placeholder="0.13" value={form.commission}
            onChange={e => set({ commission: e.target.value })} className={cn(inputClass, 'tabular-nums font-mono')} />
          {gbmFee !== null && (
            <button type="button" className="mt-1 min-h-11 text-label font-medium text-fg-secondary underline-offset-2 hover:text-fg hover:underline sm:min-h-0"
              onClick={() => set({ commission: String(gbmFee) })}>
              Use GBM 0.25% ({formatMoney(gbmFee, { currency: form.currency, showCurrency: true, mode: 'precise' })})
            </button>
          )}
        </div>
        {form.currency === 'USD' && (
          <div>
            <label htmlFor={`${idPrefix}-fx`} className={labelClass}>USD/MXN that day</label>
            <input id={`${idPrefix}-fx`} type="number" inputMode="decimal" step="any" min="0" placeholder={usdToMxn > 0 ? usdToMxn.toFixed(4) : '18.50'} value={form.fx}
              onChange={e => set({ fx: e.target.value })} className={cn(inputClass, 'tabular-nums font-mono')} />
            <p className="mt-1 text-label text-fg-tertiary">Blank uses today’s rate. Keeps the MXN cost right.</p>
          </div>
        )}
      </div>

      <div className="rounded-xl bg-surface-2 p-3">
        <p className="text-label text-fg-secondary">{type === 'sell' ? 'You receive' : 'Total paid'} ({form.currency}, incl. commission)</p>
        <p className="tabular-nums text-lg font-semibold" data-money="">
          {totalOk ? formatMoney(t.total, { currency: form.currency, showCurrency: true, mode: 'precise' }) : '—'}
        </p>
        {totalOk && form.currency === 'USD' && rate > 0 && (
          <p className="text-label text-fg-tertiary" data-money="">≈ {formatMoney(t.total * rate)} at {rate.toFixed(2)} MXN/USD</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${idPrefix}-date`} className={labelClass}>Date</label>
          <input id={`${idPrefix}-date`} type="date" value={form.date} onChange={e => set({ date: e.target.value })} className={inputClass} />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-broker`} className={labelClass}>Broker</label>
          <input id={`${idPrefix}-broker`} type="text" value={form.broker} placeholder="GBM" onChange={e => set({ broker: e.target.value })} className={inputClass} />
        </div>
      </div>
      {showNotes && (
        <div>
          <label htmlFor={`${idPrefix}-notes`} className={labelClass}>Notes</label>
          <input id={`${idPrefix}-notes`} type="text" placeholder="Optional" value={form.notes} onChange={e => set({ notes: e.target.value })} className={inputClass} />
        </div>
      )}
    </div>
  )
}
