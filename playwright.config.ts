import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  use: { baseURL: process.env.TEST_BASE_URL ?? 'http://127.0.0.1:8790', trace: 'retain-on-failure' },
  webServer: process.env.TEST_BASE_URL ? undefined : {
    command: 'npm run preview:cloudflare -- --port 8790',
    url: 'http://127.0.0.1:8790',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1080 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
