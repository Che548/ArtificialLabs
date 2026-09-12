import { expect, test } from '@playwright/test';

test('registration discloses AI/cloud in the existing unchecked choice', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/chat');
  const consent = page.getByTestId('e2e-auth-consent-personal');
  await expect(consent).not.toBeChecked();
  await expect(consent).toHaveAccessibleName(/облачную синхронизацию и ИИ Яндекс AI Studio/);
  await expect(page.getByTestId('e2e-auth-submit')).toBeDisabled();
  await page.getByTestId('e2e-auth-identifier').fill('synthetic@example.test');
  await page.getByTestId('e2e-auth-password').fill('SyntheticUiOnly123');
  await expect(page.getByTestId('e2e-auth-submit')).toBeDisabled();
  await consent.check();
  await page.getByTestId('e2e-auth-consent-agreement').check();
  await expect(page.getByTestId('e2e-auth-submit')).toBeEnabled();
  await expect(page.getByTestId('e2e-auth-consent-agreement').getByText('✓', { exact: true })).toHaveCSS('opacity', '1');
  await page.screenshot({ path: `output/playwright/registration-${info.project.name}-390.png` });
  // UI only: no signup, email delivery, cloud activation or AI call is made.
});

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
    const notice = await page.getByTestId('web-demo-notice').boundingBox();
    const content = await page.getByTestId('web-demo-content').boundingBox();
    expect(notice).not.toBeNull();
    expect(content).not.toBeNull();
    expect(content!.y).toBeGreaterThanOrEqual(notice!.y + notice!.height);
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
