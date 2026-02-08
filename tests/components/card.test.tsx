/**
 * Unit Tests — UI Components
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

describe('Card Component', () => {
  it('renders children', () => {
    render(<Card><CardContent>Test content</CardContent></Card>)
    expect(screen.getByText('Test content')).toBeInTheDocument()
  })

  it('renders full card structure', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>Description</CardDescription>
        </CardHeader>
        <CardContent>Body</CardContent>
      </Card>
    )
    expect(screen.getByText('Title')).toBeInTheDocument()
    expect(screen.getByText('Description')).toBeInTheDocument()
    expect(screen.getByText('Body')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(<Card className="custom-class">content</Card>)
    expect(container.firstChild).toHaveClass('custom-class')
  })

  it('has correct base styles', () => {
    const { container } = render(<Card>content</Card>)
    expect(container.firstChild).toHaveClass('rounded-lg', 'border', 'shadow-sm')
  })
})

describe('Badge Component', () => {
  it('renders with default variant', () => {
    render(<Badge>Default</Badge>)
    expect(screen.getByText('Default')).toBeInTheDocument()
  })

  it('renders with outline variant', () => {
    render(<Badge variant="outline">Outline</Badge>)
    expect(screen.getByText('Outline')).toBeInTheDocument()
  })

  it('renders with secondary variant', () => {
    render(<Badge variant="secondary">Secondary</Badge>)
    expect(screen.getByText('Secondary')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(<Badge className="custom">text</Badge>)
    expect(container.firstChild).toHaveClass('custom')
  })
})

describe('Button Component', () => {
  it('renders with text', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByText('Click me')).toBeInTheDocument()
  })

  it('renders with default variant and size', () => {
    const { container } = render(<Button>btn</Button>)
    const button = container.querySelector('button')
    expect(button).toBeInTheDocument()
    expect(button).toHaveClass('h-10')
  })

  it('renders small size', () => {
    const { container } = render(<Button size="sm">small</Button>)
    const button = container.querySelector('button')
    expect(button).toHaveClass('h-9')
  })

  it('handles disabled state', () => {
    render(<Button disabled>disabled</Button>)
    expect(screen.getByText('disabled')).toBeDisabled()
  })

  it('renders as child element with asChild', () => {
    render(<Button asChild><a href="/test">Link</a></Button>)
    const link = screen.getByText('Link')
    expect(link.tagName).toBe('A')
  })
})
