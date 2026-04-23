import { defineConfig, devices } from '@playwright/test'

// Use ephemeral test database for both local and CI runs
process.env.DATABASE_URL = './data/test-e2e.db'
const localBaseURL = 'http://localhost:3000'
const baseURL = process.env.BASE_URL || localBaseURL

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: process.env.CI ? 'vite preview --port 3000' : 'bun run dev',
        url: localBaseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
})
