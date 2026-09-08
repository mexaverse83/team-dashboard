'use client'

import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'

const openDialogs: HTMLDivElement[] = []

function isVisible(element: HTMLElement, dialog: HTMLElement | null): boolean {
  for (let node: HTMLElement | null = element; node && node !== dialog; node = node.parentElement) {
    const style = getComputedStyle(node)
    if (style.display === 'none' || style.visibility === 'hidden') return false
  }
  return true
}

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
  const viewportRef = useRef<HTMLDivElement>(null)
  const ref = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const titleId = useId()

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = ref.current
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? []).filter(el => !el.closest('[hidden], [aria-hidden="true"]') && el.tabIndex >= 0 && isVisible(el, dialog))
    const isTop = () => openDialogs[openDialogs.length - 1] === dialog
    const handler = (e: KeyboardEvent) => {
      if (!isTop()) return
      if (e.key === 'Escape') { e.preventDefault(); onCloseRef.current() }
      if (e.key === 'Tab') {
        const elements = focusable()
        const first = elements[0] ?? dialog
        const last = elements[elements.length - 1] ?? dialog
        if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
          e.preventDefault(); last?.focus()
        } else if (!e.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
          e.preventDefault(); first?.focus()
        }
      }
    }
    const containFocus = (e: FocusEvent) => {
      if (isTop() && dialog && !dialog.contains(e.target as Node)) dialog.focus()
    }
    if (open) {
      if (dialog) openDialogs.push(dialog)
      if (!dialog?.contains(document.activeElement)) dialog?.focus()
      document.addEventListener('keydown', handler)
      document.addEventListener('focusin', containFocus)
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
        if (dialog) {
          const index = openDialogs.indexOf(dialog)
          if (index >= 0) openDialogs.splice(index, 1)
        }
        document.removeEventListener('keydown', handler)
        document.removeEventListener('focusin', containFocus)
        if (previousFocus?.isConnected) previousFocus.focus()
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
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const viewport = window.visualViewport
    const update = () => {
      const root = viewportRef.current
      if (!root) return
      root.style.height = `${viewport?.height ?? window.innerHeight}px`
      root.style.top = `${viewport?.offsetTop ?? 0}px`
    }
    update()
    viewport?.addEventListener('resize', update)
    viewport?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => {
      viewport?.removeEventListener('resize', update)
      viewport?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [open])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={viewportRef}
          // Bottom-anchored on mobile (sheet), centered on >=sm (dialog)
          className="fixed inset-x-0 top-0 h-[100dvh] z-[70] flex items-end justify-center sm:items-center sm:p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            ref={ref}
            role="dialog"
            tabIndex={-1}
            aria-modal="true"
            aria-labelledby={titleId}
            className={cn(
              "relative flex flex-col bg-[hsl(var(--bg-surface))] border border-[hsl(var(--border))] shadow-2xl",
              mobileFullScreen
                ? "h-full w-full max-h-full rounded-none border-0 bg-[#080d19]"
                : "w-full max-h-[92%] rounded-t-2xl",
              "sm:max-w-md sm:max-h-[85%] sm:rounded-xl",      // desktop dialog
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
            <div className={cn("modal-header shrink-0 flex items-center justify-between border-b border-[hsl(var(--border))] px-4 py-3 sm:p-4", mobileFullScreen && "pt-[max(0.75rem,env(safe-area-inset-top))]")}>
              <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
              <button onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-[hsl(var(--bg-elevated))] transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain p-4", bodyClassName)}>{children}</div>
            {footer && (
              <div className="modal-footer shrink-0 border-t border-[hsl(var(--border))] bg-[hsl(var(--bg-surface))] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
