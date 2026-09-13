import { test, expect } from '@playwright/test';

test('account directory, pagination, search and URL history', async ({ page }) => {
  await page.goto('/?section=users');
  await expect(page.locator('tbody tr')).toHaveCount(25);
  await page.getByRole('button', { name: 'Показать ещё' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(50);
  await page.getByRole('textbox', { name: 'Поиск по началу email' }).fill('reader02');
  await page.getByRole('button', { name: 'Найти', exact: true }).click();
  await expect(page).toHaveURL(/email=reader02/);
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.getByText('Ожидает удаления', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'Сбросить' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(25);
  await page.goBack();
  await expect(page.locator('tbody tr')).toHaveCount(1);
});

test('loading, empty and failed data are distinguishable', async ({ page }) => {
  await page.goto('/?section=users&fixture=loading');
  await expect(page.getByRole('status')).toContainText('Загрузка');
  await expect(page.getByText('Аккаунтов пока нет.', { exact: false })).toHaveCount(0);
  await page.goto('/?section=users&fixture=empty');
  await expect(page.getByText('Аккаунтов пока нет.', { exact: false })).toBeVisible();
  await page.goto('/?section=users&fixture=error');
  await expect(page.getByRole('alert')).toContainText('Не удалось загрузить');
  await page.getByRole('button', { name: 'Повторить загрузку' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
});

test('access gates and missing migration', async ({ page }) => {
  await page.goto('/?fixture=guest');
  await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeVisible();
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await page.goto('/?fixture=ordinary');
  await expect(page.getByRole('heading', { name: 'Доступ запрещён' })).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await page.goto('/?fixture=migration');
  await expect(page.getByText('Статистика аккаунтов ещё не готова')).toBeVisible();
  await expect(page.getByText('Всего аккаунтов сейчас')).toHaveCount(0);
});

test('period navigation and offline indicator', async ({ page }) => {
  await page.goto('/?fixture=offline');
  await expect(page.getByText('Переподключение…', { exact: true })).toBeVisible();
  await page.getByRole('combobox').selectOption('7');
  await expect(page).toHaveURL(/period=7/);
  await page.reload();
  await expect(page.getByRole('combobox')).toHaveValue('7');
});

test('all catalog sections remain navigable without fake records', async ({ page }) => {
  await page.goto('/');
  for (const name of ['Тест-системы', 'Партии', 'Калибровки', 'Валидация', 'Материалы', 'Мониторинг', 'Администраторы', 'Аудит']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.screenshot({ path: `output/playwright/admin-redesign-${name}.png`, animations: 'disabled' });
  }
});

test('mobile navigation, no page overflow, screenshots', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/?section=users&email=reader02');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.screenshot({ path: 'output/playwright/admin-desktop.png', animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Открыть навигацию' })).toBeVisible();
  await page.getByRole('button', { name: 'Открыть навигацию' }).click();
  await page.getByRole('button', { name: 'Обзор', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Обзор', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('.nav-scrim')).toHaveCount(0);
  await page.screenshot({ path: 'output/playwright/admin-mobile.png', animations: 'disabled' });
});
