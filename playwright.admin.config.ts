import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/admin-ui', testMatch: '*.spec.ts', workers: 1,
  outputDir: 'output/playwright/admin-tests',
  use: { baseURL: 'http://127.0.0.1:4319', screenshot: 'only-on-failure' },
  webServer: { command: 'node scripts/admin-ui-preview.mjs', url: 'http://127.0.0.1:4319', reuseExistingServer: !process.env.CI },
});
