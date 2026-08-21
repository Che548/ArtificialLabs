import { expect, test } from '@playwright/test';

test('admin and UI kit are login protected', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('heading', { name: 'Административная консоль' }),
  ).toBeVisible();
  await expect(page.getByText('Саморегистрация отключена.')).toBeVisible();
  await expect(page.getByText('Dashboard', { exact: true })).not.toBeVisible();

  await page.goto('/kit/', { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('heading', { name: 'Административная консоль' }),
  ).toBeVisible();
  await expect(
    page.getByText('Foundations', { exact: true }),
  ).not.toBeVisible();
});

test('invalid credentials fail without revealing access state', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('textbox', { name: 'Email' })
    .fill('not-admin@example.test');
  await page.getByLabel('Пароль').fill('Wrong!Password123');
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(
    page.getByText('Не удалось войти. Проверьте email и пароль.'),
  ).toBeVisible();
  await expect(page.getByText('Dashboard', { exact: true })).not.toBeVisible();
});

test('admin can open every bounded workspace section', async ({ page }) => {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  test.skip(
    !email || !password,
    'Protected admin E2E credentials are not configured',
  );
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Email' }).fill(email!);
  await page.getByLabel('Пароль').fill(password!);
  await page.getByRole('button', { name: 'Войти' }).click();
  for (const section of [
    'Dashboard',
    'Test Systems',
    'Lots',
    'Calibrations',
    'Validation',
    'Content',
    'Monitoring',
    'Admin Access',
    'Audit',
  ]) {
    await page.getByRole('button', { name: section, exact: true }).click();
    await expect(
      page.getByRole('heading', { name: section, exact: true }),
    ).toBeVisible();
  }
  await page.goto('/kit/');
  await expect(page.getByText('Foundations', { exact: true })).toBeVisible();
});
