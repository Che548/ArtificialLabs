import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: 'legal.spec.ts', workers: 1,
  use: { browserName: 'chromium', headless: true },
  webServer: { command: 'node scripts/legal-ui-preview.mjs', cwd: process.cwd(), url: 'http://127.0.0.1:4323', reuseExistingServer: false },
  outputDir: '../../output/playwright/legal-results',
});
