// App-wide window events (plan §3). Producers dispatch, consumers subscribe
// through useResumeRefresh / QuickAddHost; nobody imports another stream's component.
export const FINANCE_EVENTS = {
  /** Open the global quick-add sheet. detail: QuickAddPrefill */
  quickAdd: 'finance:quick-add',
  /** Something was written (transaction saved/deleted, budget edited): refetch. */
  dataChanged: 'finance:data-changed',
  /** User asked for fresh data (pull-to-refresh): refetch now. */
  refresh: 'finance:refresh',
} as const

export type FinanceEventName = (typeof FINANCE_EVENTS)[keyof typeof FINANCE_EVENTS]

export interface QuickAddPrefill {
  merchant?: string
  amount?: number
  categoryId?: string
  type?: 'expense' | 'income'
  date?: string
  tags?: string[]
}

export interface DataChangedDetail {
  /** Table or area that changed, e.g. 'finance_transactions'. */
  source?: string
}

export function dispatchFinanceEvent(name: FinanceEventName, detail?: unknown): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(name, { detail }))
}

export function onFinanceEvent<T = unknown>(name: FinanceEventName, handler: (detail: T) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const listener = (event: Event) => handler((event as CustomEvent<T>).detail)
  window.addEventListener(name, listener)
  return () => window.removeEventListener(name, listener)
}
