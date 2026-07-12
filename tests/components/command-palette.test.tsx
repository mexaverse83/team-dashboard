import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CommandPalette } from '@/components/command-palette'

const navigation = vi.hoisted(() => ({ push: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: navigation.push }),
}))

describe('Command palette navigation', () => {
  beforeEach(() => navigation.push.mockReset())

  it('opens with Ctrl+K and searches labels, descriptions, and keywords', () => {
    render(<CommandPalette />)
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: 'Search pages' }), { target: { value: 'WEST' } })
    expect(screen.getByRole('button', { name: /Investments/ })).toBeInTheDocument()
  })

  it('opens the transaction form directly from its primary action', () => {
    render(<CommandPalette />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    fireEvent.click(screen.getByRole('button', { name: /New transaction/ }))
    expect(navigation.push).toHaveBeenCalledWith('/finance/transactions?add=1')
  })
})
