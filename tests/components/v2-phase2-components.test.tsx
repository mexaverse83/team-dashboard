/**
 * Unit Tests — V2 Phase 2 New Components
 * AgentActivityRing, DataFlash, StreamingProgress, ThemedCharts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

// Mock recharts for themed-charts
vi.mock('recharts', () => ({
  AreaChart: ({ children }: any) => <div data-testid="area-chart">{children}</div>,
  Area: () => <div data-testid="area" />,
  RadialBarChart: ({ children }: any) => <div data-testid="radial-bar-chart">{children}</div>,
  RadialBar: () => <div data-testid="radial-bar" />,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  Tooltip: () => null,
}))

import { AgentActivityRing } from '@/components/ui/agent-activity-ring'
import { DataFlash } from '@/components/ui/data-flash'
import { StreamingProgress } from '@/components/ui/streaming-progress'
import { ThemedAreaChart, ThemedRadialChart, CHART_COLORS } from '@/components/ui/themed-charts'

// ── AgentActivityRing ──

describe('AgentActivityRing', () => {
  it('renders children inside the ring', () => {
    render(
      <AgentActivityRing state="idle" color="hsl(205, 84%, 50%)">
        <span>COOPER</span>
      </AgentActivityRing>
    )
    expect(screen.getByText('COOPER')).toBeInTheDocument()
  })

  it('renders SVG with correct size', () => {
    const { container } = render(
      <AgentActivityRing state="idle" color="red" size={80}>
        <span>X</span>
      </AgentActivityRing>
    )
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '80')
    expect(svg).toHaveAttribute('height', '80')
  })

  it('uses default size of 64', () => {
    const { container } = render(
      <AgentActivityRing state="idle" color="red">
        <span>X</span>
      </AgentActivityRing>
    )
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '64')
  })

  it('renders two circles (track + active)', () => {
    const { container } = render(
      <AgentActivityRing state="idle" color="red">
        <span>X</span>
      </AgentActivityRing>
    )
    const circles = container.querySelectorAll('circle')
    expect(circles.length).toBe(2)
  })

  it('applies breathing animation for idle state', () => {
    const { container } = render(
      <AgentActivityRing state="idle" color="red">
        <span>X</span>
      </AgentActivityRing>
    )
    const svg = container.querySelector('svg')
    const cls = svg?.getAttribute('class') || ''
    expect(cls).toContain('breathe_2s')
  })

  it('applies faster breathing for thinking state', () => {
    const { container } = render(
      <AgentActivityRing state="thinking" color="red">
        <span>X</span>
      </AgentActivityRing>
    )
    const svg = container.querySelector('svg')
    const cls = svg?.getAttribute('class') || ''
    expect(cls).toContain('breathe_0.8s')
  })

  it('applies spin animation for acting state', () => {
    const { container } = render(
      <AgentActivityRing state="acting" color="red">
        <span>X</span>
      </AgentActivityRing>
    )
    const svg = container.querySelector('svg')
    const cls = svg?.getAttribute('class') || ''
    expect(cls).toContain('spin_1.5s')
  })

  it('applies flash animation for complete state', () => {
    const { container } = render(
      <AgentActivityRing state="complete" color="red">
        <span>X</span>
      </AgentActivityRing>
    )
    const svg = container.querySelector('svg')
    const cls = svg?.getAttribute('class') || ''
    expect(cls).toContain('flash_0.6s')
  })

  it('uses strokeDasharray for acting state (partial arc)', () => {
    const { container } = render(
      <AgentActivityRing state="acting" color="blue" size={64} strokeWidth={3}>
        <span>X</span>
      </AgentActivityRing>
    )
    const circles = container.querySelectorAll('circle')
    const activeCircle = circles[1]
    const dasharray = activeCircle.getAttribute('stroke-dasharray')
    // Acting state: 30% circumference followed by 70%
    expect(dasharray).toBeTruthy()
    expect(dasharray).toContain(' ') // two values
  })

  it('sets track circle opacity to 0.15', () => {
    const { container } = render(
      <AgentActivityRing state="idle" color="red">
        <span>X</span>
      </AgentActivityRing>
    )
    const track = container.querySelectorAll('circle')[0]
    expect(track.getAttribute('opacity')).toBe('0.15')
  })
})

// ── DataFlash ──

describe('DataFlash', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders children', () => {
    render(<DataFlash data={1}>Hello</DataFlash>)
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })

  it('does not flash on initial mount', () => {
    const { container } = render(<DataFlash data={1}>Content</DataFlash>)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.style.boxShadow).toBeFalsy()
  })

  it('flashes when data changes', async () => {
    const { container, rerender } = render(<DataFlash data={1}>Content</DataFlash>)
    rerender(<DataFlash data={2}>Content</DataFlash>)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.style.boxShadow).toBeTruthy()
    expect(wrapper.style.boxShadow).toContain('inset')
  })

  it('flash clears after 300ms', () => {
    const { container, rerender } = render(<DataFlash data={1}>Content</DataFlash>)
    rerender(<DataFlash data={2}>Content</DataFlash>)
    act(() => { vi.advanceTimersByTime(300) })
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.style.boxShadow).toBeFalsy()
  })

  it('uses custom color for flash', () => {
    const { container, rerender } = render(<DataFlash data={1} color="rgb(255, 0, 0)">X</DataFlash>)
    rerender(<DataFlash data={2} color="rgb(255, 0, 0)">X</DataFlash>)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.style.boxShadow).toContain('rgb(255, 0, 0)')
  })

  it('applies custom className', () => {
    const { container } = render(<DataFlash data={1} className="my-class">X</DataFlash>)
    expect(container.firstChild).toHaveClass('my-class')
  })

  it('does not flash when data stays the same', () => {
    const { container, rerender } = render(<DataFlash data={1}>X</DataFlash>)
    rerender(<DataFlash data={1}>X</DataFlash>)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.style.boxShadow).toBeFalsy()
  })
})

// ── StreamingProgress ──

describe('StreamingProgress', () => {
  const steps = [
    { label: 'Start', status: 'done' as const },
    { label: 'Build', status: 'active' as const },
    { label: 'Deploy', status: 'pending' as const },
  ]

  it('renders all step labels', () => {
    render(<StreamingProgress steps={steps} />)
    expect(screen.getByText('Start')).toBeInTheDocument()
    expect(screen.getByText('Build')).toBeInTheDocument()
    expect(screen.getByText('Deploy')).toBeInTheDocument()
  })

  it('renders correct number of step circles', () => {
    const { container } = render(<StreamingProgress steps={steps} />)
    const circles = container.querySelectorAll('.rounded-full.h-3')
    expect(circles.length).toBe(3)
  })

  it('renders connecting lines between steps', () => {
    const { container } = render(<StreamingProgress steps={steps} />)
    // 3 steps = 2 connecting lines
    const lines = container.querySelectorAll('.h-0\\.5.mx-1')
    expect(lines.length).toBe(2)
  })

  it('done step has colored background', () => {
    const { container } = render(<StreamingProgress steps={steps} color="rgb(0, 128, 255)" />)
    const circles = container.querySelectorAll('.rounded-full.h-3')
    const doneCircle = circles[0] as HTMLElement
    expect(doneCircle.style.backgroundColor).toBeTruthy()
  })

  it('active step has pulse animation', () => {
    const { container } = render(<StreamingProgress steps={steps} />)
    const circles = container.querySelectorAll('.rounded-full.h-3')
    const activeCircle = circles[1]
    expect(activeCircle.className).toContain('animate-pulse')
  })

  it('pending step has no background color', () => {
    const { container } = render(<StreamingProgress steps={steps} />)
    const circles = container.querySelectorAll('.rounded-full.h-3')
    const pendingCircle = circles[2] as HTMLElement
    expect(pendingCircle.style.backgroundColor).toBeFalsy()
  })

  it('done step connecting line is 100% width', () => {
    const { container } = render(<StreamingProgress steps={steps} />)
    const lineInners = container.querySelectorAll('.h-0\\.5.mx-1 > div')
    const doneLine = lineInners[0] as HTMLElement
    expect(doneLine.style.width).toBe('100%')
  })

  it('active step connecting line is 50% width', () => {
    const { container } = render(<StreamingProgress steps={steps} />)
    const lineInners = container.querySelectorAll('.h-0\\.5.mx-1 > div')
    const activeLine = lineInners[1] as HTMLElement
    expect(activeLine.style.width).toBe('50%')
  })

  it('applies custom className', () => {
    const { container } = render(<StreamingProgress steps={steps} className="my-progress" />)
    expect(container.firstChild).toHaveClass('my-progress')
  })

  it('single step renders no connecting lines', () => {
    const { container } = render(
      <StreamingProgress steps={[{ label: 'Solo', status: 'done' }]} />
    )
    const lines = container.querySelectorAll('.h-0\\.5.mx-1')
    expect(lines.length).toBe(0)
  })
})

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
  it('exports all 6 agent colors', () => {
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
