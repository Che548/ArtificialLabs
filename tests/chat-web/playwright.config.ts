import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'chat.spec.ts',
  workers: 1,
  timeout: 90000,
  outputDir: '../../output/playwright/chat-web-results',
  use: { baseURL: 'http://127.0.0.1:4333', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chrome', use: { browserName: 'chromium', channel: 'chrome' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: {
    command: 'CI=1 npx expo start --web --localhost --port 4333',
    cwd: '../..',
    url: 'http://127.0.0.1:4333',
    // CI Metro does not reload changed modules. Never validate stale JS from
    // an earlier run while claiming to have tested the current worktree.
    reuseExistingServer: false,
    timeout: 180000,
  },
});
