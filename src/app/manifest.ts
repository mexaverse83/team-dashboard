import type { MetadataRoute } from 'next'

// Served at /manifest.webmanifest; Next links it automatically. Makes the
// dashboard installable as a PWA on iOS ("Add to Home Screen") and Android.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Finance — Autonomis',
    short_name: 'Finance',
    description: 'Household finance command center',
    start_url: '/finance',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f7fafb',
    theme_color: '#f7fafb',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
