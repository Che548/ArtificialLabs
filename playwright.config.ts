import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'web.spec.ts',
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_WEB_URL ?? 'https://artificiallabs.bebra42.ru',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  outputDir: 'output/e2e/playwright',
  reporter: [
    ['line'],
    ['json', { outputFile: 'output/e2e/web-report.json' }],
  ],
});
