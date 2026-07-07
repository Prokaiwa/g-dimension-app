// E2E smoke suite config. Runs against a local Vite dev server (started
// automatically below) which talks to the real Supabase project with the anon
// key from .env.local — all smoke tests are read-only, no-login flows.
// Run with: npm run test:e2e   (kept out of CI on purpose — see docs/TESTING.md)
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5199',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev -- --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
