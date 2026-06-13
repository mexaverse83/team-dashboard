'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  className?: string
  /** Sticky footer (e.g. submit button) pinned to the bottom of the sheet,
   * always reachable in the thumb zone on mobile without scrolling. */
  footer?: React.ReactNode
}

export function Modal({ open, onClose, title, children, className, footer }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) {
      document.addEventListener('keydown', handler)
      // Lock background scroll while the sheet is open
      document.documentElement.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handler)
      document.documentElement.style.overflow = ''
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          // Bottom-anchored on mobile (sheet), centered on >=sm (dialog)
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            ref={ref}
            className={cn(
              "relative flex flex-col bg-[hsl(var(--bg-surface))] border border-[hsl(var(--border))] shadow-2xl",
              "w-full max-h-[92dvh] rounded-t-2xl",            // mobile sheet
              "sm:max-w-md sm:max-h-[85vh] sm:rounded-xl",      // desktop dialog
              className
            )}
            initial={{ y: '100%', opacity: 0.5 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 32, stiffness: 360 }}
          >
            {/* Grab handle (mobile affordance) */}
            <div className="sm:hidden flex justify-center pt-2.5 pb-1">
              <div className="h-1 w-9 rounded-full bg-[hsl(var(--border))]" />
            </div>
            <div className="flex items-center justify-between px-4 py-3 sm:p-4 border-b border-[hsl(var(--border))]">
              <h2 className="text-lg font-semibold">{title}</h2>
              <button onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-[hsl(var(--bg-elevated))] transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>
            {footer && (
              <div className="border-t border-[hsl(var(--border))] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-[hsl(var(--bg-surface))]">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
