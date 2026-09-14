import { test, expect } from '@playwright/test';

test('edits existing article visually, preserves Markdown through source mode, publishes and removes', async ({
  page,
}) => {
  await page.goto('/?section=content');
  await page
    .getByRole('row')
    .filter({ hasText: 'Питание в дневнике' })
    .getByRole('button', { name: 'Редактировать', exact: true })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'Название статьи', exact: true }),
  ).toHaveValue('Питание в дневнике');
  const editor = page.getByRole('textbox', {
    name: 'Текст статьи',
    exact: true,
  });
  await editor.fill('Новая заметка');
  await editor.press('ControlOrMeta+a');
  await page.getByRole('button', { name: 'Жирный', exact: true }).click();
  await page.getByRole('button', { name: 'Исходник .md', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'Исходник Markdown' }),
  ).toHaveValue('**Новая заметка**');
  await page
    .getByRole('textbox', { name: 'Исходник Markdown' })
    .fill('Вступление.\n\n## Мой раздел\n\n- **Пункт**\n- Наблюдение');
  await page
    .getByRole('button', { name: 'Визуальный редактор', exact: true })
    .click();
  await expect(editor.locator('h2')).toHaveText('Мой раздел');
  await expect(editor.locator('li')).toHaveCount(2);
  await page
    .getByRole('combobox', { name: 'Оглавление', exact: true })
    .selectOption({ label: 'Мой раздел' });
  await page
    .getByRole('textbox', { name: 'Название статьи', exact: true })
    .fill('Обновлённая статья');
  await page
    .getByRole('combobox', { name: 'Обложка', exact: true })
    .selectOption('care-plan');
  await page
    .getByRole('button', { name: 'Сохранить черновик', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('Черновик сохранён');
  await expect(
    page.getByRole('row').filter({ hasText: 'Обновлённая статья' }),
  ).toContainText('черновик');
  await page.getByRole('button', { name: 'Опубликовать', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Опубликовано');
  await page.getByRole('button', { name: 'Закрыть редактор' }).click();
  const row = page.getByRole('row').filter({ hasText: 'Обновлённая статья' });
  await row
    .getByRole('button', { name: 'Снять с публикации', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Подтвердить' })
    .click();
  await expect(row).toContainText('Скрыта');
  await row.getByRole('button', { name: 'Удалить', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Отмена', exact: true })
    .click();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Удалить', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Подтвердить' })
    .click();
  await expect(row).toHaveCount(0);
});

test('creates a new article and keeps typed text after a save failure', async ({
  page,
}) => {
  await page.goto('/?section=content&fixture=content-fail');
  await page.getByRole('button', { name: 'Новая статья', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Название статьи', exact: true })
    .fill('Новый материал');
  await page
    .getByRole('textbox', { name: 'Заголовок карточки', exact: true })
    .fill('Моя карточка');
  await page
    .getByRole('textbox', { name: 'Текст статьи', exact: true })
    .fill('Текст сохранится при обрыве связи.');
  await page.getByRole('button', { name: 'Опубликовать', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Не удалось сохранить');
  await expect(
    page.getByRole('textbox', { name: 'Текст статьи', exact: true }),
  ).toContainText('Текст сохранится');
});

test('imports and exports Markdown, rejects HTML and supports a narrow screen', async ({
  page,
}) => {
  await page.goto('/?section=content');
  await page.getByRole('button', { name: 'Новая статья', exact: true }).click();
  await page
    .getByLabel('Открыть .md')
    .setInputFiles({
      name: 'article.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('Вступление\n\n## Раздел\n\n**Важное**'),
    });
  await expect(
    page
      .getByRole('textbox', { name: 'Текст статьи', exact: true })
      .locator('strong'),
  ).toHaveText('Важное');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать .md' }).click();
  expect((await download).suggestedFilename()).toBe('article.md');
  await page.getByRole('button', { name: 'Исходник .md' }).click();
  await page
    .getByRole('textbox', { name: 'Исходник Markdown' })
    .fill('<script>alert(1)</script>');
  await page
    .getByRole('button', { name: 'Визуальный редактор', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('Поддерживаются текст');
  await page
    .getByRole('textbox', { name: 'Исходник Markdown' })
    .fill('Вступление\n\n## Раздел\n\nТекст');
  await page
    .getByRole('button', { name: 'Визуальный редактор', exact: true })
    .click();
  await page.screenshot({
    path: 'output/playwright/today-editor-desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: 'output/playwright/today-editor-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
});

test('initializes current articles once and publishes a newly created card', async ({
  page,
}) => {
  await page.goto('/?section=content&fixture=content-uninitialized');
  await page
    .getByRole('button', { name: 'Включить управление статьями' })
    .click();
  await expect(
    page.getByRole('row').filter({ hasText: 'Питание в дневнике' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Новая статья', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Название статьи', exact: true })
    .fill('Новая статья о записях');
  await page
    .getByRole('textbox', { name: 'Заголовок карточки', exact: true })
    .fill('Мои записи');
  await page
    .getByRole('textbox', { name: 'Текст статьи', exact: true })
    .fill('Вступление к новой статье.');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Обзор', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'Текст статьи', exact: true }),
  ).toContainText('Вступление к новой статье.');
  await page.getByRole('button', { name: 'Опубликовать', exact: true }).click();
  await expect(
    page.getByRole('row').filter({ hasText: 'Новая статья о записях' }),
  ).toContainText('Опубликована');
  await page.getByRole('button', { name: 'Закрыть редактор' }).click();
  await page
    .getByRole('row')
    .filter({ hasText: 'Новая статья о записях' })
    .getByRole('button', { name: 'Редактировать', exact: true })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'Текст статьи', exact: true }),
  ).toContainText('Вступление к новой статье.');
});
