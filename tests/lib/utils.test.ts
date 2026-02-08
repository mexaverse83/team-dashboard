/**
 * Unit Tests — src/lib/utils.ts
 */

import { describe, it, expect } from 'vitest'
import { cn } from '@/lib/utils'

describe('cn (className merger)', () => {
  it('should merge simple classes', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('should handle conditional classes', () => {
    expect(cn('base', false && 'hidden', 'visible')).toBe('base visible')
  })

  it('should merge conflicting Tailwind classes', () => {
    // twMerge should resolve conflicts
    expect(cn('px-2', 'px-4')).toBe('px-4')
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
  })

  it('should handle undefined and null', () => {
    expect(cn('base', undefined, null, 'end')).toBe('base end')
  })

  it('should handle empty string', () => {
    expect(cn('')).toBe('')
  })

  it('should handle no arguments', () => {
    expect(cn()).toBe('')
  })

  it('should handle array input', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar')
  })

  it('should handle object input', () => {
    expect(cn({ foo: true, bar: false, baz: true })).toBe('foo baz')
  })
})
