const { defineConfig, devices } = require('@playwright/test');

const isLiveRun = Boolean(process.env.PYTHOS_LIVE_URL);
const baseURL = process.env.PYTHOS_LIVE_URL || 'http://localhost:3005';

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: {
    timeout: 12000
  },
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off'
  },
  projects: [
    {
      name: 'desktop-chromium',
      testMatch: /pythos-desktop\.spec\.js/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 }
      }
    },
    {
      name: 'mobile-portrait',
      testMatch: /pythos-mobile\.spec\.js/,
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true
      }
    },
    {
      name: 'mobile-landscape',
      testMatch: /pythos-mobile\.spec\.js/,
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 844, height: 390 },
        hasTouch: true,
        isMobile: true
      }
    },
    {
      name: 'live-smoke',
      testMatch: /pythos-live-smoke\.spec\.js/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 }
      }
    }
  ],
  ...(isLiveRun ? {} : {
    webServer: {
      command: 'node tests/e2e/helpers/start-e2e-servers.js',
      url: 'http://localhost:3005/',
      timeout: 30000,
      reuseExistingServer: false
    }
  })
});
