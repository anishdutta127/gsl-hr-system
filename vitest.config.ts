import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Vitest covers unit tests under src/. Playwright's e2e/ specs run via
// `npm run e2e` and must NOT be picked up here — they call test() against
// the Playwright runner, not Vitest's.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'e2e', '.next', 'dist'],
  },
})
