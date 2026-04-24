import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config. Currently scoped to the a11y CI job that runs
 * axe-core against public + auth surfaces on the deployed preview /
 * production URL.
 *
 * Set A11Y_BASE_URL env var to point at a different deployment.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: 0,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: process.env.A11Y_BASE_URL ?? 'https://gsl-hr-system.vercel.app',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
