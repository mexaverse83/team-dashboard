/**
 * Unit Tests — V2 Phase 2 Components (ThemedCharts)
 * Agent-only components (AgentActivityRing, DataFlash, StreamingProgress)
 * were removed with the agent dashboard.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock recharts for themed-charts
vi.mock('recharts', () => ({
  AreaChart: ({ children }: any) => <div data-testid="area-chart">{children}</div>,
  Area: () => <div data-testid="area" />,
  RadialBarChart: ({ children }: any) => <div data-testid="radial-bar-chart">{children}</div>,
  RadialBar: () => <div data-testid="radial-bar" />,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  Tooltip: () => null,
}))

import { ThemedAreaChart, ThemedRadialChart, CHART_COLORS } from '@/components/ui/themed-charts'

// ── ThemedAreaChart ──

describe('ThemedAreaChart', () => {
  const data = [{ value: 10 }, { value: 20 }, { value: 30 }]

  it('renders area chart', () => {
    render(<ThemedAreaChart data={data} dataKey="value" />)
    expect(screen.getByTestId('area-chart')).toBeInTheDocument()
    expect(screen.getByTestId('area')).toBeInTheDocument()
  })

  it('renders with default height', () => {
    const { container } = render(<ThemedAreaChart data={data} dataKey="value" />)
    // ResponsiveContainer is mocked, just verify render
    expect(container.firstChild).toBeInTheDocument()
  })
})

// ── ThemedRadialChart ──

describe('ThemedRadialChart', () => {
  it('renders radial bar chart', () => {
    render(<ThemedRadialChart value={75} />)
    expect(screen.getByTestId('radial-bar-chart')).toBeInTheDocument()
  })

  it('renders label when provided', () => {
    render(<ThemedRadialChart value={75} label="75%" />)
    expect(screen.getByText('75%')).toBeInTheDocument()
  })

  it('does not render label when not provided', () => {
    const { container } = render(<ThemedRadialChart value={50} />)
    // No label overlay
    const labelDiv = container.querySelector('.absolute.inset-0')
    expect(labelDiv).toBeNull()
  })
})

// ── CHART_COLORS ──

describe('CHART_COLORS', () => {
  it('exports legacy palette colors still used by charts', () => {
    expect(CHART_COLORS.tars).toBeTruthy()
    expect(CHART_COLORS.cooper).toBeTruthy()
    expect(CHART_COLORS.murph).toBeTruthy()
    expect(CHART_COLORS.mann).toBeTruthy()
    expect(CHART_COLORS.tom).toBeTruthy()
  })

  it('exports brand color', () => {
    expect(CHART_COLORS.brand).toBeTruthy()
  })

  it('exports semantic colors', () => {
    expect(CHART_COLORS.success).toBeTruthy()
    expect(CHART_COLORS.warning).toBeTruthy()
    expect(CHART_COLORS.danger).toBeTruthy()
  })
})
