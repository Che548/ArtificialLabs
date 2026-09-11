import { test, expect } from '@playwright/test';
for (const [name, width, height] of [
  ['phone', 390, 844],
  ['android-size', 412, 915],
  ['tablet', 1024, 1366],
] as const) {
  test(`${name}: contacts, modal dismissal, email password/code and retry states`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.clock.install();
    await page.goto('http://127.0.0.1:4321');
    await page.getByTestId('profile-add-phone').click();
    await expect(page.getByText('Стенд: SMS не отправляются')).toBeVisible();
    await page.getByTestId('contact-modal-close').click();
    await page.getByTestId('profile-change-email').click();
    await page.getByTestId('email-change-address').fill('new@example.test');
    await page.getByTestId('email-change-password').fill('NetworkFailure123!');
    await page.getByTestId('email-change-submit').click();
    await expect(page.getByText('Не удалось выполнить запрос. Проверьте подключение и попробуйте позже.')).toBeVisible();
    await page.getByTestId('email-change-password').fill('WrongPassword123!');
    await page.getByTestId('email-change-submit').click();
    await expect(page.getByText('Неверный текущий пароль.')).toBeVisible();
    await page.getByTestId('email-change-password').fill('FixturePassword123!');
    await page.getByTestId('email-change-submit').dblclick();
    await expect(page.getByTestId('email-change-code')).toBeVisible();
    await expect(page.getByTestId('email-change-resend')).toBeDisabled();
    await page.getByTestId('email-change-code').fill('000000');
    await page.getByTestId('email-change-submit').click();
    await expect(
      page.getByText('Код неверный или истёк. Запросите новый код.'),
    ).toBeVisible();
    await page.screenshot({ path: `output/playwright/contact-${name}.png` });
    await page.clock.fastForward(61000);
    await expect(page.getByTestId('email-change-resend')).toBeEnabled();
    await page.getByTestId('email-change-resend').click();
    await expect(page.getByTestId('email-change-code')).toHaveValue('');
    await expect(page.getByTestId('email-change-resend')).toBeDisabled();
    await page.getByTestId('email-change-code').fill('123456');
    await page.getByTestId('email-change-submit').click();
    await expect(page.getByText('Электронная почта изменена.')).toBeVisible();
    await page.getByTestId('profile-change-email').click();
    await expect(page.getByTestId('email-change-password')).toHaveValue('');
    await expect(page.getByTestId('email-change-address')).toHaveValue('');
  });
}
