import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`read-only chat renders without loops at ${viewport.width}px`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    const dialogs: string[] = [];
    page.on('dialog', async dialog => { dialogs.push(dialog.type()); await dialog.dismiss(); });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize(viewport);
    await page.goto('/chat');
    // Local development demonstration only; this never authenticates a user
    // or grants cloud permissions, and is not a production auth workaround.
    await page
      .getByRole('button', { name: 'Войти в локальном режиме разработчика' })
      .click();
    await expect(
      page.getByText(
        'ИИ-чат доступен в приложении для iOS и Android после входа.',
      ),
    ).toBeVisible();
    await expect(
      page.getByRole('textbox', { name: 'Сообщение для Сферки' }),
    ).not.toBeEditable();
    await expect(
      page.getByRole('button', { name: 'Ознакомиться и дать согласие' }),
    ).toHaveCount(0);
    await expect(
      page.getByText('Нет подключения', { exact: true }),
    ).toHaveCount(0);
    expect(errors).toEqual([]);
    await page.screenshot({
      path: `output/playwright/chat-${info.project.name}-${viewport.width}.png`,
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Добавить вложение', exact: true }).click();
    await expect(page.getByTestId('screen-feedback')).toBeVisible();
    await expect(page.getByText('Документы в профиле', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Понятно', exact: true }).click();
    await expect(page.getByTestId('screen-feedback')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Создать синтетический QA-диалог' })).toHaveCount(0);
    expect(dialogs).toEqual([]);
    await page.getByRole('tab', { name: 'Профиль', exact: true }).click();
    await expect(page.getByText('Документы', { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Проверяемый текст документа' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Распознать на устройстве' })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
