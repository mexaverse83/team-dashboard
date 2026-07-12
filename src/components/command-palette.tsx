'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, X, type LucideIcon } from 'lucide-react'
import { financeToolSections, primaryFinanceSections, wolffNavItem } from '@/lib/finance-navigation'

interface Destination {
  label: string
  href: string
  group: string
  icon: LucideIcon
  description: string
  keywords?: string[]
}

const DESTINATIONS: Destination[] = [
  { label: 'New transaction', href: '/finance/transactions?add=1', group: 'Actions', icon: Plus, description: 'Record income or spending', keywords: ['add', 'expense', 'income'] },
  { ...wolffNavItem, group: 'Actions' },
  ...primaryFinanceSections.flatMap(section => section.items.map(item => ({ ...item, group: section.label }))),
  ...financeToolSections.flatMap(section => section.items.map(item => ({ ...item, group: section.label }))),
]

export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return DESTINATIONS
    return DESTINATIONS.filter(destination => [
      destination.label,
      destination.description,
      destination.group,
      ...(destination.keywords || []),
    ].some(value => value.toLowerCase().includes(q)))
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

  const closeAndRestoreFocus = useCallback(() => {
    close()
    window.requestAnimationFrame(() => previousFocusRef.current?.focus())
  }, [close])

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
            window.requestAnimationFrame(() => previousFocusRef.current?.focus())
          }
          if (!prev) previousFocusRef.current = document.activeElement as HTMLElement | null
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
    const onDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeAndRestoreFocus()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>('input, button, [href], [tabindex]:not([tabindex="-1"])') || [])]
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onDialogKeyDown)
    return () => {
      document.documentElement.style.overflow = previousOverflow
      document.removeEventListener('keydown', onDialogKeyDown)
    }
  }, [closeAndRestoreFocus, open])

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      closeAndRestoreFocus()
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
      className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm"
      onClick={closeAndRestoreFocus}
      role="presentation"
    >
      <div
        ref={dialogRef}
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
            placeholder="Search pages, actions, or goals…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={onInputKeyDown}
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-[hsl(var(--muted-foreground))]"
          />
          <button type="button" onClick={closeAndRestoreFocus} aria-label="Close command palette" className="rounded-lg p-1.5 text-[hsl(var(--muted-foreground))] hover:bg-white/5 hover:text-white"><X className="h-4 w-4" /></button>
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
                          ? 'bg-blue-500/12 text-blue-200'
                          : 'text-[hsl(var(--foreground))]'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="min-w-0 flex-1"><span className="block truncate">{item.label}</span><span className="block truncate text-[10px] text-[hsl(var(--muted-foreground))]">{item.description}</span></span>
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
