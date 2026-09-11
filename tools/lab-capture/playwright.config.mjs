import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'browser.spec.mjs',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  outputDir: '../../output/e2e/lab-capture',
  reporter: 'line',
});
