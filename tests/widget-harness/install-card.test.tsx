import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WidgetInstallCard } from '@/components/finance/widget-install-card'

describe('WidgetInstallCard', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('explains the missing read tokens instead of offering a download that would fail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ready: false, message: 'Set WIDGET_READ_TOKENS (one per phone) in Vercel, then download again.' }), { status: 200 })))
    render(<WidgetInstallCard />)
    expect(await screen.findByRole('status')).toHaveTextContent(/WIDGET_READ_TOKENS/)
    expect(screen.queryByRole('link', { name: /download finance\.js/i })).not.toBeInTheDocument()
  })

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
