import { test, expect } from '@playwright/test';
for (const [name, width, height] of [
  ['phone', 390, 844],
  ['android-size', 412, 915],
  ['tablet', 1024, 1366],
] as const) {
  test(`${name}: mandatory email code and phone change fields`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.clock.install();
    await page.goto('http://127.0.0.1:4321/?login=1&phone=1');
    await page.getByTestId('login-email-code').fill('000000');
    await page.getByTestId('login-email-confirm').dblclick();
    await expect(page.getByText('Код неверный или истёк.')).toBeVisible();
    await page.clock.fastForward(61000);
    await page.getByTestId('login-email-resend').click();
    await expect(page.getByTestId('login-email-code')).toHaveValue('');
    await page.screenshot({
      path: `output/playwright/login-email-${name}.png`,
    });
    await page.getByTestId('login-email-code').fill('123456');
    await page.getByTestId('login-email-confirm').click();
    await expect(page.getByText('Вход подтверждён')).toBeVisible();
    await page.getByTestId('profile-change-phone').click();
    await page.getByTestId('phone-change-password').fill('FixturePassword123!');
    await expect(page.getByTestId('phone-change-submit')).toBeVisible();
    // RN Web's modal uses a JS-driven entrance animation; wait for its 300ms transition.
    await page.waitForTimeout(350);
    await page.screenshot({
      path: `output/playwright/phone-change-${name}.png`,
    });
    await page.getByTestId('contact-modal-close').click();
    await page.getByTestId('profile-change-phone').click();
    await expect(page.getByTestId('phone-change-password')).toHaveValue('');
  });
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
    await expect(
      page.getByText(
        'Не удалось выполнить запрос. Проверьте подключение и попробуйте позже.',
      ),
    ).toBeVisible();
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

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`outside tap dismisses, inside tap preserves draft (${reducedMotion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://127.0.0.1:4321');
    await page.getByTestId('profile-change-email').click();
    const input = page.getByTestId('email-change-address');
    await input.fill('draft@example.test');
    await input.click();
    await expect(input).toHaveValue('draft@example.test');
    await page.getByTestId('sheet-backdrop').click({ position: { x: 5, y: 5 } });
    await expect(input).toBeHidden();
    await page.getByTestId('profile-change-email').click();
    await expect(input).toHaveValue('');
    await page.keyboard.press('Escape');
    await expect(input).toBeHidden();
  });
}
