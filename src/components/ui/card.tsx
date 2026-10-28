import * as React from "react"
import { cn } from "@/lib/utils"

// Card replaces GlassCard / .glass / .finance-card for new work (VIS spec §4):
// one border style, token surfaces, a soft shadow in light and none in dark.
export type CardVariant = "default" | "subtle" | "hero"

const VARIANT_CLASSES: Record<CardVariant, string> = {
  default: "rounded-xl border border-border bg-surface text-fg shadow-card",
  subtle: "rounded-xl border border-border bg-surface-2 text-fg",
  hero: "rounded-2xl border border-border-strong bg-[linear-gradient(135deg,hsl(var(--surface)),hsl(var(--surface-2)))] text-fg shadow-card",
}

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant
  /** Hover/focus affordance for clickable cards. */
  interactive?: boolean
  /** 'md' = 16px mobile / 20px desktop (default); 'none' for edge-to-edge content. */
  padding?: "none" | "md"
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = "default", interactive = false, padding = "md", ...props }, ref) => (
    <div
      ref={ref}
      data-variant={variant}
      className={cn(
        VARIANT_CLASSES[variant],
        padding === "md" && "p-4 sm:p-5",
        interactive && "transition-colors hover:border-border-strong focus-within:border-border-strong",
        className,
      )}
      {...props}
    />
  )
)
Card.displayName = "Card"

export interface CardHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** Structured header: title + optional description and right-aligned action. */
  title?: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
}

const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, title, description, action, children, ...props }, ref) => {
    if (title === undefined) {
      return <div ref={ref} className={cn("mb-3 flex flex-col gap-1", className)} {...props}>{children}</div>
    }
    return (
      <div ref={ref} className={cn("mb-3 flex items-start justify-between gap-3", className)} {...props}>
        <div className="min-w-0">
          <h3 className="text-[0.9375rem] font-semibold leading-5 text-fg">{title}</h3>
          {description && <p className="mt-0.5 text-[0.8125rem] leading-[1.125rem] text-fg-secondary">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
        {children}
      </div>
    )
  }
)
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-[0.9375rem] font-semibold leading-5 text-fg", className)} {...props} />
  )
)
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-[0.8125rem] leading-[1.125rem] text-fg-secondary", className)} {...props} />
  )
)
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("min-w-0", className)} {...props} />
  )
)
CardContent.displayName = "CardContent"

export { Card, CardHeader, CardTitle, CardDescription, CardContent }
