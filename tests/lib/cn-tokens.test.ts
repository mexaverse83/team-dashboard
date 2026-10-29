import { describe, expect, it } from 'vitest'
import { cn } from '@/lib/utils'

describe('cn with design-token font sizes', () => {
  it('keeps text-label / text-micro next to a token colour', () => {
    expect(cn('text-label', 'text-positive')).toBe('text-label text-positive')
    expect(cn('text-micro font-medium', 'text-fg-secondary')).toBe('text-micro font-medium text-fg-secondary')
  })
  it('still resolves real conflicts', () => {
    expect(cn('text-sm', 'text-label')).toBe('text-label')
    expect(cn('text-fg', 'text-positive')).toBe('text-positive')
  })
})
