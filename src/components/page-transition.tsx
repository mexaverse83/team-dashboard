import { ReactNode } from 'react'

// CSS-only entrance (perf-12): content is visible in the server HTML instead
// of waiting for hydration, no motion runtime ships with every page, and
// prefers-reduced-motion disables it in globals.css.
export function PageTransition({ children }: { children: ReactNode }) {
  return <div className="animate-fade-up">{children}</div>
}
