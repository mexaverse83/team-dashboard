// Module-scope cache for the global quick-add sheet (MOB-01): categories,
// rules and a narrow ~200-day history window (suggestions, duplicate check,
// one-off median). Never the full ledger. Shared across route visits.
import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/supabase-fetch-all'
import { DEFAULT_CATEGORIES } from '@/lib/finance-utils'
import { addDaysKey, localDateKey } from '@/lib/dates'
import type { FinanceCategory, FinanceTransaction } from '@/lib/finance-types'
import type { FinanceRule } from '@/lib/finance-rules'

export type QuickAddHistoryRow = Pick<FinanceTransaction, 'id' | 'type' | 'merchant' | 'description' | 'category_id' | 'amount_mxn' | 'transaction_date'>

export interface QuickAddData {
  categories: FinanceCategory[]
  rules: FinanceRule[]
  history: QuickAddHistoryRow[]
}

const HISTORY_DAYS = 200
const HISTORY_COLUMNS = 'id,type,merchant,description,category_id,amount_mxn,transaction_date'
const STALE_MS = 5 * 60_000

let cache: (QuickAddData & { loadedAt: number; rulesLoaded: boolean }) | null = null
let inflight: Promise<QuickAddData> | null = null

export function peekQuickAddData(): QuickAddData | null {
  return cache
}

async function loadRules(): Promise<FinanceRule[]> {
  try {
    const res = await fetch('/api/finance/rules')
    if (!res.ok) return []
    const body = await res.json()
    return Array.isArray(body?.rules) ? body.rules : []
  } catch {
    return []
  }
}

export function loadQuickAddData({ force = false }: { force?: boolean } = {}): Promise<QuickAddData> {
  if (inflight) return inflight
  if (!force && cache && cache.categories.length > 0 && Date.now() - cache.loadedAt < STALE_MS) {
    if (cache.rulesLoaded) return Promise.resolve(cache)
    // Primed by a page: only the rules are missing.
    inflight = loadRules()
      .then(rules => { cache = { ...cache!, rules, rulesLoaded: true }; return cache })
      .finally(() => { inflight = null })
    return inflight
  }
  const since = addDaysKey(localDateKey(), -HISTORY_DAYS)
  inflight = (async () => {
    try {
      const [catRes, history, rules] = await Promise.all([
        supabase.from('finance_categories').select('*').order('sort_order'),
        fetchAllRows<QuickAddHistoryRow>((from, to) => supabase.from('finance_transactions').select(HISTORY_COLUMNS)
          .gte('transaction_date', since).order('transaction_date', { ascending: false }).order('id').range(from, to), 1000, 5000, true)
          .catch(() => cache?.history ?? []),
        loadRules(),
      ])
      const categories = catRes.data && catRes.data.length > 0 ? catRes.data as FinanceCategory[] : (cache?.categories?.length ? cache.categories : DEFAULT_CATEGORIES)
      cache = { categories, rules, history, loadedAt: Date.now(), rulesLoaded: true }
      return cache
    } finally {
      inflight = null
    }
  })()
  return inflight
}

/**
 * A page that already holds categories / the ledger hands them over so the
 * sheet opens with data synchronously (the Transactions page).
 */
export function primeQuickAddData(data: Partial<QuickAddData>): void {
  cache = {
    categories: data.categories ?? cache?.categories ?? [],
    rules: data.rules ?? cache?.rules ?? [],
    history: data.history ?? cache?.history ?? [],
    loadedAt: data.history || !cache ? Date.now() : cache.loadedAt,
    rulesLoaded: data.rules ? true : (cache?.rulesLoaded ?? false),
  }
}

/** Keep suggestions and the duplicate check current after a save. */
export function rememberSavedTransaction(row: QuickAddHistoryRow): void {
  if (!cache) return
  cache = { ...cache, history: [row, ...cache.history.filter(r => r.id !== row.id)] }
}

export function resetQuickAddDataForTests(): void {
  cache = null
  inflight = null
}
