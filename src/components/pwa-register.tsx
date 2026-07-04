'use client'

import { useEffect } from 'react'

// Registers the service worker (PWA installability). Renders nothing.
export function PwaRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])
  return null
}
