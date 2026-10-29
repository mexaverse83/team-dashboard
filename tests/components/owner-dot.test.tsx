import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OwnerBar, OwnerDot } from '@/components/finance/owner-dot'
import { ownerColor, getOwnerColor } from '@/lib/owners'
import { TrendBadge } from '@/components/ui/trend-badge'

describe('OwnerDot (VIS-11)', () => {
  it('canonicalizes lowercase owners instead of falling through to Shared', () => {
    const { container } = render(<OwnerDot owner="bernardo" showLabel />)
    expect(screen.getByText('Bernardo')).toBeInTheDocument()
    const dot = container.querySelector('[data-owner] > span') as HTMLElement
    expect(dot.style.background).toBe('hsl(var(--owner-a))')
  })

  it('maps Laura to owner-b and unknown/joint owners to Shared', () => {
    const { container, rerender } = render(<OwnerDot owner="LAURA" showLabel />)
    expect(screen.getByText('Laura')).toBeInTheDocument()
    expect((container.querySelector('[data-owner] > span') as HTMLElement).style.background).toBe('hsl(var(--owner-b))')
    rerender(<OwnerDot owner="joint" showLabel />)
    expect(screen.getByText('Shared')).toBeInTheDocument()
    expect((container.querySelector('[data-owner] > span') as HTMLElement).style.background).toBe('hsl(var(--owner-shared))')
  })

  it('renders nothing without an owner', () => {
    const { container } = render(<OwnerDot owner={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('OwnerBar uses owner tokens and formatted money', () => {
    render(<OwnerBar bernardo={1500} laura={500} />)
    expect(screen.getByText('$1,500')).toBeInTheDocument()
    expect(screen.getByText('$500')).toBeInTheDocument()
  })

  it('owner colours are theme tokens in any casing', () => {
    expect(ownerColor('bernardo')).toBe('hsl(var(--owner-a))')
    expect(getOwnerColor('Laura')).toBe('hsl(var(--owner-b))')
    expect(ownerColor(undefined)).toBe('hsl(var(--owner-shared))')
    // Legacy callers keep their neutral fallback for unknown owners.
    expect(getOwnerColor('joint')).toBe('hsl(var(--text-tertiary))')
  })
})

describe('TrendBadge invert', () => {
  it('keeps the real sign but colours a rise as bad', () => {
    const { container } = render(<TrendBadge value={43} invert />)
    expect(screen.getByText('+43%')).toBeInTheDocument()
    expect(container.firstChild).toHaveClass('text-negative')
  })
})
