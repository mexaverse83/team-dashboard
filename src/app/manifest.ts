import type { MetadataRoute } from 'next'

// Served at /manifest.webmanifest; Next links it automatically. Makes the
// dashboard installable as a PWA on iOS ("Add to Home Screen") and Android.
// Shortcuts are Android-only (iOS ignores them); lang stays 'en' because the
// UI chrome is English (Spanish Mona text is marked per element).
export default function manifest(): MetadataRoute.Manifest {
  const shortcutIcon = [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }]
  return {
    id: '/finance',
    name: 'Mona Finance',
    short_name: 'Mona',
    description: 'Bernardo and Laura’s household financial plan',
    start_url: '/finance',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    lang: 'en',
    categories: ['finance', 'productivity'],
    background_color: '#080d19',
    theme_color: '#080d19',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.webp', sizes: '512x512', type: 'image/webp' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-512-maskable.webp', sizes: '512x512', type: 'image/webp', purpose: 'maskable' },
      { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Add expense', short_name: 'Add', url: '/finance/transactions?add=1', icons: shortcutIcon },
      { name: 'Ask Mona', short_name: 'Ask', url: '/finance/ask', icons: shortcutIcon },
      { name: 'Budgets', short_name: 'Budgets', url: '/finance/budgets', icons: shortcutIcon },
    ],
  }
}
