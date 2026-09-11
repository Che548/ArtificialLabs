import { expect, test } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
let server;
let dataDir;

test.beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'lab-capture-browser-'));
  server = await startServer(dataDir);
});

test.afterAll(async () => {
  await server?.stop();
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

test('onboards a phone, retries an interrupted upload, and keeps shared timers', async ({ page }) => {
  await page.addInitScript(() => {
    if (globalThis.Crypto?.prototype) {
      Object.defineProperty(globalThis.Crypto.prototype, 'randomUUID', {
        configurable: true,
        value: undefined,
      });
    }
  });
  await page.goto(server.url);

  const setup = page.getByRole('dialog', { name: 'Куда сохранять снимки?' });
  await expect(setup).toBeVisible();
  await setup.getByText('iPhone', { exact: true }).click();
  await setup.getByLabel('Название телефона').fill('iPhone лаборатории');
  await setup.getByRole('button', { name: 'Сохранить и продолжить' }).click();
  await expect(setup).not.toBeVisible();

  await page.locator('input[name="concentration"][value="background"]').check({ force: true });
  await page.route('**/api/uploads', (route) => route.abort('connectionfailed'), { times: 1 });
  await page.locator('#camera-input').setInputFiles({
    name: 'hcg-test.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  });

  await expect(page.locator('#queue-bar')).toBeVisible();
  await expect(page.locator('#upload-feedback-text')).toContainText('в очереди');
  await page.unroute('**/api/uploads');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('#upload-feedback-text')).toContainText('Сохранено');
  await expect(page.locator('#queue-bar')).toBeHidden();
  await expect(page.locator('#recent-uploads-list')).toContainText('iPhone-лаборатории');
  await expect(page.locator('#recent-uploads-list')).toContainText('.jpg');
  await expect(page.locator('#recent-uploads-list')).toContainText('Фон');
  await expect(page.locator('#photo-count')).toHaveText('1');

  await page.getByRole('button', { name: /Таймеры/ }).click();
  await page.locator('#timers-title').click();
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  await expect(page.locator('.timer-card')).toHaveCount(2);
  await expect(page.locator('.timer-time').first()).toContainText('02:');

  await page.reload();
  await expect(setup).not.toBeVisible();
  await page.getByRole('button', { name: /Таймеры/ }).click();
  await expect(page.locator('.timer-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Удалить таймер №1' }).click();
  await expect(page.locator('.timer-card')).toHaveCount(1);
});

async function startServer(directory) {
  const child = spawn(process.execPath, [join(TOOL_DIR, 'server.mjs')], {
    cwd: TOOL_DIR,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: '0',
      LAB_CAPTURE_DATA_DIR: directory,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => (stdout += chunk));
  child.stderr.on('data', (chunk) => (stderr += chunk));

  const url = await new Promise((resolveReady, rejectReady) => {
    const timeout = setTimeout(
      () => rejectReady(new Error(`Server did not start.\n${stdout}\n${stderr}`)),
      10_000,
    );
    const inspect = (chunk) => {
      const match = String(chunk).match(/LAB_CAPTURE_READY:(http:\/\/[^\s]+)/);
      if (!match) return;
      clearTimeout(timeout);
      child.stdout.off('data', inspect);
      resolveReady(match[1]);
    };
    child.stdout.on('data', inspect);
    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      rejectReady(new Error(`Server exited before ready: ${code ?? signal}\n${stdout}\n${stderr}`));
    });
  });

  return {
    url,
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = new Promise((resolveExit) => child.once('exit', resolveExit));
      child.kill('SIGTERM');
      const force = setTimeout(() => child.kill('SIGKILL'), 5_000);
      await exited;
      clearTimeout(force);
    },
  };
}
