import { defineConfig, devices } from '@playwright/test'

// Use ephemeral test database for both local and CI runs
const testEnv = {
  DATABASE_URL: './data/test-e2e.db',
  MONAI_CREDENTIAL_MODE: 'sandbox',
  PLAID_ENV: 'sandbox',
  // e2e seeds under DEV_USER_ID; bypass Clerk only for Playwright.
  MONAI_DEV_AUTH_BYPASS: '1',
}
Object.assign(process.env, testEnv)

const localBaseURL = 'http://localhost:3000'
const baseURL = process.env.BASE_URL || localBaseURL

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  // The dev server renders each route on demand; a cold first paint can take
  // well over the 5s default.
  expect: { timeout: 15_000 },
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
      command: process.env.CI ? 'bun e2e/prepare.ts && bun vite preview --port 3000' : 'bun e2e/prepare.ts && bun run dev',
      env: testEnv,
      url: localBaseURL,
      reuseExistingServer: process.env.PW_REUSE_SERVER === '1',
      timeout: 120_000,
      },
})
