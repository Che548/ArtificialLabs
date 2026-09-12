import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'contact.spec.ts',
  workers: 1,
  use: { browserName: 'chromium', headless: true },
  webServer: {
    command: 'node scripts/contact-ui-preview.mjs',
    cwd: process.cwd(),
    url: 'http://127.0.0.1:4321',
    reuseExistingServer: false,
  },
  outputDir: '../../output/playwright/contact-results',
});
