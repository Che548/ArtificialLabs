import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import { createSession } from '../lib/auth';

test.use({
  permissions: ['camera'],
});

for (const source of ['file', 'camera'] as const) {
  test(`${source} runs the real mobile R6 pipeline through the unchanged UI`, async ({ page, context }) => {
    const { token } = createSession('admin');
    await context.addCookies([{ name: 'cv_demo_session', value: token, url: 'http://127.0.0.1:3040', httpOnly: true, sameSite: 'Lax' }]);
    await page.addInitScript(() => localStorage.setItem('sfera-scan-skip', 'true'));
    await page.goto('/');
    await page.getByRole('button', { name: source === 'file' ? 'Загрузить фото' : 'Начать сканирование', exact: true }).click();
    await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
    if (source === 'file') {
      const buffer = await sharp({ create: { width: 800, height: 400, channels: 3, background: '#dddddd' } }).png().toBuffer();
      await page.getByLabel('Загрузить снимок теста', { exact: true }).setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer });
    } else {
      await page.getByRole('button', { name: 'Сделать снимок', exact: true }).click();
    }
    const response = page.waitForResponse(r => r.url().endsWith('/api/analyze') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Распознать', exact: true }).click();
    const result = await response;
    expect(result.status()).toBe(200);
    expect((await result.json()).analysis.algorithm_version).toBe('strip-reader-experimental-20260914-r6');
    await page.getByText('Детали распознавания', { exact: true }).click();
    await expect(page.getByText('strip-reader-experimental-20260914-r6', { exact: true })).toBeVisible();
  });
}
