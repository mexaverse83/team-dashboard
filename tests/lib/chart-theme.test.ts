import { describe, expect, it } from 'vitest'
import {
  CHART,
  chartAnimationProps,
  chartGridProps,
  chartTooltipProps,
  chartYAxisMoneyProps,
  describeSeries,
  moneyTick,
  moneyTooltipFormatter,
  monthTick,
  trimLeadingEmpty,
} from '@/lib/chart-theme'

describe('chart theme', () => {
  it('resolves every colour through CSS variables (works in both themes)', () => {
    const literals = JSON.stringify({ CHART, chartTooltipProps, chartGridProps })
    expect(literals).not.toMatch(/hsl\(\d/)
    expect(literals).not.toMatch(/#[0-9a-f]{3,6}\b/i)
    expect(chartTooltipProps.contentStyle.background).toBe('hsl(var(--popover))')
    expect(chartTooltipProps.labelStyle.color).toBe('hsl(var(--text-secondary))')
  })

  it('grid is horizontal and solid', () => {
    expect(chartGridProps).toMatchObject({ vertical: false, strokeDasharray: '0', stroke: 'hsl(var(--chart-grid))' })
  })

  it('axis formatters', () => {
    expect(monthTick('2026-07', 3)).toBe('Jul')
    expect(monthTick('2026-07', 0)).toBe("Jul '26")
    expect(monthTick('2027-01', 5)).toBe("Jan '27")
    expect(moneyTick(1_000_000)).toBe('$1M')
    expect(moneyTick(25_000)).toBe('$25k')
    expect(moneyTooltipFormatter(83_536)).toBe('$83,536')
    expect(chartYAxisMoneyProps.width).toBe(44)
    expect(chartYAxisMoneyProps.tickCount).toBe(4)
  })

  it('animation follows reduced motion', () => {
    expect(chartAnimationProps()).toEqual({ isAnimationActive: true, animationDuration: 400 })
  })

  it('trims leading empty periods and describes a series', () => {
    const rows = [{ month: '2025-11', income: 0, spend: 0 }, { month: '2025-12', income: 0, spend: 0 }, { month: '2026-01', income: 10, spend: 0 }, { month: '2026-02', income: 0, spend: 0 }]
    expect(trimLeadingEmpty(rows, ['income', 'spend']).map(r => r.month)).toEqual(['2026-01', '2026-02'])
    expect(trimLeadingEmpty([{ a: 0 }], ['a'])).toEqual([])
    expect(describeSeries('Balance', [{ x: '2026-07', y: 120_000 }, { x: '2026-12', y: 98_000 }])).toBe("Balance: $120k in Jul '26 to $98k in Dec '26")
    expect(describeSeries('Balance', [])).toBe('Balance: no data')
  })
})
