import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'portrait', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
    { name: 'landscape', use: { browserName: 'chromium', viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true } },
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } } }
  ],
  webServer: {
    command: 'node tests/serve.mjs',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI
  }
});
