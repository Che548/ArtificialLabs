import { test, expect, devices, webkit } from '@playwright/test';

const apple = 'https://testflight.apple.com/join/Aq5UurM8';
const group = 'https://groups.google.com/g/sfera-brainwaves-beta';
const play = 'https://play.google.com/apps/testing/engineering.brainwaves.sfera';
const base = process.env.BETA_BASE_URL || 'http://127.0.0.1:4321';

test('public desktop page: links, QR, copy, no Convex, refresh', async ({ page, context }) => {
  const external: string[] = [];
  page.on('request', request => { if (new URL(request.url()).origin !== new URL(base).origin) external.push(request.url()); });
  page.on('websocket', socket => external.push(socket.url()));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/beta/');
  await expect(page.getByRole('heading', { name: 'сфера.', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Открыть в TestFlight' })).toHaveAttribute('href', apple);
  await expect(page.getByRole('link', { name: '1. Вступить в группу' })).toHaveAttribute('href', group);
  await expect(page.getByRole('link', { name: '2. Установить бету' })).toHaveAttribute('href', play);
  await expect(page.locator('.beta-share svg')).toBeVisible();
  await page.locator('.beta-share svg').screenshot({ path: 'output/playwright/beta-qr.png' });
  await page.getByRole('button', { name: 'Скопировать ссылку' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(new URL(new URL(base).hostname === 'sfera.brainwaves.engineering' ? '/' : '/beta/', base).href);
  await expect(page.getByRole('status')).toHaveText('Ссылка скопирована');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Все устройства' })).toHaveAttribute('aria-pressed', 'true');
  expect(external).toEqual([]);
  await page.screenshot({ path: 'output/playwright/beta-desktop.png', fullPage: true });
});

for (const item of [
  { name: 'iPhone Safari', ...devices['iPhone 13'], expected: 'iPhone / iPad' },
  { name: 'Android Chrome', ...devices['Pixel 7'], expected: 'Android' },
  { name: 'desktop iPad', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15', viewport: { width: 1024, height: 768 }, hasTouch: true, expected: 'iPhone / iPad' },
  { name: 'unknown 320px', userAgent: 'UnknownBrowser', viewport: { width: 320, height: 720 }, expected: 'Все устройства' },
]) {
  test(`${item.name}: detection, manual choice, layout`, async ({ browser }) => {
    const { name, expected, defaultBrowserType: _browser, ...options } = item as typeof item & { defaultBrowserType?: string };
    const safari = expected === 'iPhone / iPad' ? await webkit.launch() : undefined;
    const context = await (safari ?? browser).newContext(options);
    if (name === 'desktop iPad') await context.addInitScript(() => {
      Object.defineProperty(navigator, 'maxTouchPoints', { value: 5 });
      Object.defineProperty(navigator, 'platform', { value: 'MacIntel' });
    });
    const page = await context.newPage();
    await page.goto(new URL('/beta/', base).href);
    await expect(page.getByRole('button', { name: expected, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Android', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'iPhone и iPad' })).toBeHidden();
    await page.getByText('Не получается установить?').click();
    await expect(page.getByText(/Проверка Google может/)).toBeVisible();
    await page.setViewportSize({ width: 320, height: 720 });
    await expect(page.getByRole('button', { name: 'Android', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const button of await page.locator('.beta-page .button:visible').all()) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({ path: `output/playwright/beta-${name.replaceAll(' ', '-')}.png`, fullPage: true });
    await context.close();
    await safari?.close();
  });
}

test('without JS both instructions remain usable', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(new URL('/beta/', base).href);
  await expect(page.getByRole('link', { name: 'Открыть в TestFlight' })).toBeVisible();
  await expect(page.getByRole('link', { name: '2. Установить бету' })).toBeVisible();
  await context.close();
});

test('admin and kit remain gated; keyboard and clipboard failure', async ({ page }) => {
  for (const route of ['/', '/kit/']) {
    await page.goto(route);
    await expect(page.getByRole('heading', { name: 'Административная консоль' })).toBeVisible();
    await expect(page.getByLabel('Пароль', { exact: true })).toBeVisible();
  }
  await page.goto('/beta/');
  await page.getByRole('button', { name: 'iPhone / iPad' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Android', exact: true })).toBeHidden();
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) } }); });
  await page.getByRole('button', { name: 'Скопировать ссылку' }).click();
  await expect(page.getByRole('status')).toContainText('Не удалось скопировать');
});
