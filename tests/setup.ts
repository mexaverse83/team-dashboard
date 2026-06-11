import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// Mock framer-motion globally (PageTransition wraps all pages)
// NOTE: cannot use JSX in .ts file, cannot use Proxy (vitest hangs)
vi.mock('framer-motion', async () => {
  const React = await import('react')
  const h = (tag: string) => ({ children, initial, animate, transition, whileHover, whileTap, exit, variants, whileInView, layout, layoutId, ...rest }: any) =>
    React.createElement(tag, rest, children)
  return {
    motion: { div: h('div'), span: h('span'), li: h('li'), ul: h('ul'), p: h('p'), a: h('a'), button: h('button'), section: h('section'), nav: h('nav'), header: h('header') },
    AnimatePresence: ({ children }: any) => children,
    LazyMotion: ({ children }: any) => children,
    domAnimation: {},
  }
})

// Mock next/font (layout.tsx) — vitest doesn't run the Next.js font compiler
vi.mock('next/font/google', () => ({
  Inter: () => ({ className: 'font-inter', variable: '--font-inter', style: { fontFamily: 'Inter' } }),
  Space_Grotesk: () => ({ className: 'font-display', variable: '--font-display', style: { fontFamily: 'Space Grotesk' } }),
}))

// Mock Supabase client globally.
// Query builders are generically chainable (order/limit/gte/eq/...) and
// thenable, so component queries of any shape resolve to empty data.
vi.mock('@/lib/supabase', () => {
  const mockChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  }

  const queryResult = { data: [], error: null, count: 0 }
  const makeChain = (result: any) => {
    const chain: any = {
      then: vi.fn((cb: any) => Promise.resolve(cb(result))),
    }
    for (const m of ['select', 'order', 'limit', 'gte', 'lte', 'eq', 'neq', 'in', 'ilike', 'single', 'range']) {
      chain[m] = vi.fn(() => chain)
    }
    return chain
  }

  const mockFrom = () => ({
    select: vi.fn(() => makeChain(queryResult)),
    insert: vi.fn(() => makeChain({ data: null, error: null })),
    update: vi.fn(() => makeChain({ data: null, error: null })),
    delete: vi.fn(() => makeChain({ data: null, error: null })),
    upsert: vi.fn(() => makeChain({ data: null, error: null })),
  })

  return {
    supabase: {
      from: vi.fn(mockFrom),
      channel: vi.fn(() => mockChannel),
      removeChannel: vi.fn(),
      auth: {
        getUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })),
        getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
        signInWithOtp: vi.fn(() => Promise.resolve({ data: {}, error: null })),
        signOut: vi.fn(() => Promise.resolve({ error: null })),
      },
    },
  }
})
