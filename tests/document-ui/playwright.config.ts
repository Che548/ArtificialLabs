import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'documents.spec.ts',
  workers: 1,
  use: {
    browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL,
    headless: true,
    baseURL: 'http://127.0.0.1:4324',
  },
  webServer: {
    command: 'node scripts/document-ui-preview.mjs',
    cwd: process.cwd(),
    url: 'http://127.0.0.1:4324',
    reuseExistingServer: false,
  },
  outputDir: '../../output/playwright/document-results',
});
