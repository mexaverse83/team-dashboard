import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock recharts
vi.mock('recharts', () => ({
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  Line: () => <div data-testid="line" />,
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
}))

import { GlassCard } from '@/components/ui/glass-card'
import { StatusIndicator } from '@/components/ui/status-indicator'
import { TrendBadge } from '@/components/ui/trend-badge'
import { AgentAvatar } from '@/components/ui/agent-avatar'
import { RadialProgress } from '@/components/ui/radial-progress'
import { SparklineChart } from '@/components/ui/sparkline-chart'
import { AnimatedNumber } from '@/components/ui/animated-number'

// ── GlassCard ──
describe('GlassCard', () => {
  it('renders children', () => {
    render(<GlassCard>Hello</GlassCard>)
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })

  it('applies glass class', () => {
    const { container } = render(<GlassCard>Test</GlassCard>)
    expect(container.firstChild).toHaveClass('glass')
  })

  it('applies custom className', () => {
    const { container } = render(<GlassCard className="custom">Test</GlassCard>)
    expect(container.firstChild).toHaveClass('custom')
  })

  it('applies glow animation when glowColor is set', () => {
    const { container } = render(<GlassCard glowColor="red">Test</GlassCard>)
    const el = container.firstChild as HTMLElement
    expect(el.style.getPropertyValue('--glow-color')).toBe('red')
    expect(el.style.animation).toContain('agentGlow')
  })

  it('does NOT apply glow when no glowColor', () => {
    const { container } = render(<GlassCard>Test</GlassCard>)
    const el = container.firstChild as HTMLElement
    expect(el.style.animation).toBe('')
  })
})

// ── StatusIndicator ──
describe('StatusIndicator', () => {
  it('renders online status with pulse', () => {
    const { container } = render(<StatusIndicator status="online" />)
    const dot = container.querySelector('span span')!
    expect(dot).toHaveClass('bg-emerald-500')
    expect(dot).toHaveClass('status-online')
  })

  it('renders busy status with pulse', () => {
    const { container } = render(<StatusIndicator status="busy" />)
    const dot = container.querySelector('span span')!
    expect(dot).toHaveClass('bg-yellow-500')
    expect(dot).toHaveClass('status-online')
  })

  it('renders offline status without pulse', () => {
    const { container } = render(<StatusIndicator status="offline" />)
    const dot = container.querySelector('span span')!
    expect(dot).toHaveClass('bg-gray-500')
    expect(dot).not.toHaveClass('status-online')
  })

  it('shows label when label=true', () => {
    render(<StatusIndicator status="online" label />)
    expect(screen.getByText('Online')).toBeInTheDocument()
  })

  it('hides label by default', () => {
    render(<StatusIndicator status="online" />)
    expect(screen.queryByText('Online')).not.toBeInTheDocument()
  })

  it('shows correct label text for each status', () => {
    const { rerender } = render(<StatusIndicator status="online" label />)
    expect(screen.getByText('Online')).toBeInTheDocument()
    rerender(<StatusIndicator status="busy" label />)
    expect(screen.getByText('Busy')).toBeInTheDocument()
    rerender(<StatusIndicator status="offline" label />)
    expect(screen.getByText('Offline')).toBeInTheDocument()
  })

  it('renders sm size by default', () => {
    const { container } = render(<StatusIndicator status="online" />)
    const dot = container.querySelector('span span')!
    expect(dot).toHaveClass('h-2', 'w-2')
  })

  it('renders md size', () => {
    const { container } = render(<StatusIndicator status="online" size="md" />)
    const dot = container.querySelector('span span')!
    expect(dot).toHaveClass('h-2.5', 'w-2.5')
  })
})

// ── TrendBadge ──
describe('TrendBadge', () => {
  it('renders positive value with green color and +', () => {
    render(<TrendBadge value={12} />)
    expect(screen.getByText('+12%')).toBeInTheDocument()
  })

  it('renders negative value with red color', () => {
    render(<TrendBadge value={-3} />)
    expect(screen.getByText('-3%')).toBeInTheDocument()
  })

  it('renders zero value as neutral', () => {
    render(<TrendBadge value={0} />)
    expect(screen.getByText('0%')).toBeInTheDocument()
  })

  it('respects custom suffix', () => {
    render(<TrendBadge value={5} suffix="pts" />)
    expect(screen.getByText('+5pts')).toBeInTheDocument()
  })

  it('applies positive styling', () => {
    const { container } = render(<TrendBadge value={10} />)
    expect(container.firstChild).toHaveClass('text-emerald-400')
  })

  it('applies negative styling', () => {
    const { container } = render(<TrendBadge value={-10} />)
    expect(container.firstChild).toHaveClass('text-red-400')
  })
})

// ── AgentAvatar ──
describe('AgentAvatar', () => {
  it('renders image with alt text', () => {
    render(<AgentAvatar src="/test.png" name="TARS" />)
    const img = screen.getByAlt('TARS')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', '/test.png')
  })

  it('applies size classes', () => {
    const { container, rerender } = render(<AgentAvatar src="/t.png" name="T" size="sm" />)
    expect(container.firstChild).toHaveClass('h-8', 'w-8')
    rerender(<AgentAvatar src="/t.png" name="T" size="md" />)
    expect(container.firstChild).toHaveClass('h-14', 'w-14')
    rerender(<AgentAvatar src="/t.png" name="T" size="lg" />)
    expect(container.firstChild).toHaveClass('h-20', 'w-20')
  })

  it('shows status ring when status provided', () => {
    const { container } = render(<AgentAvatar src="/t.png" name="T" status="online" />)
    expect(container.firstChild).toHaveClass('ring-2', 'ring-emerald-500')
  })

  it('shows busy ring color', () => {
    const { container } = render(<AgentAvatar src="/t.png" name="T" status="busy" />)
    expect(container.firstChild).toHaveClass('ring-yellow-500')
  })

  it('applies glow only when online + glowColor', () => {
    const { container } = render(<AgentAvatar src="/t.png" name="T" status="online" glowColor="blue" />)
    const el = container.firstChild as HTMLElement
    expect(el.style.getPropertyValue('--glow-color')).toBe('blue')
  })

  it('no glow when offline even with glowColor', () => {
    const { container } = render(<AgentAvatar src="/t.png" name="T" status="offline" glowColor="blue" />)
    const el = container.firstChild as HTMLElement
    expect(el.style.animation).toBe('')
  })
})

// ── RadialProgress ──
describe('RadialProgress', () => {
  it('renders with default percentage label', () => {
    render(<RadialProgress value={75} />)
    expect(screen.getByText('75%')).toBeInTheDocument()
  })

  it('renders custom label', () => {
    render(<RadialProgress value={50} label="5/6" />)
    expect(screen.getByText('5/6')).toBeInTheDocument()
  })

  it('renders sublabel', () => {
    render(<RadialProgress value={50} sublabel="Online" />)
    expect(screen.getByText('Online')).toBeInTheDocument()
  })

  it('clamps at 100%', () => {
    render(<RadialProgress value={150} max={100} />)
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('handles 0%', () => {
    render(<RadialProgress value={0} />)
    expect(screen.getByText('0%')).toBeInTheDocument()
  })

  it('renders SVG circles', () => {
    const { container } = render(<RadialProgress value={50} />)
    const circles = container.querySelectorAll('circle')
    expect(circles).toHaveLength(2) // track + progress
  })

  it('progress ring has correct class', () => {
    const { container } = render(<RadialProgress value={50} />)
    const progressCircle = container.querySelector('.progress-ring')
    expect(progressCircle).toBeInTheDocument()
  })
})

// ── SparklineChart ──
describe('SparklineChart', () => {
  it('renders chart container', () => {
    render(<SparklineChart data={[1, 2, 3, 4, 5]} />)
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument()
  })

  it('renders with empty data', () => {
    render(<SparklineChart data={[]} />)
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument()
  })

  it('renders with single data point', () => {
    render(<SparklineChart data={[42]} />)
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument()
  })

  it('applies custom dimensions', () => {
    const { container } = render(<SparklineChart data={[1, 2]} width={100} height={30} />)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.style.width).toBe('100px')
    expect(wrapper.style.height).toBe('30px')
  })
})

// ── AnimatedNumber ──
describe('AnimatedNumber', () => {
  it('renders with prefix and suffix', () => {
    render(<AnimatedNumber value={0} prefix="$" suffix="k" />)
    expect(screen.getByText('$0k')).toBeInTheDocument()
  })

  it('renders initial value of 0', () => {
    render(<AnimatedNumber value={0} />)
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(<AnimatedNumber value={0} className="text-xl" />)
    expect(container.firstChild).toHaveClass('text-xl')
  })
})
