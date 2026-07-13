'use client'

import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  className?: string
  bodyClassName?: string
  /** Opaque app-like surface on phones; prevents the underlying page from
   * showing through while keeping the centered desktop dialog. */
  mobileFullScreen?: boolean
  /** Sticky footer (e.g. submit button) pinned to the bottom of the sheet,
   * always reachable in the thumb zone on mobile without scrolling. */
  footer?: React.ReactNode
}

export function Modal({ open, onClose, title, children, className, bodyClassName, mobileFullScreen = false, footer }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const titleId = useId()

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current() }
    if (open) {
      document.addEventListener('keydown', handler)
      // iOS Safari can still move the page when only <html> is locked. Freeze
      // body position as well, then restore the exact scroll location.
      const scrollY = window.scrollY
      const previousBody = {
        overflow: document.body.style.overflow,
        position: document.body.style.position,
        top: document.body.style.top,
        width: document.body.style.width,
      }
      const previousHtmlOverflow = document.documentElement.style.overflow
      document.documentElement.style.overflow = 'hidden'
      document.body.style.overflow = 'hidden'
      document.body.style.position = 'fixed'
      document.body.style.top = `-${scrollY}px`
      document.body.style.width = '100%'

      return () => {
        document.removeEventListener('keydown', handler)
        document.documentElement.style.overflow = previousHtmlOverflow
        document.body.style.overflow = previousBody.overflow
        document.body.style.position = previousBody.position
        document.body.style.top = previousBody.top
        document.body.style.width = previousBody.width
        if (scrollY) window.scrollTo(0, scrollY)
      }
    }
    return () => {
      document.removeEventListener('keydown', handler)
      document.documentElement.style.overflow = ''
    }
  }, [open])

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
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={cn(
              "relative flex flex-col bg-[hsl(var(--bg-surface))] border border-[hsl(var(--border))] shadow-2xl",
              mobileFullScreen
                ? "h-[100dvh] w-full max-h-[100dvh] rounded-none border-0 bg-[#080d19]"
                : "w-full max-h-[92dvh] rounded-t-2xl",
              "sm:max-w-md sm:max-h-[85vh] sm:rounded-xl",      // desktop dialog
              className
            )}
            initial={mobileFullScreen ? { y: 12, opacity: 0 } : { y: '100%', opacity: 0.5 }}
            animate={{ y: 0, opacity: 1 }}
            exit={mobileFullScreen ? { y: 12, opacity: 0 } : { y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 32, stiffness: 360 }}
          >
            {/* Grab handle (mobile affordance) */}
            {!mobileFullScreen && <div className="sm:hidden flex justify-center pt-2.5 pb-1">
              <div className="h-1 w-9 rounded-full bg-[hsl(var(--border))]" />
            </div>}
            <div className={cn("modal-header flex items-center justify-between border-b border-[hsl(var(--border))] px-4 py-3 sm:p-4", mobileFullScreen && "pt-[max(0.75rem,env(safe-area-inset-top))]")}>
              <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
              <button onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-[hsl(var(--bg-elevated))] transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className={cn("flex-1 overflow-y-auto overscroll-contain p-4", bodyClassName)}>{children}</div>
            {footer && (
              <div className="modal-footer border-t border-[hsl(var(--border))] bg-[hsl(var(--bg-surface))] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
