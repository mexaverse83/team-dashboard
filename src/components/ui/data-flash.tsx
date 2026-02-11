'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

interface DataFlashProps {
  data: unknown
  children: ReactNode
  color?: string
  className?: string
}

export function DataFlash({ data, children, color = 'hsl(217, 91%, 60%)', className = '' }: DataFlashProps) {
  const [flashing, setFlashing] = useState(false)
  const prevRef = useRef(data)
  const mountedRef = useRef(false)

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }
    if (data !== prevRef.current) {
      prevRef.current = data
      setFlashing(true)
      const timer = setTimeout(() => setFlashing(false), 300)
      return () => clearTimeout(timer)
    }
  }, [data])

  return (
    <div
      className={`transition-all duration-300 rounded-lg ${className}`}
      style={flashing ? {
        boxShadow: `inset 0 0 0 1px ${color}, 0 0 12px 0 ${color}40`,
      } : undefined}
    >
      {children}
    </div>
  )
}
