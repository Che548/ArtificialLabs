import { expect, test, type Page } from '@playwright/test';
test.use({ viewport: { width: 390, height: 844 } });
test.beforeEach(async ({ page }) => {
  page.on('pageerror', error => console.error(`Synthetic document fixture: ${error.message}`));
});
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) {
    await info.attach('synthetic-document-ui', { body: await page.screenshot(), contentType: 'image/png' });
    await info.attach('synthetic-document-dom', { body: await page.locator('body').innerText(), contentType: 'text/plain' });
  }
});
const command = (page: Page, name: string) =>
  page.evaluate((key) => (window as any).fixture[key](), name);
const events = (page: Page, name = 'operations') =>
  page.evaluate((key) => (window as any).fixture[key], name);
async function consent(page: Page) {
  await page.getByRole('button', { name: 'Разрешения и данные', exact: true }).click();
  const toggle = page.getByRole('switch', { name: 'Распознавание документов', exact: true });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(toggle).toBeChecked();
  await page.getByRole('button', { name: 'К документам', exact: true }).click();
}
async function open(page: Page) {
  await page
    .getByRole('button', { name: /Synthetic laboratory document/ })
    .click();
}
test('consent gates recognition; import, progress, cancellation and explicit retry are connected', async ({
  page,
}) => {
  await page.goto('/');
  await open(page);
  await expect(
    page.getByRole('button', { name: 'Распознать документ', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Настроить распознавание', exact: true }).click();
  const permission = page.getByRole('switch', { name: 'Распознавание документов', exact: true });
  await expect(permission).not.toBeChecked();
  await permission.check();
  await expect(permission).toBeChecked();
  await page.getByRole('button', { name: 'К документам', exact: true }).click();
  expect(await events(page)).toEqual(['consent:true']); // Old documents are never auto-enqueued by consent.
  await page.getByRole('button', { name: 'Добавить документ' }).click();
  expect(await events(page)).toEqual([
    'consent:true',
    'save-original',
    'save-document',
    'enqueue:synthetic-doc:0',
  ]);
  await command(page, 'progress');
  await open(page);
  await expect(page.getByText('Страницы: 1 из 2')).toBeVisible();
  await page.getByRole('button', { name: 'Отменить распознавание' }).click();
  expect(await events(page)).toContain('cancel:synthetic-doc');
  await command(page, 'uncertain');
  await page
    .getByRole('button', {
      name: 'Продолжить распознавание',
      exact: true,
    })
    .click();
  expect(
    (await events(page)).filter((value: string) =>
      value.startsWith('enqueue:'),
    ),
  ).toHaveLength(2);
  await page
    .getByRole('button', { name: 'Закрыть окно', exact: true })
    .last()
    .click();
  await page.getByRole('button', { name: 'Разрешения и данные', exact: true }).click();
  const toggle = page.getByRole('switch', { name: 'Распознавание документов', exact: true });
  await toggle.uncheck();
  await expect(toggle).not.toBeChecked();
  expect(await events(page)).toContain('consent:false');
});
test('review is compact, survives delayed disk load, and only checked values are saved', async ({
  page,
}) => {
  await page.goto('/?slow');
  await command(page, 'setDisk');
  await open(page);
  await command(page, 'complete');
  await command(page, 'finishLoad');
  await expect(
    page.getByRole('button', { name: 'Выберите показатели', exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel('Значение 1', { exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Текст', exact: true }).click();
  await expect(
    page.getByLabel('Проверяемый текст документа', { exact: true }),
  ).toHaveValue('Synthetic CRP <0,10 mg/L');
  await page.getByRole('tab', { name: 'Показатели', exact: true }).click();
  await page
    .getByRole('checkbox', { name: 'Проверено: CRP', exact: true })
    .check();
  await page
    .getByRole('button', { name: 'Изменить показатель 1', exact: true })
    .click();
  await page.getByLabel('Значение 1', { exact: true }).fill('<0,20');
  await expect(
    page.getByRole('checkbox', { name: 'Проверено: CRP', exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByRole('button', { name: 'Выберите показатели', exact: true }),
  ).toBeDisabled();
  await expect
    .poll(async () => (await events(page, 'saved')).at(-1)?.analytes[0].value)
    .toBe('<0,20');
  expect(await events(page, 'confirmed')).toEqual([]);
  await page
    .getByRole('checkbox', { name: 'Проверено: CRP', exact: true })
    .check();
  await expect(
    page.getByText('Будет сохранено: 1 · дата анализа: 11.09.2026'),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Сохранить показатели (1)', exact: true })
    .click();
  const confirmed = await events(page, 'confirmed');
  expect(confirmed).toHaveLength(1);
  expect(confirmed[0].analytes[0]).toMatchObject({
    value: '<0,20',
    selected: true,
    reviewed: true,
  });
  await expect(
    page.getByText('Показатели сохранены', { exact: true }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Текст', exact: true }).click();
  await page
    .getByLabel('Проверяемый текст документа', { exact: true })
    .fill('Edited synthetic text');
  await page
    .getByRole('button', { name: 'Закрыть окно', exact: true })
    .last()
    .click();
  expect((await events(page, 'saved')).at(-1).editedText).toBe(
    'Edited synthetic text',
  );
});

test('sync state is truthful and deletion stops OCR before removing the document', async ({
  page,
}) => {
  await page.goto('/');
  await consent(page);
  await command(page, 'syncOff');
  await open(page);
  await expect(page.getByText('Для распознавания включите облачную синхронизацию в разрешениях.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Распознать документ', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Закрыть окно', exact: true }).last().click();
  const document = page.getByRole('button', { name: /Synthetic laboratory document/ });
  await document.click({ delay: 650 });
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Удалить', exact: true }).click();
  expect((await events(page)).slice(-2)).toEqual([
    'cancel:synthetic-doc',
    'delete:synthetic-doc',
  ]);
  await expect(page.getByText('Документы пока не добавлены')).toBeVisible();
});
test('removed documents close their review and read-only mode blocks document actions', async ({
  page,
}) => {
  await page.goto('/');
  await open(page);
  await command(page, 'remove');
  await expect(
    page.getByRole('button', { name: 'Закрыть окно', exact: true }),
  ).toHaveCount(0);
  await page.goto('/?readonly');
  await expect(
    page.getByRole('button', { name: 'Добавить документ' }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: /Synthetic laboratory document/ }),
  ).toBeEnabled();
  await open(page);
  await expect(page.getByRole('button', { name: 'Распознать документ', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Сохранить показатели/ })).toHaveCount(0);

});

test('original preview and OCR use the chosen page orientation', async ({
  page,
}) => {
  await page.goto('/');
  await consent(page);
  await open(page);
  await page.getByRole('tab', { name: 'Оригинал', exact: true }).click();
  await page
    .getByRole('button', { name: 'Следующая страница', exact: true })
    .click();
  await page
    .getByRole('button', { name: /Повернуть перед распознаванием на 90°/ })
    .click();
  expect(await events(page, 'renders')).toEqual([
    { uri: 'file:///synthetic.pdf', page: 1, rotation: 0 },
    { uri: 'file:///synthetic.pdf', page: 2, rotation: 0 },
    { uri: 'file:///synthetic.pdf', page: 2, rotation: 90 },
  ]);
  await page.getByRole('tab', { name: 'Показатели', exact: true }).click();
  await page
    .getByRole('button', { name: 'Распознать документ', exact: true })
    .click();
  expect(await events(page)).toContain('enqueue:synthetic-doc:90');
});

test('unavailable OCR clearly explains why consent cannot be accepted', async ({
  page,
}) => {
  await page.goto('/');
  await command(page, 'syncOff');
  await page.getByRole('button', { name: 'Разрешения и данные', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Распознавание документов', exact: true })).toBeDisabled();
  await expect(page.getByText('Сначала включите облачную синхронизацию', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'К документам', exact: true }).click();
  expect(await events(page)).toEqual([]);
  await expect(
    page.getByRole('button', { name: 'Добавить документ', exact: true }),
  ).toBeEnabled();
});

test('mixed dates require a date and preserve unchecked rows in the draft', async ({
  page,
}) => {
  await page.goto('/');
  await command(page, 'mixed');
  await open(page);
  await page
    .getByRole('checkbox', { name: 'Проверено: CRP', exact: true })
    .check();
  await expect(
    page.getByRole('button', { name: 'Сохранить показатели (1)', exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('button', { name: 'Дата анализа 2026-09-11', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Сохранить показатели (1)', exact: true }),
  ).toBeEnabled();
  await page
    .getByRole('button', { name: 'Дата анализа 2026-09-12', exact: true })
    .click();
  await expect(
    page.getByRole('checkbox', { name: 'Проверено: CRP', exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByRole('checkbox', { name: 'Проверено: CRP', exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('checkbox', { name: 'Проверено: Qualitative', exact: true })
    .check();
  await page
    .getByRole('button', { name: 'Сохранить показатели (1)', exact: true })
    .click();
  const value = (await events(page, 'confirmed'))[0];
  expect(value.analytes).toHaveLength(2);
  expect(value.analytes[0].selected).toBe(false);
  expect(value.analytes[1]).toMatchObject({
    value: 'Отрицательно',
    selected: true,
    reviewed: true,
  });
  await expect(
    page.getByRole('button', { name: 'Проверить остальные', exact: true }),
  ).toBeVisible();
});

test('large reports show compact rows and source comparison returns to the same edit', async ({
  page,
}) => {
  await page.goto('/');
  await command(page, 'many');
  await open(page);
  await expect(page.getByRole('checkbox')).toHaveCount(24);
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Изменить показатель 1', exact: true })
    .click();
  await expect(page.getByRole('textbox')).toHaveCount(6);
  await page
    .getByRole('button', { name: 'Сверить со страницей 1', exact: true })
    .click();
  await expect(
    page.getByRole('img', { name: 'Оригинал, страница 1', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Вернуться к показателям', exact: true })
    .click();
  await expect(page.getByLabel('Значение 1', { exact: true })).toHaveValue(
    '<0,10',
  );
});

test('failed autosave keeps edits visible and can retry without importing values', async ({
  page,
}) => {
  await page.goto('/');
  await command(page, 'complete');
  await open(page);
  await command(page, 'failWrites');
  await page
    .getByRole('button', { name: 'Изменить показатель 1', exact: true })
    .click();
  await page.getByLabel('Значение 1', { exact: true }).fill('2,75');
  await expect(
    page.getByText(
      'Правки пока не сохранены. Оставьте документ открытым и повторите попытку.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByLabel('Значение 1', { exact: true })).toHaveValue(
    '2,75',
  );
  await command(page, 'resumeWrites');
  await page
    .getByRole('button', { name: 'Повторить сохранение', exact: true })
    .click();
  await expect
    .poll(async () => (await events(page, 'saved')).at(-1)?.analytes[0].value)
    .toBe('2,75');
  expect(await events(page, 'confirmed')).toEqual([]);
});

test('structured report keeps conclusions and sections; only collection dates and observations are importable', async ({page}) => {
  await page.goto('/'); await command(page,'structured'); await open(page);
  await expect(page.getByRole('tab',{name:'Документ',exact:true})).toBeVisible();
  await expect(page.getByText('Conclusion: specimen findings are listed separately.',{exact:true})).toBeVisible();
  await expect(page.getByText('Serum · стр. 1',{exact:true})).toBeVisible();
  await expect(page.getByText('Urine · стр. 1',{exact:true})).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(2);
  await expect(page.getByRole('button',{name:'Дата анализа 1988-06-14'})).toHaveCount(0);
  await page.getByRole('button',{name:'Дата анализа 2024-02-29'}).click();
  await page.screenshot({path:'output/e2e/ocr/structured-document-review.png'});
  await page.getByRole('button',{name:'Методы, примечания и приложения'}).click();
  await expect(page.getByText('Technique optical',{exact:true})).toBeVisible();
  await page.getByRole('checkbox').first().click();
  await page.getByRole('button',{name:'Сохранить показатели (1)'}).click();
  const records=await events(page,'confirmed');expect(records).toHaveLength(1);
  expect(records[0].analytes[0]).toMatchObject({name:'Marker',section:'Serum',value:'<1,25',reviewed:true});
  expect(records[0].analytes[1].selected).toBe(false);
});
