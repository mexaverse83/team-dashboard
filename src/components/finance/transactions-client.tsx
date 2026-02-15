'use client'

import { useState, useEffect, useMemo } from 'react'
import { Search, Calendar } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'
import { GlassCard } from '@/components/ui/glass-card'
import { PageTransition } from '@/components/page-transition'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import { SEED_CATEGORIES, SEED_TRANSACTIONS, enrichTransactions } from '@/lib/seed-finance'
import type { FinanceCategory, FinanceTransaction } from '@/lib/finance-types'

export default function TransactionsClient() {
  const [categories, setCategories] = useState<FinanceCategory[]>([])
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([])
  const [typeFilter, setTypeFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const perPage = 25

  useEffect(() => {
    Promise.all([
      supabase.from('finance_categories').select('*').order('sort_order'),
      supabase.from('finance_transactions').select('*').order('transaction_date', { ascending: false }),
    ]).then(([catRes, txRes]) => {
      const cats = catRes.data && catRes.data.length > 0 ? catRes.data : SEED_CATEGORIES
      const txs = txRes.data && txRes.data.length > 0 ? txRes.data : SEED_TRANSACTIONS
      setCategories(cats)
      setTransactions(enrichTransactions(txs, cats))
      setLoading(false)
    })
  }, [])

  const filtered = useMemo(() => {
    return transactions.filter(t => {
      if (typeFilter !== 'all' && t.type !== typeFilter) return false
      if (categoryFilter && t.category_id !== categoryFilter) return false
      if (search) {
        const q = search.toLowerCase()
        if (!(t.merchant?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q) || t.category?.name.toLowerCase().includes(q))) return false
      }
      return true
    })
  }, [transactions, typeFilter, categoryFilter, search])

  const totalPages = Math.ceil(filtered.length / perPage)
  const paginated = filtered.slice((page - 1) * perPage, page * perPage)

  if (loading) return <div className="h-8 w-48 rounded bg-[hsl(var(--muted))] animate-pulse" />

  return (
    <PageTransition>
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Transactions</h1>
        <p className="text-[hsl(var(--text-secondary))]">All income and expenses</p>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-[hsl(var(--bg-elevated))]/50 border border-[hsl(var(--border))]">
        <select
          value={categoryFilter}
          onChange={e => { setCategoryFilter(e.target.value); setPage(1) }}
          className="px-3 py-1.5 rounded-lg bg-[hsl(var(--bg-elevated))] text-xs border-none outline-none"
        >
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </select>

        <div className="flex items-center gap-1 p-1 rounded-lg bg-[hsl(var(--bg-elevated))]">
          {['all', 'expense', 'income'].map(t => (
            <button key={t} onClick={() => { setTypeFilter(t); setPage(1) }}
              className={cn("px-2.5 py-1 rounded-md text-xs font-medium transition-all",
                typeFilter === t ? "bg-blue-600 text-white" : "text-[hsl(var(--text-secondary))]"
              )}>
              {t === 'all' ? 'All' : t === 'expense' ? '↓ Expenses' : '↑ Income'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[hsl(var(--bg-elevated))] flex-1 min-w-[150px]">
          <Search className="h-3.5 w-3.5 text-[hsl(var(--text-tertiary))]" />
          <input
            placeholder="Search merchants, notes..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="bg-transparent text-xs flex-1 outline-none"
          />
        </div>
      </div>

      {/* Table */}
      <GlassCard>
        {paginated.length === 0 ? (
          <EmptyState icon="inbox" title="No transactions" description="No transactions match your filters" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[hsl(var(--border))]">
                    {['Date', 'Merchant', 'Amount', 'Category', 'Tags'].map(h => (
                      <th key={h} className="text-left text-xs font-medium text-[hsl(var(--text-secondary))] uppercase tracking-wider py-3 px-4">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(tx => (
                    <tr key={tx.id} className="border-b border-[hsl(var(--border))] last:border-0 hover:bg-[hsl(var(--bg-elevated))]/50 transition-colors">
                      <td className="py-3 px-4 text-sm text-[hsl(var(--text-secondary))]">{tx.transaction_date.slice(5)}</td>
                      <td className="py-3 px-4">
                        <p className="text-sm font-medium">{tx.merchant || '—'}</p>
                        {tx.description && <p className="text-xs text-[hsl(var(--text-tertiary))] truncate max-w-[200px]">{tx.description}</p>}
                      </td>
                      <td className="py-3 px-4">
                        <span className={cn("text-sm font-semibold", tx.type === 'income' ? "text-emerald-400" : "text-rose-400")}>
                          {tx.type === 'income' ? '+' : '-'}${tx.amount_mxn.toLocaleString()}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs"
                          style={{ background: `${tx.category?.color || '#6B7280'}20`, color: tx.category?.color }}>
                          {tx.category?.icon} {tx.category?.name}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-1">
                          {tx.tags?.map(tag => (
                            <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-[hsl(var(--bg-elevated))] text-[hsl(var(--text-tertiary))]">{tag}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            <div className="flex items-center justify-between pt-4 border-t border-[hsl(var(--border))]">
              <span className="text-xs text-[hsl(var(--text-tertiary))]">{filtered.length} transactions</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded text-xs disabled:opacity-30">◀</button>
                <span className="text-xs">Page {page} of {totalPages || 1}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1 rounded text-xs disabled:opacity-30">▶</button>
              </div>
            </div>
          </>
        )}
      </GlassCard>
    </div>
    </PageTransition>
  )
}
