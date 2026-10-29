'use client'

// Form state + save logic for the quick-add sheet (CH-08). Rules auto-apply,
// the duplicate check and the draftId guard behave exactly like the old
// transactions page; suggestions/one-off/baby hints are new (MOB-15, UX-06, MOB-03).
import { useCallback, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { FinanceTransaction } from '@/lib/finance-types'
import type { QuickAddPrefill } from '@/lib/finance-events'
import { applyRules, detectDuplicates } from '@/lib/finance-rules'
import { BABY_PLAN_TAG } from '@/lib/baby-plan'
import { canonicalOwner } from '@/lib/owners'
import {
  categoryMonthlyMedian, localDateKey, looksLikeOneOff, parseEntryAmount, prioritizeCategories,
  rankMerchantSuggestions, readLastPaymentMethod, spreadCoverage, suggestsBabyTag, writeLastPaymentMethod,
} from '@/lib/transaction-entry'
import type { QuickAddData, QuickAddHistoryRow } from './quick-add-data'

export interface QuickAddRequest extends QuickAddPrefill {
  /** Open the sheet in edit mode for this row. */
  editTransaction?: FinanceTransaction | null
  /** Edit mode only: show Delete and hand the row back (the list owns undo). */
  onDelete?: (tx: FinanceTransaction) => void
}

export interface TxForm {
  type: 'expense' | 'income'
  amount: string
  currency: string
  amount_mxn: string
  category_id: string
  merchant: string
  description: string
  transaction_date: string
  tags: string
  is_recurring: boolean
  coverage_start: string
  coverage_end: string
  owner: string
  payment_method: string
}

export const QUICK_TAGS: { value: string; icon: string; label: string }[] = [
  { value: BABY_PLAN_TAG, icon: '👶', label: 'Baby' },
]

export function parseTagString(s: string): string[] {
  return s.split(',').map(t => t.trim()).filter(Boolean)
}

function serializeTags(tags: string[]): string {
  return tags.join(', ')
}

function notifyWolff(body: Record<string, unknown>) {
  fetch('/api/finance/wolff-events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_id: crypto.randomUUID(), ...body }),
  }).catch(() => {})
}

function initialForm(request: QuickAddRequest | null, defaultOwner: string): TxForm {
  const tx = request?.editTransaction
  if (tx) {
    return {
      type: tx.type,
      amount: tx.amount.toString(),
      currency: tx.currency,
      amount_mxn: tx.amount_mxn.toString(),
      category_id: tx.category_id,
      merchant: tx.merchant || '',
      description: tx.description || '',
      transaction_date: tx.transaction_date,
      tags: tx.tags?.join(', ') || '',
      is_recurring: tx.is_recurring,
      coverage_start: tx.coverage_start || '',
      coverage_end: tx.coverage_end || '',
      owner: canonicalOwner(tx.owner) || defaultOwner,
      payment_method: tx.payment_method || '',
    }
  }
  const amount = request?.amount != null && Number.isFinite(request.amount) && request.amount > 0 ? String(request.amount) : ''
  const owner = defaultOwner
  return {
    type: request?.type ?? 'expense',
    amount,
    currency: 'MXN',
    amount_mxn: amount,
    category_id: request?.categoryId ?? '',
    merchant: request?.merchant ?? '',
    description: '',
    transaction_date: request?.date && /^\d{4}-\d{2}-\d{2}$/.test(request.date) ? request.date : localDateKey(),
    tags: request?.tags?.length ? serializeTags(request.tags) : '',
    is_recurring: false,
    coverage_start: '',
    coverage_end: '',
    owner,
    payment_method: readLastPaymentMethod(owner),
  }
}

export type SaveResult = { kind: 'created' | 'updated'; row: QuickAddHistoryRow; type: TxForm['type'] }

export function useTransactionForm({ data, defaultOwner, request }: { data: QuickAddData | null; defaultOwner: string; request: QuickAddRequest | null }) {
  const editing = request?.editTransaction ?? null
  const editingId = editing?.id ?? null
  const [form, setForm] = useState<TxForm>(() => initialForm(request, defaultOwner))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [appliedRuleId, setAppliedRuleId] = useState<string | null>(null)
  const [confirmDuplicate, setConfirmDuplicate] = useState(false)
  const [babyDismissed, setBabyDismissed] = useState(false)
  const [oneOffDismissed, setOneOffDismissed] = useState(false)
  const [ruleRejectedFor, setRuleRejectedFor] = useState('')
  const methodTouched = useRef(!!editing)
  const saveInFlight = useRef(false)
  // Category picked from the merchant's history (not by the person), so a new merchant can replace it.
  const [historyCategory, setHistoryCategory] = useState('')
  const draftId = useRef<string | null>(editing ? null : crypto.randomUUID())

  const categories = useMemo(() => data?.categories ?? [], [data])
  const rules = useMemo(() => data?.rules ?? [], [data])
  const history = useMemo(() => data?.history ?? [], [data])

  // Owner arrives after auth resolves; fill it (and their usual card) if still empty.
  const [ownerSeed, setOwnerSeed] = useState(defaultOwner)
  if (ownerSeed !== defaultOwner) {
    setOwnerSeed(defaultOwner)
    if (!editingId && defaultOwner && !form.owner) {
      setForm({ ...form, owner: defaultOwner, payment_method: form.payment_method || readLastPaymentMethod(defaultOwner) })
    }
  }

  const updateForm = useCallback((patch: Partial<TxForm>) => {
    if ('category_id' in patch) setHistoryCategory('')
    setConfirmDuplicate(false)
    setForm(f => ({ ...f, ...patch }))
  }, [])

  const setOwner = useCallback((owner: string) => {
    setConfirmDuplicate(false)
    setForm(f => ({ ...f, owner, payment_method: methodTouched.current ? f.payment_method : (readLastPaymentMethod(owner) || f.payment_method) }))
  }, [])

  const setPaymentMethod = useCallback((method: string) => {
    methodTouched.current = true
    updateForm({ payment_method: method })
  }, [updateForm])

  const entryAmount = parseEntryAmount(form.currency === 'USD' ? form.amount_mxn : form.amount)

  // Auto-apply a rule when merchant + amount are set and no category is chosen (new entries
  // only), unless the person just rejected the rule's pick for this merchant.
  const ruleKey = editingId || form.category_id || !form.merchant || !Number.isFinite(entryAmount)
    || form.merchant.trim().toLowerCase() === ruleRejectedFor
    ? '' : `${form.merchant}|${entryAmount}|${form.owner}|${rules.length}`
  const [lastRuleKey, setLastRuleKey] = useState('')
  if (ruleKey !== lastRuleKey) {
    setLastRuleKey(ruleKey)
    const match = ruleKey ? applyRules(rules, { merchant: form.merchant, amount_mxn: entryAmount, owner: form.owner }) : null
    if (match) {
      setForm({ ...form, category_id: match.category_id })
      setAppliedRuleId(match.rule_id)
    }
  }

  // A known merchant (deep link, typed or picked) brings its usual category when no rule
  // decided one, so `?add=1&m=Heb&a=250` is ready to save (MOB-01). Once per merchant.
  const merchantCategories = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of rankMerchantSuggestions(history, form.type, { limit: 1000 })) {
      if (s.categoryId) map.set(s.merchant.toLocaleLowerCase(), s.categoryId)
    }
    return map
  }, [history, form.type])
  const historyKey = editingId || form.category_id || !form.merchant.trim() ? '' : `${form.type}|${form.merchant.trim().toLocaleLowerCase()}|${merchantCategories.size}`
  const [lastHistoryKey, setLastHistoryKey] = useState('')
  if (historyKey !== lastHistoryKey) {
    setLastHistoryKey(historyKey)
    const merchantKey = form.merchant.trim().toLocaleLowerCase()
    const categoryId = historyKey && merchantKey !== ruleRejectedFor ? merchantCategories.get(merchantKey) : undefined
    const ruleWouldMatch = categoryId && applyRules(rules, { merchant: form.merchant, amount_mxn: Number.isFinite(entryAmount) ? entryAmount : 0, owner: form.owner })
    if (categoryId && !ruleWouldMatch && categories.some(c => c.id === categoryId)) {
      setHistoryCategory(categoryId)
      setForm({ ...form, category_id: categoryId })
    }
  }

  // Same merchant + amount within 3 days.
  const possibleDuplicates = useMemo(() => {
    if (editingId || !form.merchant || !form.amount || !form.transaction_date) return []
    if (!Number.isFinite(entryAmount) || entryAmount <= 0) return []
    return detectDuplicates(
      { transaction_date: form.transaction_date, merchant: form.merchant, amount_mxn: entryAmount },
      history.filter(t => t.type === form.type).map(t => ({ id: t.id, transaction_date: t.transaction_date, merchant: t.merchant, amount_mxn: t.amount_mxn })),
    )
  }, [form.merchant, form.amount, entryAmount, form.type, form.transaction_date, history, editingId])

  const merchantSuggestions = useMemo(() => rankMerchantSuggestions(history, form.type), [history, form.type])

  const knownMerchants = useMemo(() => {
    const set = new Set<string>()
    history.forEach(t => { if (t.merchant) set.add(t.merchant) })
    return Array.from(set).sort()
  }, [history])

  const sortedCategories = useMemo(
    () => prioritizeCategories(categories, history as FinanceTransaction[], form.type),
    [categories, history, form.type],
  )
  const selectedCategory = categories.find(c => c.id === form.category_id)

  const tags = parseTagString(form.tags)
  const toggleTag = (value: string) => {
    updateForm({ tags: serializeTags(tags.includes(value) ? tags.filter(t => t !== value) : [...tags, value]) })
  }

  const babySuggested = form.type === 'expense' && !babyDismissed && !tags.includes(BABY_PLAN_TAG)
    && suggestsBabyTag(form.merchant, form.description)

  const categoryMedian = useMemo(
    () => form.type === 'expense' && form.category_id ? categoryMonthlyMedian(history, form.category_id) : 0,
    [history, form.category_id, form.type],
  )
  const cycle = selectedCategory?.billing_cycle
  const oneOffSuggested = !editingId && !oneOffDismissed && form.type === 'expense' && !form.coverage_start
    && (!cycle || cycle === 'monthly') && looksLikeOneOff(entryAmount, categoryMedian)

  const acceptOneOff = () => {
    const window = spreadCoverage(form.transaction_date || localDateKey(), 12)
    updateForm({ coverage_start: window.start, coverage_end: window.end })
  }

  const chooseSuggestion = (merchant: string, categoryId: string, typicalAmount: number | null) => {
    setAppliedRuleId(null)
    setConfirmDuplicate(false)
    setForm(f => ({
      ...f,
      merchant,
      category_id: categoryId || f.category_id,
      ...(f.amount || typicalAmount == null ? {} : { amount: String(typicalAmount), amount_mxn: f.currency === 'MXN' ? String(typicalAmount) : f.amount_mxn }),
    }))
  }

  const setMerchant = (merchant: string) => {
    const autoCategory = !!appliedRuleId || (!!historyCategory && form.category_id === historyCategory)
    updateForm({ merchant, ...(autoCategory ? { category_id: '' } : {}) })
    if (appliedRuleId) setAppliedRuleId(null)
  }

  const setType = (type: TxForm['type']) => {
    updateForm({ type, category_id: '' })
    setAppliedRuleId(null)
  }

  const clearAppliedRule = () => {
    setRuleRejectedFor(form.merchant.trim().toLowerCase())
    setAppliedRuleId(null)
    setForm(f => ({ ...f, category_id: '' }))
  }

  const save = async (): Promise<SaveResult | null> => {
    if (saveInFlight.current) return null
    setSaveError('')
    const amt = parseEntryAmount(form.amount)
    if (!Number.isFinite(amt) || amt <= 0) {
      setSaveError('Enter an amount greater than zero.')
      return null
    }
    if (!form.transaction_date) {
      setSaveError('Choose a transaction date.')
      return null
    }
    if (!categories.some(category => category.id === form.category_id && (category.type === form.type || category.type === 'both'))) {
      setSaveError('Choose a category for this transaction type.')
      return null
    }
    if (form.currency === 'USD' && (!Number.isFinite(parseEntryAmount(form.amount_mxn)) || parseEntryAmount(form.amount_mxn) <= 0)) {
      setSaveError('Enter the converted amount in MXN.')
      return null
    }
    if (possibleDuplicates.length > 0 && !confirmDuplicate && !editingId) {
      setConfirmDuplicate(true)
      return null
    }
    saveInFlight.current = true
    setSaving(true)
    try {
      const amtMxn = form.currency === 'USD' && form.amount_mxn ? parseEntryAmount(form.amount_mxn) : amt
      const record: Record<string, unknown> = {
        type: form.type,
        amount: amt,
        currency: form.currency,
        amount_mxn: amtMxn,
        category_id: form.category_id || null,
        merchant: form.merchant.trim() || null,
        description: form.description || null,
        transaction_date: form.transaction_date,
        tags: parseTagString(form.tags),
        is_recurring: form.is_recurring,
        owner: canonicalOwner(form.owner) || null,
        payment_method: form.payment_method || null,
        coverage_start: form.coverage_start || null,
        coverage_end: form.coverage_end || null,
      }
      const event = {
        type: form.type,
        amount_mxn: amtMxn,
        category_id: form.category_id || null,
        category_name: selectedCategory?.name || null,
        merchant: form.merchant.trim() || null,
        transaction_date: form.transaction_date,
        is_recurring: form.is_recurring,
      }

      let id: string
      if (editingId) {
        const { error } = await supabase.from('finance_transactions').update(record).eq('id', editingId)
        if (error) { setSaveError(`Could not save: ${error.message}`); return null }
        id = editingId
        notifyWolff({ kind: 'updated', transaction_id: id, ...event })
      } else {
        id = draftId.current ??= crypto.randomUUID()
        const { error } = await supabase.from('finance_transactions').insert({ ...record, id })
        if (error) {
          setSaveError(error.code === '23505' ? 'This transaction may already be saved. Close this form and check your history before adding another.' : `Could not save: ${error.message}`)
          return null
        }
        notifyWolff({ kind: 'created', transaction_id: id, ...event })
        if (appliedRuleId) {
          const rule = rules.find(r => r.id === appliedRuleId)
          if (rule) {
            fetch('/api/finance/rules', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: appliedRuleId, match_count: rule.match_count + 1, last_matched_at: new Date().toISOString() }),
            }).catch(() => {})
          }
        }
      }
      writeLastPaymentMethod(form.owner, form.payment_method)
      return {
        kind: editingId ? 'updated' : 'created',
        type: form.type,
        row: { id, type: form.type, merchant: form.merchant.trim() || null, description: form.description || null, category_id: form.category_id, amount_mxn: amtMxn, transaction_date: form.transaction_date },
      }
    } catch {
      setSaveError('Could not confirm the save. Check your connection and transaction history before retrying.')
      return null
    } finally {
      saveInFlight.current = false
      setSaving(false)
    }
  }

  return {
    form, updateForm, setOwner, setPaymentMethod, setMerchant, setType, chooseSuggestion, toggleTag, tags,
    editing, editingId, saving, saveError, setSaveError, save,
    appliedRuleId, clearAppliedRule, confirmDuplicate, possibleDuplicates,
    merchantSuggestions, knownMerchants, sortedCategories, selectedCategory, categories,
    babySuggested, dismissBaby: () => setBabyDismissed(true),
    oneOffSuggested, categoryMedian, acceptOneOff, dismissOneOff: () => setOneOffDismissed(true),
  }
}

export type TransactionFormApi = ReturnType<typeof useTransactionForm>
