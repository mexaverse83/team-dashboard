"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { cn } from "@/lib/utils"

// Radix supplies the ARIA wiring (role=tablist/tab/tabpanel, aria-selected,
// aria-controls ↔ aria-labelledby, arrow-key roving focus). Use these instead
// of hand-rolled button rows (MOB-12). Give TabsList an aria-label.
const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn("inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-border bg-surface-2 p-1 text-fg-secondary", className)}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn("inline-flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium ring-offset-[hsl(var(--background))] transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-surface data-[state=active]:text-fg data-[state=active]:shadow-card", className)}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn("mt-4 ring-offset-[hsl(var(--background))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]", className)}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
