import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TickerBadge, stockLogoUrl } from '@/components/finance/stocks/ticker-badge'

describe('TickerBadge', () => {
  it('shows the company logo for a ticker', () => {
    const { container } = render(<TickerBadge ticker="NVDA" />)
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://financialmodelingprep.com/image-stock/NVDA.png')
  })

  it('keeps Mexican tickers whole', () => {
    expect(stockLogoUrl('walmex.mx')).toBe('https://financialmodelingprep.com/image-stock/WALMEX.MX.png')
    expect(stockLogoUrl('../etc')).toBeNull()
  })

  it('falls back to the initials when the logo is missing', () => {
    const { container, getByText } = render(<TickerBadge ticker="ZZZQ" />)
    fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('img')).toBeNull()
    expect(getByText('ZZZ')).toBeInTheDocument()
  })
})
