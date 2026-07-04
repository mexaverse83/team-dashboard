'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Wallet,
  ArrowLeftRight,
  PiggyBank,
  RefreshCw,
  Banknote,
  TrendingUp,
  Bitcoin,
  Calculator,
  CreditCard,
  Landmark,
  ShieldCheck,
  Target,
  Sparkles,
  Search,
  FileBarChart,
  Wand2,
  Plus,
  type LucideIcon,
} from 'lucide-react'

interface Destination {
  label: string
  href: string
  group: string
  icon: LucideIcon
}

const DESTINATIONS: Destination[] = [
  { label: 'Overview', href: '/finance', group: 'Track', icon: Wallet },
  { label: 'Transactions', href: '/finance/transactions', group: 'Track', icon: ArrowLeftRight },
  { label: 'Budgets', href: '/finance/budgets', group: 'Track', icon: PiggyBank },
  { label: 'Subscriptions', href: '/finance/subscriptions', group: 'Track', icon: RefreshCw },
  { label: 'Income', href: '/finance/income', group: 'Track', icon: Banknote },
  { label: 'Investments', href: '/finance/investments', group: 'Track', icon: TrendingUp },
  { label: 'Crypto', href: '/finance/crypto', group: 'Track', icon: Bitcoin },
  { label: 'Budget Builder', href: '/finance/budget-builder', group: 'Plan', icon: Calculator },
  { label: 'MSI Tracker', href: '/finance/installments', group: 'Plan', icon: CreditCard },
  { label: 'Debt Planner', href: '/finance/debt', group: 'Plan', icon: Landmark },
  { label: 'Emergency Fund', href: '/finance/emergency-fund', group: 'Plan', icon: ShieldCheck },
  { label: 'Goals', href: '/finance/goals', group: 'Plan', icon: Target },
  { label: 'Insights', href: '/finance/insights', group: 'Analyze', icon: Sparkles },
  { label: 'Audit', href: '/finance/audit', group: 'Analyze', icon: Search },
  { label: 'Reports', href: '/finance/reports', group: 'Analyze', icon: FileBarChart },
  { label: 'Auto Rules', href: '/finance/rules', group: 'Analyze', icon: Wand2 },
  { label: 'New transaction', href: '/finance/transactions', group: 'Actions', icon: Plus },
]

export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return DESTINATIONS
    return DESTINATIONS.filter((d) => d.label.toLowerCase().includes(q))
  }, [query])

  // Group items in display order, tracking flat indices for selection.
  const grouped = useMemo(() => {
    const groups: { group: string; items: { item: Destination; index: number }[] }[] = []
    filtered.forEach((item, index) => {
      const last = groups[groups.length - 1]
      if (last && last.group === item.group) {
        last.items.push({ item, index })
      } else {
        groups.push({ group: item.group, items: [{ item, index }] })
      }
    })
    return groups
  }, [filtered])

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setSelectedIndex(0)
  }, [])

  const navigateTo = useCallback(
    (href: string) => {
      router.push(href)
      close()
    },
    [router, close],
  )

  // Global ⌘K / Ctrl+K listener
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((prev) => {
          if (prev) {
            setQuery('')
            setSelectedIndex(0)
          }
          return !prev
        })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Body scroll lock + autofocus while open
  useEffect(() => {
    if (!open) return
    const previousOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    inputRef.current?.focus()
    return () => {
      document.documentElement.style.overflow = previousOverflow
    }
  }, [open])

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (filtered.length === 0 ? 0 : (prev + 1) % filtered.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) =>
        filtered.length === 0 ? 0 : (prev - 1 + filtered.length) % filtered.length,
      )
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = filtered[selectedIndex]
      if (item) navigateTo(item.href)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
      onClick={close}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="mx-auto mt-[20vh] w-full max-w-lg overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[var(--shadow-elevate)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[hsl(var(--border))] px-4">
          <Search className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            aria-label="Search pages"
            placeholder="Go to page…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={onInputKeyDown}
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-[hsl(var(--muted-foreground))]"
          />
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
              No results
            </p>
          ) : (
            grouped.map(({ group, items }, groupIdx) => (
              <div key={`${group}-${groupIdx}`}>
                <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                  {group}
                </p>
                {items.map(({ item, index }) => {
                  const Icon = item.icon
                  const selected = index === selectedIndex
                  return (
                    <button
                      key={`${item.href}-${item.label}`}
                      type="button"
                      onClick={() => navigateTo(item.href)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                        selected
                          ? 'bg-emerald-500/10 text-emerald-700'
                          : 'text-[hsl(var(--foreground))]'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="flex-1 truncate">{item.label}</span>
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">
                        {item.group}
                      </span>
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        <div className="border-t border-[hsl(var(--border))] px-4 py-2 text-xs text-[hsl(var(--muted-foreground))]">
          <kbd>↑↓</kbd> navigate · <kbd>↵</kbd> open · <kbd>esc</kbd> close
        </div>
      </div>
    </div>
  )
}
