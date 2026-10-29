import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CommandPalette } from '@/components/command-palette'
import { FINANCE_EVENTS } from '@/lib/finance-events'

const navigation = vi.hoisted(() => ({ push: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: navigation.push }),
}))

const open = () => fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
const search = (q: string) => fireEvent.change(screen.getByRole('textbox', { name: 'Search pages' }), { target: { value: q } })

describe('Command palette navigation', () => {
  beforeEach(() => navigation.push.mockReset())
  afterEach(() => vi.restoreAllMocks())

  it('opens with Ctrl+K and searches labels, descriptions, and keywords', () => {
    render(<CommandPalette />)
    open()
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument()
    search('gbm')
    expect(screen.getByRole('button', { name: /Investments/ })).toBeInTheDocument()
  })

  it('mirrors the nav tree in its groups', () => {
    render(<CommandPalette />)
    open()
    for (const group of ['Actions', 'Home', 'Activity', 'Plan', 'Wealth', 'Mona', 'More', 'Shortcuts']) {
      expect(screen.getByText(group, { selector: 'p' })).toBeInTheDocument()
    }
  })

  it('finds Crypto as a shortcut into Investments', () => {
    render(<CommandPalette />)
    open()
    search('bitcoin')
    fireEvent.click(screen.getByRole('button', { name: /Crypto/ }))
    expect(navigation.push).toHaveBeenCalledWith('/finance/investments?tab=Crypto')
  })

  it('Add expense falls back to the transactions deep link when no quick-add sheet is mounted', () => {
    render(<CommandPalette />)
    open()
    fireEvent.click(screen.getByRole('button', { name: /Add expense/ }))
    expect(navigation.push).toHaveBeenCalledWith('/finance/transactions?add=1')
  })

  it('Add expense opens the global sheet in place when its host claims the event', () => {
    const host = (event: Event) => event.preventDefault()
    window.addEventListener(FINANCE_EVENTS.quickAdd, host)
    render(<CommandPalette />)
    open()
    fireEvent.click(screen.getByRole('button', { name: /Add expense/ }))
    expect(navigation.push).not.toHaveBeenCalled()
    window.removeEventListener(FINANCE_EVENTS.quickAdd, host)
  })

  it('offers the baby tagging action', () => {
    render(<CommandPalette />)
    open()
    fireEvent.click(screen.getByRole('button', { name: /Tag baby expenses/ }))
    expect(navigation.push).toHaveBeenCalledWith('/finance/family#baby-review')
  })
})
