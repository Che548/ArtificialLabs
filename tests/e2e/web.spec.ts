import { expect, test } from '@playwright/test';

test('public web client remains a read-only demo', async ({ page }) => {
  const mutationFrames: string[] = [];
  const mutationRequests: string[] = [];

  page.on('request', (request) => {
    if (/\/api\/(mutation|action)/.test(request.url())) {
      mutationRequests.push(request.url());
    }
  });
  page.on('websocket', (socket) => {
    socket.on('framesent', ({ payload }) => {
      const text = typeof payload === 'string' ? payload : payload.toString();
      if (/"type":"(Mutation|Action)"/.test(text)) mutationFrames.push(text);
    });
  });

  await page.goto('/');
  await expect(page.getByText('сфера.', { exact: true })).toBeVisible();
  await page.getByPlaceholder('Email').fill('web-preview@example.test');
  await page.getByPlaceholder('Введите пароль').fill('Preview!123');
  await page
    .getByRole('checkbox', {
      name: 'Согласие на обработку персональных данных',
    })
    .click();
  await page
    .getByRole('checkbox', { name: 'Принятие пользовательского соглашения' })
    .click();
  await page.getByRole('button', { name: 'Далее' }).click();

  await expect(
    page.getByText('Web demo · медицинские данные не сохраняются'),
  ).toBeVisible();

  for (const label of ['Сферка', 'Анализы', 'Сегодня', 'Скан', 'Профиль']) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }

  for (const label of ['Сферка', 'Анализы', 'Сегодня', 'Скан', 'Профиль']) {
    await page.getByText(label, { exact: true }).first().click();
    await expect(
      page.getByText('Web demo · медицинские данные не сохраняются'),
    ).toBeVisible();
  }

  const healthStorageKeys = await page.evaluate(() =>
    [...Object.keys(localStorage), ...Object.keys(sessionStorage)].filter((key) =>
      /health|medical|outbox|profile/i.test(key),
    ),
  );
  expect(healthStorageKeys).toEqual([]);
  expect(mutationRequests).toEqual([]);
  expect(mutationFrames).toEqual([]);
});
