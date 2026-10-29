import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/app/globals.css'],
    },
  },
  resolve: {
    alias: [
      // Seed data moved to tests/fixtures (WS7); this keeps the older test
      // imports working until they switch to the relative fixture path.
      { find: /^@\/lib\/seed-finance$/, replacement: path.resolve(__dirname, './tests/fixtures/seed-finance.ts') },
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
  },
})
