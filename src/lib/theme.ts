// Theme preference (NU-1): Dark ("Wolff Midnight") is the default; Light and
// System are opt-in through <ThemeToggle/>. The preference lives in
// localStorage; <html data-theme> always carries the RESOLVED theme
// ('light' | 'dark') so CSS needs only [data-theme=light] overrides.
export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'mona:theme'
export const DEFAULT_THEME: ThemePreference = 'dark'
export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark']

/** <meta name="theme-color"> per resolved theme (status bar / PWA chrome). */
export const THEME_COLORS: Record<ResolvedTheme, string> = { dark: '#080d19', light: '#f9fafb' }

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark'
}

export function readThemePreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isThemePreference(stored) ? stored : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

export function writeThemePreference(pref: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, pref)
  } catch {
    // Private mode / blocked storage: the choice still applies for this page view.
  }
}

export function systemPrefersLight(): boolean {
  try {
    return !!window.matchMedia?.('(prefers-color-scheme: light)').matches
  } catch {
    return false
  }
}

export function resolveTheme(pref: ThemePreference, prefersLight: boolean = systemPrefersLight()): ResolvedTheme {
  if (pref === 'system') return prefersLight ? 'light' : 'dark'
  return pref
}

/** Sets <html data-theme>, data-theme-pref and color-scheme, and syncs <meta name="theme-color">. */
export function applyThemePreference(pref: ThemePreference, root: HTMLElement = document.documentElement): ResolvedTheme {
  const resolved = resolveTheme(pref)
  root.setAttribute('data-theme', resolved)
  root.setAttribute('data-theme-pref', pref)
  root.style.colorScheme = resolved
  try {
    document.querySelectorAll('meta[name="theme-color"]').forEach(meta => meta.setAttribute('content', THEME_COLORS[resolved]))
  } catch {
    // no-op outside a full document
  }
  return resolved
}

/**
 * Inline <script> body for the root layout's <head> (WS1 mounts it): applies
 * the stored preference before first paint so Light users never see a dark flash.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem('${THEME_STORAGE_KEY}');if(p!=='light'&&p!=='dark'&&p!=='system')p='${DEFAULT_THEME}';var r=p==='system'?(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):p;var d=document.documentElement;d.setAttribute('data-theme',r);d.setAttribute('data-theme-pref',p);d.style.colorScheme=r;}catch(e){}})();`
