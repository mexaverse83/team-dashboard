import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WidgetInstallCard } from '@/components/finance/widget-install-card'

describe('WidgetInstallCard', () => {
  it('downloads the loader for the chosen phone', () => {
    render(<WidgetInstallCard />)
    const link = screen.getByRole('link', { name: /download finance\.js/i })
    expect(link).toHaveAttribute('href', '/api/finance/widget-script?slot=0')
    expect(link).toHaveAttribute('download', 'Finance.js')
    fireEvent.click(screen.getByRole('radio', { name: 'Laura' }))
    expect(link).toHaveAttribute('href', '/api/finance/widget-script?slot=1')
  })

  it('explains the install steps and parameters', () => {
    render(<WidgetInstallCard />)
    expect(screen.getByText(/App Store/)).toBeInTheDocument()
    for (const p of ['coach', 'goals', 'spend', 'quickadd', 'lang=es']) expect(screen.getByText(p)).toBeInTheDocument()
    // One preview per theme (CSS shows the one matching data-theme); both say they are examples.
    const imgs = screen.getAllByRole('img')
    expect(imgs).toHaveLength(2)
    for (const img of imgs) expect(img.getAttribute('alt')).toMatch(/^Example /)
    expect(imgs.map(i => i.getAttribute('alt')).join(' ')).not.toMatch(/\$\d/)
  })
})
