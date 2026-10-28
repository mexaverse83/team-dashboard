import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { MiniMarkdown, renderInline } from '@/lib/mini-markdown'

describe('mini-markdown', () => {
  it('renders **bold** and *italic* without literal asterisks', () => {
    const { container } = render(<MiniMarkdown text="Projected **MXN $83,536**, leaving *$23,530* for WEST" />)
    expect(container.querySelector('strong')?.textContent).toBe('MXN $83,536')
    expect(container.querySelector('em')?.textContent).toBe('$23,530')
    expect(container.textContent).not.toContain('*')
  })

  it('turns "- " lines into a list and keeps line breaks', () => {
    const { container } = render(<MiniMarkdown text={'Plan:\n- Dining **$5k**\n- Groceries\n\nSecond line one\nline two'} />)
    const items = container.querySelectorAll('li')
    expect(items).toHaveLength(2)
    expect(items[0].querySelector('strong')?.textContent).toBe('$5k')
    expect(container.querySelectorAll('p')).toHaveLength(2)
    expect(container.querySelectorAll('br')).toHaveLength(1)
  })

  it('never injects HTML', () => {
    const { container } = render(<MiniMarkdown text={'<img src=x onerror=alert(1)> **<b>hi</b>**'} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>')
  })

  it('leaves snake_case and lone asterisks alone', () => {
    expect(renderInline('west_plan and 2 * 3')).toEqual(['west_plan and 2 * 3'])
  })

  it('renders nothing for empty input', () => {
    const { container } = render(<MiniMarkdown text={null} />)
    expect(container.textContent).toBe('')
  })
})
