/**
 * Render tests for the Mona v2 W0 UI primitives (src/components/ui).
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Page, PageHeader } from '@/components/ui/page'
import { Card, CardHeader } from '@/components/ui/card'
import { Stat } from '@/components/ui/stat'
import { MoneyText } from '@/components/ui/money-text'
import { ProgressBar } from '@/components/ui/progress-bar'
import { StatusPill } from '@/components/ui/status-pill'
import { CategoryIcon } from '@/components/ui/category-icon'
import { OwnerAvatar, ownerSlot } from '@/components/ui/owner-avatar'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { MINUS } from '@/lib/format'

describe('Page / PageHeader', () => {
  it('renders an h1 with description, meta and actions', () => {
    render(
      <Page narrow data-testid="page">
        <PageHeader eyebrow="Plan" title="Budgets" description="October" meta="Updated 9:15" actions={<button>Add</button>} />
      </Page>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Budgets' })).toBeInTheDocument()
    expect(screen.getByText('Updated 9:15')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
    expect(screen.getByTestId('page')).toHaveClass('max-w-3xl')
  })
})

describe('Card', () => {
  it('supports variants and a structured header', () => {
    const { container } = render(
      <Card variant="hero" interactive>
        <CardHeader title="Can we spend?" description="This week" action={<a href="/finance/budgets">Budgets</a>} />
      </Card>,
    )
    expect(container.firstChild).toHaveAttribute('data-variant', 'hero')
    expect(screen.getByRole('heading', { level: 3, name: 'Can we spend?' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Budgets' })).toBeInTheDocument()
  })
})

describe('Stat / MoneyText', () => {
  it('keeps the value neutral and tones only the delta', () => {
    render(<Stat label="Projected savings" value={<MoneyText value={83_536} />} delta="+$12.4k" tone="positive" hint="vs Sep" money />)
    const value = screen.getByText('$83,536')
    expect(value).toHaveAttribute('data-money')
    expect(value.parentElement).toHaveClass('text-fg')
    expect(screen.getByText('+$12.4k')).toHaveClass('text-positive')
  })

  it('only money stats are blurred by privacy mode', () => {
    render(
      <>
        <Stat label="Days left" value="4 days" />
        <Stat label="Saved" value="$9,000" money />
      </>,
    )
    expect(screen.getByText('4 days')).toHaveAttribute('data-privacy-exempt')
    expect(screen.getByText('4 days')).not.toHaveAttribute('data-money')
    expect(screen.getByText('$9,000')).toHaveAttribute('data-money')
    expect(screen.getByText('$9,000')).not.toHaveAttribute('data-privacy-exempt')
  })

  it('compact money carries the full amount in title', () => {
    render(<MoneyText value={-92_345} mode="compact" />)
    const el = screen.getByText(`${MINUS}$92.3k`)
    expect(el).toHaveAttribute('title', `${MINUS}$92,345`)
  })
})

describe('ProgressBar', () => {
  it('exposes progressbar semantics, budget tone and a pace marker', () => {
    render(<ProgressBar label="Dining Out budget" value={3_390} max={1_000} marker={900} valueText="339% — $2,390 over" />)
    const bar = screen.getByRole('progressbar', { name: 'Dining Out budget' })
    // Clamped to the ARIA range; the overage lives in valuetext.
    expect(bar).toHaveAttribute('aria-valuenow', '1000')
    expect(bar).toHaveAttribute('aria-valuemax', '1000')
    expect(bar).toHaveAttribute('aria-valuetext', '339% — $2,390 over')
    expect(bar).toHaveAttribute('data-tone', 'negative')
    expect(screen.getByTestId('progress-marker')).toHaveStyle({ left: '90%' })
  })

  it('default valuetext names the overage and handles a zero budget', () => {
    const { unmount } = render(<ProgressBar label="Other" value={1_200} max={1_000} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '120% — over budget')
    unmount()
    render(<ProgressBar label="Gifts" value={500} max={0} />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuemax', '0')
    expect(bar).toHaveAttribute('aria-valuenow', '0')
    expect(bar).toHaveAttribute('aria-valuetext', 'Over budget — no budget set')
  })

  it('fixed category at 100% reads neutral', () => {
    render(<ProgressBar label="Rent" value={45_000} max={45_000} isFixed />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('data-tone', 'neutral')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '100%')
  })
})

describe('StatusPill / CategoryIcon / OwnerAvatar', () => {
  it('pill shows dot + word', () => {
    render(<StatusPill tone="warning">Due soon</StatusPill>)
    expect(screen.getByText('Due soon')).toHaveAttribute('data-tone', 'warning')
  })

  it('category icon uses lucide for known names, emoji fallback otherwise', () => {
    const { container, rerender } = render(<CategoryIcon name="Groceries" emoji="🛒" colorIndex={1} />)
    expect(container.querySelector('svg')).not.toBeNull()
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
    rerender(<CategoryIcon name="Mystery" emoji="🧩" label="Mystery" />)
    expect(screen.getByRole('img', { name: 'Mystery' })).toHaveTextContent('🧩')
  })

  it('owner avatar canonicalizes lowercase owners', () => {
    render(<OwnerAvatar owner="bernardo" showName />)
    expect(screen.getByRole('img', { name: 'Bernardo' })).toHaveTextContent('B')
    expect(ownerSlot('LAURA')).toBe('owner-b')
    expect(ownerSlot('joint')).toBe('owner-shared')
    expect(ownerSlot(null)).toBe('owner-shared')
  })
})

describe('EmptyState / ErrorState', () => {
  it('empty state keeps its API and accepts an action', () => {
    render(<EmptyState title="No transactions" description="Nothing matches" action={<button>Add one</button>} />)
    expect(screen.getByRole('status')).toHaveTextContent('No transactions')
    expect(screen.getByRole('button', { name: 'Add one' })).toBeInTheDocument()
  })

  it('error state offers Retry; restricted explains sign-in', () => {
    const onRetry = vi.fn()
    const { rerender } = render(<ErrorState variant="error" title="Couldn't load crypto" onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load crypto")
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalled()
    rerender(<ErrorState variant="restricted" />)
    expect(screen.getByRole('status')).toHaveTextContent('Sign in to see this')
  })
})

describe('Button', () => {
  it('has primary/secondary/ghost/danger variants and sm/md/lg sizes', () => {
    render(
      <>
        <Button>Save</Button>
        <Button variant="secondary" size="sm">Post due items</Button>
        <Button variant="danger" size="lg">Delete</Button>
      </>,
    )
    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('btn-primary', 'h-10')
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button')
    expect(screen.getByRole('button', { name: 'Post due items' })).toHaveClass('h-8', 'after:h-11')
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('h-12', 'bg-negative')
  })
})

describe('Segmented', () => {
  it('is a radiogroup with aria-checked and arrow-key navigation', () => {
    const onChange = vi.fn()
    render(
      <Segmented
        ariaLabel="Transaction type"
        value="all"
        onChange={onChange}
        options={[{ value: 'all', label: 'All' }, { value: 'out', label: 'Out' }, { value: 'in', label: 'In' }]}
      />,
    )
    expect(screen.getByRole('radiogroup', { name: 'Transaction type' })).toBeInTheDocument()
    const all = screen.getByRole('radio', { name: 'All' })
    expect(all).toHaveAttribute('aria-checked', 'true')
    expect(all).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('radio', { name: 'Out' })).toHaveAttribute('tabindex', '-1')
    fireEvent.keyDown(all, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith('out')
    fireEvent.click(screen.getByRole('radio', { name: 'In' }))
    expect(onChange).toHaveBeenCalledWith('in')
  })
})

describe('Tabs', () => {
  it('wires tablist / aria-selected / aria-controls', () => {
    render(
      <Tabs defaultValue="stocks">
        <TabsList aria-label="Investments">
          <TabsTrigger value="stocks">Stocks</TabsTrigger>
          <TabsTrigger value="crypto">Crypto</TabsTrigger>
        </TabsList>
        <TabsContent value="stocks">Stocks panel</TabsContent>
        <TabsContent value="crypto">Crypto panel</TabsContent>
      </Tabs>,
    )
    expect(screen.getByRole('tablist', { name: 'Investments' })).toBeInTheDocument()
    const tab = screen.getByRole('tab', { name: 'Stocks' })
    expect(tab).toHaveAttribute('aria-selected', 'true')
    const panelId = tab.getAttribute('aria-controls')
    expect(panelId).toBeTruthy()
    expect(document.getElementById(panelId!)).toHaveTextContent('Stocks panel')
    expect(tab).toHaveClass('min-h-11')
  })
})

describe('ThemeToggle', () => {
  it('defaults to Dark and applies a new choice to <html>', () => {
    localStorage.clear()
    render(<ThemeToggle />)
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('radio', { name: 'Light' }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(localStorage.getItem('mona:theme')).toBe('light')
    expect(screen.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    localStorage.clear()
  })
})
