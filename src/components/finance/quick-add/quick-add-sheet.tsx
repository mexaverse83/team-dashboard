'use client'

import { useState } from 'react'
import { AlertTriangle, CalendarDays, ChevronDown, RefreshCw, Sparkles, Trash2, X } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Segmented } from '@/components/ui/segmented'
import { CategoryIcon } from '@/components/ui/category-icon'
import { cn } from '@/lib/utils'
import { OWNERS, getOwnerColor } from '@/lib/owners'
import { PAYMENT_METHODS } from '@/lib/payment-methods'
import { CYCLE_LABELS, suggestCoveragePeriod } from '@/lib/finance-utils'
import { formatDateShort, formatMoney } from '@/lib/format'
import { localDateKey, parseEntryAmount, relativeLocalDateKey } from '@/lib/transaction-entry'
import type { QuickAddData } from './quick-add-data'
import { QUICK_TAGS, useTransactionForm, type QuickAddRequest, type SaveResult } from './use-transaction-form'

// Shared chip styling: every control in the sheet is ≥44px (MOB-02).
const chip = 'inline-flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition-colors'
const chipIdle = 'border-border bg-surface-2 text-fg-secondary hover:border-border-strong hover:text-fg'
const chipOn = 'border-primary bg-primary/15 text-fg'
const label = 'mb-1.5 block text-xs font-medium text-fg-secondary'
const field = 'h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-base text-fg outline-none transition-colors placeholder:text-fg-tertiary focus:border-primary sm:text-sm'

const MOBILE_CATEGORY_SLOTS = 8

export interface QuickAddSheetProps {
  open: boolean
  request: QuickAddRequest | null
  data: QuickAddData | null
  defaultOwner: string
  onClose: () => void
  onSaved: (result: SaveResult) => void
}

export function QuickAddSheet({ open, request, data, defaultOwner, onClose, onSaved }: QuickAddSheetProps) {
  const f = useTransactionForm({ data, defaultOwner, request })
  const { form } = f
  const hasDetails = !!(form.description || f.tags.some(t => !QUICK_TAGS.some(q => q.value === t)) || form.currency === 'USD' || form.is_recurring)
  const [detailsOpen, setDetailsOpen] = useState(hasDetails)

  const today = localDateKey()
  const yesterday = relativeLocalDateKey(-1)
  const customDate = form.transaction_date !== today && form.transaction_date !== yesterday
  const isExpense = form.type === 'expense'

  const cats = f.sortedCategories
  const selectedIndex = cats.findIndex(c => c.id === form.category_id)
  const offGridSelection = selectedIndex >= MOBILE_CATEGORY_SLOTS ? cats[selectedIndex] : null
  const cycle = f.selectedCategory?.billing_cycle
  const showCoverage = (cycle && cycle !== 'monthly') || !!form.coverage_start

  const submit = async () => {
    const result = await f.save()
    if (result) onSaved(result)
  }

  const coverageMonths = (() => {
    if (!form.coverage_start || !form.coverage_end) return 0
    const [sy, sm] = form.coverage_start.split('-').map(Number)
    const [ey, em] = form.coverage_end.split('-').map(Number)
    return Math.max(1, (ey - sy) * 12 + (em - sm) + 1)
  })()
  const perMonth = coverageMonths && form.amount ? parseEntryAmount(form.amount) / coverageMonths : 0

  const title = f.editingId ? 'Edit transaction' : 'New transaction'
  const saveLabel = f.saving ? 'Saving…' : f.confirmDuplicate ? 'Save anyway' : f.editingId ? 'Update transaction' : isExpense ? 'Save expense' : 'Save income'

  return (
    <Modal
      open={open}
      onClose={() => { if (!f.saving) onClose() }}
      title={title}
      mobileFullScreen
      className="quick-add-surface bg-surface sm:h-auto sm:max-w-lg"
      bodyClassName="overflow-y-auto overscroll-contain px-4 py-3 sm:p-5"
      footer={
        <>
          {f.saveError && <div role="alert" className="mb-2 text-sm text-negative">{f.saveError}</div>}
          <div className="flex gap-2">
            {f.editing && request?.onDelete && (
              <button type="button" onClick={() => { request.onDelete?.(f.editing!); onClose() }}
                className={cn(chip, 'h-12 border-transparent px-4 text-negative hover:bg-negative-bg')}>
                <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete
              </button>
            )}
            <button type="submit" form="tx-form" disabled={f.saving || !form.amount || !form.category_id || !form.transaction_date}
              className="btn-primary h-12 flex-1 rounded-xl text-base font-semibold transition-colors disabled:!bg-surface-3 disabled:!text-fg-tertiary disabled:!shadow-none">
              {saveLabel}
            </button>
          </div>
        </>
      }
    >
      <form id="tx-form" onSubmit={e => { e.preventDefault(); void submit() }} className="space-y-4" noValidate>
        {f.possibleDuplicates.length > 0 && !f.editingId && (
          <div className={cn('flex items-start gap-2 rounded-xl border p-3 text-sm',
            f.confirmDuplicate ? 'border-negative/40 bg-negative-bg text-fg' : 'border-warning/40 bg-warning-bg text-fg')}>
            <AlertTriangle className={cn('mt-0.5 h-4 w-4 shrink-0', f.confirmDuplicate ? 'text-negative' : 'text-warning')} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{f.confirmDuplicate ? 'Save anyway?' : 'Possible duplicate'}</p>
              <p className="mt-0.5 text-fg-secondary">
                {f.possibleDuplicates.length} matching transaction{f.possibleDuplicates.length > 1 ? 's' : ''}:{' '}
                {f.possibleDuplicates.slice(0, 2).map((d, i) => (
                  <span key={d.id}>{i > 0 && ', '}<strong className="text-fg">{d.merchant}</strong> {formatMoney(d.amount_mxn)} on {formatDateShort(d.date)}</span>
                ))}
                {f.possibleDuplicates.length > 2 && ` +${f.possibleDuplicates.length - 2} more`}.
                {f.confirmDuplicate && ' Tap Save again to confirm.'}
              </p>
            </div>
          </div>
        )}

        <Segmented
          ariaLabel="Transaction type"
          fullWidth
          value={form.type}
          onChange={value => f.setType(value)}
          options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]}
        />

        <div>
          <label htmlFor="transaction-amount" className={label}>Amount</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-semibold text-fg-tertiary">$</span>
            <input id="transaction-amount" type="text" inputMode="decimal" enterKeyHint="next" autoComplete="off" placeholder="0" value={form.amount}
              autoFocus={!f.editingId}
              onChange={e => { f.updateForm({ amount: e.target.value, amount_mxn: form.currency === 'MXN' ? e.target.value : form.amount_mxn }); f.setSaveError('') }}
              className="num-metric h-16 w-full rounded-2xl border border-border bg-surface-2 pl-10 pr-16 text-3xl font-semibold tracking-tight text-fg outline-none transition-colors placeholder:text-fg-tertiary focus:border-primary" />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-fg-tertiary">{form.currency}</span>
          </div>
        </div>

        <div>
          <label htmlFor="transaction-merchant" className={label}>{isExpense ? 'Where did you spend?' : 'Who paid you?'}</label>
          <input id="transaction-merchant" type="text" list="quick-add-merchants" autoComplete="off" enterKeyHint="done"
            placeholder={isExpense ? 'Merchant or place' : 'Income source'} value={form.merchant}
            onChange={e => f.setMerchant(e.target.value)} className={field} />
          <datalist id="quick-add-merchants">
            {f.knownMerchants.map(m => <option key={m} value={m} />)}
          </datalist>
          {!f.editingId && f.merchantSuggestions.length > 0 && (
            <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Frequent merchants">
              {f.merchantSuggestions.map(s => {
                const hint = s.typicalAmount != null ? formatMoney(s.typicalAmount, { mode: 'compact' }) : null
                const on = form.merchant.trim().toLowerCase() === s.merchant.toLowerCase()
                return (
                  <button key={s.merchant} type="button" aria-pressed={on}
                    aria-label={hint ? `${s.merchant}, usually ${formatMoney(s.typicalAmount)}` : s.merchant}
                    onClick={() => f.chooseSuggestion(s.merchant, s.categoryId, s.typicalAmount)}
                    className={cn(chip, 'max-w-[11rem] shrink-0 font-medium', on ? chipOn : chipIdle)}>
                    <span className="truncate">{s.merchant}</span>
                    {hint && <span className="shrink-0 text-xs font-normal text-fg-tertiary" data-money="">{hint}</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {f.babySuggested && (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 py-1 pl-3 pr-1 text-sm">
            <span aria-hidden="true">👶</span>
            <span className="min-w-0 flex-1 text-fg-secondary">Prenatal or baby purchase?</span>
            <button type="button" onClick={() => f.toggleTag(QUICK_TAGS[0].value)} className={cn(chip, 'h-11 border-transparent px-3 text-primary hover:bg-primary/10')}>Tag as Baby</button>
            <button type="button" aria-label="Dismiss baby suggestion" onClick={f.dismissBaby} className="flex h-11 w-11 items-center justify-center rounded-lg text-fg-tertiary hover:text-fg">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {f.appliedRuleId && (
          <div className="flex items-center gap-2 rounded-xl border border-info/30 bg-info-bg py-1 pl-3 pr-1 text-sm text-fg">
            <Sparkles className="h-4 w-4 shrink-0 text-info" aria-hidden="true" />
            <span className="flex-1">Category picked by your rules</span>
            <button type="button" onClick={f.clearAppliedRule} className="h-11 rounded-lg px-3 font-semibold text-info hover:bg-info/10">Change</button>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between">
            <span id="transaction-category-label" className={label}>Category</span>
            <span className="mb-1.5 text-xs text-fg-tertiary">Frequent first</span>
          </div>
          <div role="group" aria-labelledby="transaction-category-label" className="grid grid-cols-3 gap-2 sm:max-h-[16.5rem] sm:grid-cols-4 sm:overflow-y-auto sm:overscroll-contain sm:pr-1">
            {cats.map((cat, index) => {
              const on = form.category_id === cat.id
              return (
                <button key={cat.id} type="button" aria-pressed={on} onClick={() => f.updateForm({ category_id: cat.id })}
                  className={cn(chip, 'h-[3.75rem] flex-col gap-1 px-1 text-[0.75rem] font-medium leading-tight', on ? chipOn : chipIdle, index >= MOBILE_CATEGORY_SLOTS && 'hidden sm:inline-flex')}>
                  <CategoryIcon name={cat.name} emoji={cat.icon} colorIndex={cat.sort_order} size={22} />
                  <span className="w-full min-w-0 truncate text-center">{cat.name}</span>
                </button>
              )
            })}
            {cats.length > MOBILE_CATEGORY_SLOTS && (
              <div className={cn(chip, 'relative h-[3.75rem] px-2 text-[0.75rem] font-medium sm:hidden', offGridSelection ? chipOn : chipIdle)}>
                <span className="min-w-0 truncate">{offGridSelection ? offGridSelection.name : 'More…'}</span>
                <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
                {/* Native picker stretched over the chip so one tap opens it (iOS won't open a select programmatically). */}
                <select id="transaction-category" aria-label="More categories" value={form.category_id}
                  onChange={e => f.updateForm({ category_id: e.target.value })}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0">
                  <option value="">Choose category</option>
                  {cats.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>

        {f.oneOffSuggested && (
          <div className="rounded-xl border border-border bg-surface-2 p-3 text-sm">
            <p className="font-medium text-fg">Annual or one-off charge?</p>
            <p className="mt-0.5 text-fg-secondary">
              That&apos;s over 3× a usual month of {f.selectedCategory?.name} ({formatMoney(f.categoryMedian)}). Spreading it keeps this month&apos;s budget honest.
            </p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={f.acceptOneOff} className={cn(chip, chipIdle, 'text-fg')}>Spread over 12 months</button>
              <button type="button" onClick={f.dismissOneOff} className={cn(chip, 'border-transparent text-fg-secondary hover:text-fg')}>Keep in this month</button>
            </div>
          </div>
        )}

        <div>
          <span id="transaction-date-label" className={label}>Date</span>
          <div role="group" aria-labelledby="transaction-date-label" className="grid grid-cols-[1fr_1fr_minmax(2.75rem,auto)] gap-2">
            <button type="button" aria-pressed={form.transaction_date === today} onClick={() => f.updateForm({ transaction_date: today })}
              className={cn(chip, form.transaction_date === today ? chipOn : chipIdle)}>Today</button>
            <button type="button" aria-pressed={form.transaction_date === yesterday} onClick={() => f.updateForm({ transaction_date: yesterday })}
              className={cn(chip, form.transaction_date === yesterday ? chipOn : chipIdle)}>Yesterday</button>
            {/* A real date input stretched over the chip: tapping opens the native picker (iOS ignores showPicker on hidden inputs). */}
            <div className={cn(chip, 'relative px-2.5', customDate ? chipOn : chipIdle)}>
              <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
              {customDate && form.transaction_date && <span className="whitespace-nowrap">{formatDateShort(form.transaction_date)}</span>}
              <input id="transaction-date" type="date" value={form.transaction_date} max={today}
                aria-label="Choose transaction date" title="Choose another date"
                onChange={e => { if (e.target.value) f.updateForm({ transaction_date: e.target.value }) }}
                className="absolute -inset-px cursor-pointer appearance-none text-base opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full" />
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div>
            <span id="transaction-owner-label" className={label}>Who</span>
            <div role="group" aria-labelledby="transaction-owner-label" className="grid grid-cols-2 gap-2">
              {OWNERS.map(name => (
                <button key={name} type="button" aria-pressed={form.owner === name} aria-label={`Owner: ${name}`} onClick={() => f.setOwner(name)}
                  className={cn(chip, form.owner === name ? chipOn : chipIdle)}>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: getOwnerColor(name) }} aria-hidden="true" />
                  <span className="truncate">{name}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <span id="transaction-method-label" className={label}>{isExpense ? 'Paid with' : 'Received via'}</span>
            <div role="group" aria-labelledby="transaction-method-label" className="grid grid-cols-4 gap-2">
              {PAYMENT_METHODS.map(m => (
                <button key={m.value} type="button" aria-pressed={form.payment_method === m.value} title={m.label} aria-label={m.label}
                  onClick={() => f.setPaymentMethod(form.payment_method === m.value ? '' : m.value)}
                  className={cn(chip, 'px-1 text-[0.8125rem]', form.payment_method === m.value ? chipOn : chipIdle)}>
                  <span className="truncate">{m.short}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {form.type === 'expense' && QUICK_TAGS.map(tag => {
            const on = f.tags.includes(tag.value)
            return (
              <button key={tag.value} type="button" aria-pressed={on} onClick={() => f.toggleTag(tag.value)}
                className={cn(chip, on ? chipOn : chipIdle)}>
                <span aria-hidden="true">{tag.icon}</span>{tag.label}
              </button>
            )
          })}
          <button type="button" aria-expanded={detailsOpen} aria-controls="quick-add-details" onClick={() => setDetailsOpen(o => !o)}
            className={cn(chip, 'border-transparent text-fg-secondary hover:text-fg')}>
            More details
            <ChevronDown className={cn('h-4 w-4 transition-transform', detailsOpen && 'rotate-180')} aria-hidden="true" />
          </button>
        </div>

        {showCoverage && (
          <div className="space-y-2 rounded-xl border border-border bg-surface-2 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-fg">Period covered{cycle && cycle !== 'monthly' ? ` (${CYCLE_LABELS[cycle]})` : ''}</span>
              {cycle && cycle !== 'monthly' ? (
                <button type="button" onClick={() => {
                  if (!form.transaction_date) return
                  const s = suggestCoveragePeriod(form.transaction_date, cycle)
                  f.updateForm({ coverage_start: s.start, coverage_end: s.end })
                }} className="h-11 rounded-lg px-2 text-sm font-semibold text-info">Auto-fill</button>
              ) : (
                <button type="button" onClick={() => f.updateForm({ coverage_start: '', coverage_end: '' })} className="h-11 rounded-lg px-2 text-sm font-semibold text-fg-secondary hover:text-fg">Undo spread</button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="coverage-start" className="mb-1 block text-xs text-fg-secondary">Starts</label>
                <input id="coverage-start" type="date" value={form.coverage_start} onChange={e => f.updateForm({ coverage_start: e.target.value })} className={field} />
              </div>
              <div>
                <label htmlFor="coverage-end" className="mb-1 block text-xs text-fg-secondary">Ends</label>
                <input id="coverage-end" type="date" value={form.coverage_end} onChange={e => f.updateForm({ coverage_end: e.target.value })} className={field} />
              </div>
            </div>
            {perMonth > 0 && <p className="text-xs text-fg-secondary"><span data-money="">{formatMoney(perMonth)}</span>/mo · {coverageMonths} months</p>}
          </div>
        )}

        {detailsOpen && (
          <div id="quick-add-details" className="space-y-4 border-t border-border pt-4">
            <div>
              <label htmlFor="transaction-notes" className={label}>Notes</label>
              <input id="transaction-notes" placeholder="Optional note" value={form.description} enterKeyHint="done"
                onChange={e => f.updateForm({ description: e.target.value })} className={field} />
            </div>
            <div>
              <label htmlFor="transaction-tags" className={label}>Tags</label>
              <input id="transaction-tags" placeholder="Comma separated" value={form.tags} autoCapitalize="none"
                onChange={e => f.updateForm({ tags: e.target.value })} className={field} />
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" aria-pressed={form.is_recurring} onClick={() => f.updateForm({ is_recurring: !form.is_recurring })}
                className={cn(chip, form.is_recurring ? chipOn : chipIdle)}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" /> Repeats monthly
              </button>
              <button type="button" aria-pressed={form.currency === 'USD'}
                onClick={() => f.updateForm(form.currency === 'USD' ? { currency: 'MXN', amount_mxn: form.amount } : { currency: 'USD', amount_mxn: '' })}
                className={cn(chip, form.currency === 'USD' ? chipOn : chipIdle)}>
                Paid in USD
              </button>
            </div>
            {form.currency === 'USD' && (
              <div>
                <label htmlFor="transaction-amount-mxn" className={label}>Amount in MXN</label>
                <input id="transaction-amount-mxn" type="text" inputMode="decimal" placeholder="Converted amount" value={form.amount_mxn}
                  onChange={e => f.updateForm({ amount_mxn: e.target.value })} className={field} />
              </div>
            )}
          </div>
        )}
      </form>
    </Modal>
  )
}
