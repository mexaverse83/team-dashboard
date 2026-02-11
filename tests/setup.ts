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

// Mock Supabase client globally
vi.mock('@/lib/supabase', () => {
  const mockChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  }

  const mockFrom = (table: string) => ({
    select: vi.fn().mockReturnValue({
      order: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          then: vi.fn((cb: any) => cb({ data: [], error: null })),
        }),
        then: vi.fn((cb: any) => cb({ data: [], error: null })),
      }),
      then: vi.fn((cb: any) => cb({ data: [], error: null })),
    }),
    insert: vi.fn().mockReturnValue({
      then: vi.fn((cb: any) => cb({ data: null, error: null })),
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        then: vi.fn((cb: any) => cb({ data: null, error: null })),
      }),
    }),
  })

  return {
    supabase: {
      from: vi.fn(mockFrom),
      channel: vi.fn(() => mockChannel),
      removeChannel: vi.fn(),
    },
  }
})
