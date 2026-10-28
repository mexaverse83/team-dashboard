import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

// One button (VIS-18). Variants: primary (one per page header), secondary,
// ghost, danger. Sizes sm 32 / md 40 / lg 48; sm and md extend an invisible
// 44px hit area (MOB-09) so compact buttons stay finger-sized.
const HIT_AREA = "relative after:absolute after:left-1/2 after:top-1/2 after:h-11 after:w-[max(100%,2.75rem)] after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold ring-offset-[hsl(var(--background))] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "btn-primary",
        secondary: "border border-border bg-surface-2 text-fg hover:border-border-strong hover:bg-surface-3",
        ghost: "text-fg-secondary hover:bg-surface-2 hover:text-fg",
        danger: "bg-negative text-white hover:bg-negative/90",
        // Legacy aliases (shadcn names) kept for existing callers.
        default: "btn-primary",
        destructive: "bg-negative text-white hover:bg-negative/90",
        outline: "border border-border bg-transparent text-fg hover:bg-surface-2",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: `h-8 px-3 text-[0.8125rem] ${HIT_AREA}`,
        md: `h-10 px-4 ${HIT_AREA}`,
        lg: "h-12 px-5 text-base",
        icon: `h-10 w-10 ${HIT_AREA}`,
        default: `h-10 px-4 ${HIT_AREA}`,
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
)

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...(asChild ? {} : { type: type ?? "button" })}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
