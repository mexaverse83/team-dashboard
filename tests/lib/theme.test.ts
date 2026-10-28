import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applyThemePreference,
  DEFAULT_THEME,
  readThemePreference,
  resolveTheme,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  writeThemePreference,
} from '@/lib/theme'

afterEach(() => {
  try { localStorage.clear() } catch {}
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-theme-pref')
  vi.restoreAllMocks()
})

describe('theme preference', () => {
  it('defaults to dark (NU-1)', () => {
    expect(DEFAULT_THEME).toBe('dark')
    expect(readThemePreference()).toBe('dark')
  })

  it('round-trips through localStorage and ignores junk', () => {
    writeThemePreference('light')
    expect(readThemePreference()).toBe('light')
    localStorage.setItem(THEME_STORAGE_KEY, 'purple')
    expect(readThemePreference()).toBe('dark')
  })

  it('survives a throwing localStorage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded') })
    expect(readThemePreference()).toBe('dark')
    expect(() => writeThemePreference('light')).not.toThrow()
  })

  it('resolves system against the OS preference', () => {
    expect(resolveTheme('system', true)).toBe('light')
    expect(resolveTheme('system', false)).toBe('dark')
    expect(resolveTheme('light', false)).toBe('light')
  })

  it('applies the resolved theme to <html> and the theme-color meta', () => {
    const meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.appendChild(meta)
    expect(applyThemePreference('light')).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(document.documentElement.getAttribute('data-theme-pref')).toBe('light')
    expect(meta.getAttribute('content')).toBe('#f9fafb')
    meta.remove()
  })

  it('init script applies the stored preference before paint', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light')
    new Function(THEME_INIT_SCRIPT)()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    localStorage.removeItem(THEME_STORAGE_KEY)
    new Function(THEME_INIT_SCRIPT)()
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })
})
