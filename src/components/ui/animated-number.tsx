'use client'

import { useEffect, useRef, useState } from 'react'

interface AnimatedNumberProps {
  value: number
  duration?: number
  prefix?: string
  suffix?: string
  className?: string
}

export function AnimatedNumber({ value, duration = 1000, prefix = '', suffix = '', className = '' }: AnimatedNumberProps) {
  const [display, setDisplay] = useState(0)
  const startRef = useRef<number | null>(null)
  const frameRef = useRef<number>(0)

  useEffect(() => {
    const start = display
    const diff = value - start
    if (diff === 0) return

    const animate = (timestamp: number) => {
      if (!startRef.current) startRef.current = timestamp
      const elapsed = timestamp - startRef.current
      const progress = Math.min(elapsed / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(start + diff * eased))

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate)
      }
    }

    startRef.current = null
    frameRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frameRef.current)
  }, [value, duration])

  return <span className={className}>{prefix}{display.toLocaleString()}{suffix}</span>
}
