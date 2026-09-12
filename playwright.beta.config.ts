import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/beta', workers: 1,
  outputDir: 'output/playwright/beta-results',
  use: { baseURL: 'http://127.0.0.1:4321', screenshot: 'only-on-failure' },
  webServer: {
    command: 'python3 -m http.server 4321 --bind 127.0.0.1 --directory admin/out',
    url: 'http://127.0.0.1:4321/beta/', reuseExistingServer: false,
  },
});
