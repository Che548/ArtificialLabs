import { test, expect } from '@playwright/test';
import documents from '../../content/legal/documents.json';
test.beforeEach(async ({ page }) => { page.on('pageerror', error => { throw error; }); });
for (const [name, width, height] of [['phone', 390, 844], ['tablet', 1024, 1366]] as const) {
  test(`${name}: registration links open offline full texts without accepting`, async ({ page, context }) => {
    await page.setViewportSize({ width, height });
    await page.goto('http://127.0.0.1:4323');
    await context.setOffline(true);
    await page.getByRole('link', { name: 'Политикой обработки персональных данных', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Политика обработки персональных данных Sfera', exact: true })).toBeVisible();
    await page.getByText('Телефон: +7 (916) 541-10-34.', { exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByText('Телефон: +7 (916) 541-10-34.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Закрыть окно', exact: true }).click();
    await expect(page.getByTestId('e2e-auth-consent-personal')).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByTestId('e2e-auth-consent-agreement')).toHaveAttribute('aria-checked', 'false');
    await page.getByRole('link', { name: 'Пользовательского соглашения', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Пользовательское и лицензионное соглашение Sfera', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Все документы', exact: true }).click();
    for (const document of documents) {
      await page.getByTestId(`legal-link-${document.id}`).click();
      await expect(page.getByRole('heading', { name: document.title, exact: true })).toBeVisible();
      if (document.notice) await expect(page.getByText(document.notice, { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Все документы', exact: true }).click();
    }
    await page.getByTestId('legal-link-privacy').click();
    await page.screenshot({ path: `output/playwright/legal-${name}.png` });
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('e2e-auth-consent-agreement')).toBeVisible();
    await page.getByTestId('legal-open-index').click();
    await expect(page.getByRole('heading', { name: 'Документы Sfera', exact: true })).toBeVisible();
    expect(context.pages()).toHaveLength(1);
  });
}
test('reader above consent sheet closes back to consent', async ({ page }) => {
  await page.goto('http://127.0.0.1:4323');
  await page.getByTestId('open-consent').click();
  await page.getByTestId('legal-open-ai').click();
  await expect(page.getByRole('heading', { name: 'Правила ИИ функций Sfera', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText('Доступ к ИИ', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('open-consent')).toBeVisible();
});

test('reader dismisses by backdrop without accepting consent', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:4323');
  await page.getByTestId('legal-open-index').click();
  await expect(page.getByRole('heading', { name: 'Документы Sfera', exact: true })).toBeVisible();
  await page.getByTestId('sheet-backdrop').click({ position: { x: 5, y: 5 } });
  await expect(page.getByTestId('e2e-auth-consent-agreement')).toHaveAttribute('aria-checked', 'false');
});
