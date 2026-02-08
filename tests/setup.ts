import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

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
