import { defineConfig, devices } from '@playwright/test'

const CHROMIUM_PATH = process.env.PLAYWRIGHT_CHROMIUM_PATH || '/opt/chromium.org/chromium/chrome'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['html', { outputDir: 'e2e-report/html' }], ['list']],
  timeout: 30000,
  expect: { timeout: 10000 },
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'on',
    headless: true,
    launchOptions: {
      executablePath: CHROMIUM_PATH,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'concurrently -n mock,server,web -c yellow,blue,green "node e2e/mock-agent-server.js" "npm run dev:server" "npm run dev"',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
})
