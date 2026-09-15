import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import {
  defaultTodayArticles,
  defaultArticleMarkdown,
} from '../shared/today-content';
const modules = import.meta.glob('./**/*.ts');
const page = { paginationOpts: { numItems: 20, cursor: null } };
const fields = {
  title: 'Заголовок',
  cardTitle: 'Карточка',
  cardKind: 'article' as const,
  coverPreset: 'nutrition' as const,
  sortOrder: 3,
  markdown:
    'Вступление.\n\n## Раздел\n\n**Важное** и *наблюдения*.\n\n- Первый пункт\n- Второй пункт',
  publish: false,
  requestId: 'test',
};
async function setup() {
  const t = convexTest(schema, modules);
  const id = await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', {});
    await ctx.db.insert('adminMemberships', {
      userId,
      role: 'admin',
      grantedBy: userId,
      emailSnapshot: 'admin@example.test',
      grantedAt: 1,
      updatedAt: 1,
    });
    return userId;
  });
  const admin = t.withIdentity({ subject: `${id}|test` });
  return { t, admin, id };
}

describe('Today editorial content', () => {
  test('gates all admin operations, while serving only public published content', async () => {
    const { t, admin } = await setup();
    await expect(t.query(api.todayContent.status, {})).rejects.toThrow();
    await expect(t.query(api.todayContent.list, page)).rejects.toThrow();
    await expect(t.query(api.todayContent.covers, page)).rejects.toThrow();
    await expect(
      t.mutation(api.todayContent.initialize, { requestId: 'x' }),
    ).rejects.toThrow();
    await expect(t.mutation(api.todayContent.save, fields)).rejects.toThrow();
    expect(await t.query(api.todayContent.published, {})).toBeNull();
    await admin.mutation(api.todayContent.initialize, { requestId: 'init' });
    await admin.mutation(api.todayContent.initialize, {
      requestId: 'init-again',
    });
    const published = await t.query(api.todayContent.published, {});
    expect(published).toHaveLength(2);
    expect(published![0].markdown).toBe(
      defaultArticleMarkdown(defaultTodayArticles[0]),
    );
    expect(JSON.stringify(published)).not.toMatch(
      /authorId|reviewerId|storageId|userId/,
    );
    const first = (await admin.query(api.todayContent.list, page)).page[0];
    await expect(
      t.mutation(api.todayContent.remove, {
        itemId: first._id,
        expectedUpdatedAt: first.updatedAt,
        delete: true,
        requestId: 'x',
      }),
    ).rejects.toThrow();
    const ordinaryId = await t.run((ctx) => ctx.db.insert('users', {}));
    await expect(
      t
        .withIdentity({ subject: `${ordinaryId}|test` })
        .mutation(api.todayContent.save, fields),
    ).rejects.toThrow('ADMIN_REQUIRED');
  });

  test('draft changes never change published text, cover, order or caption; stale edits cannot win', async () => {
    const { t, admin } = await setup();
    await admin.mutation(api.todayContent.initialize, { requestId: 'init' });
    const first = (await admin.query(api.todayContent.list, page)).page[0];
    const before = await t.query(api.todayContent.published, {});
    const saved = await admin.mutation(api.todayContent.save, {
      ...fields,
      itemId: first._id,
      expectedVersion: 1,
      coverPreset: 'care-plan',
      sortOrder: 0,
    });
    expect(await t.query(api.todayContent.published, {})).toEqual(before);
    await expect(
      admin.mutation(api.todayContent.save, {
        ...fields,
        itemId: first._id,
        expectedVersion: 1,
        publish: true,
      }),
    ).rejects.toThrow('CONTENT_CONFLICT');
    await admin.mutation(api.todayContent.save, {
      ...fields,
      itemId: first._id,
      expectedVersion: saved.version,
      publish: true,
      sortOrder: 0,
    });
    expect((await t.query(api.todayContent.published, {}))![0]).toMatchObject({
      title: fields.title,
      markdown: fields.markdown,
      sortOrder: 0,
    });
    await expect(
      admin.mutation(api.adminCatalog.saveContent, {
        contentItemId: first._id,
        key: first.key,
        category: 'article',
        placement: 'elsewhere',
        title: 'Bypass',
        markdown: 'Bypass',
        requestId: 'x',
      }),
    ).rejects.toThrow('USE_TODAY_EDITOR');
  });

  test('unpublish, republish and delete preserve an intentionally empty feed and do not resurrect defaults', async () => {
    const { t, admin } = await setup();
    await admin.mutation(api.todayContent.initialize, { requestId: 'init' });
    let rows = (await admin.query(api.todayContent.list, page)).page;
    await admin.mutation(api.todayContent.remove, {
      itemId: rows[0]._id,
      expectedUpdatedAt: rows[0].updatedAt,
      delete: false,
      requestId: 'hide',
    });
    expect(await t.query(api.todayContent.published, {})).toHaveLength(1);
    await admin.mutation(api.todayContent.save, {
      ...fields,
      itemId: rows[0]._id,
      expectedVersion: 1,
      publish: true,
    });
    expect(await t.query(api.todayContent.published, {})).toHaveLength(2);
    rows = (await admin.query(api.todayContent.list, page)).page;
    for (const row of rows)
      await admin.mutation(api.todayContent.remove, {
        itemId: row._id,
        expectedUpdatedAt: row.updatedAt,
        delete: true,
        requestId: 'delete',
      });
    expect(await t.query(api.todayContent.published, {})).toEqual([]);
    expect((await admin.query(api.todayContent.list, page)).page).toEqual([]);
    await admin.mutation(api.todayContent.initialize, {
      requestId: 'init-again',
    });
    expect(await t.query(api.todayContent.published, {})).toEqual([]);
    await expect(
      admin.mutation(api.todayContent.save, {
        ...fields,
        itemId: rows[0]._id,
        expectedVersion: 2,
        publish: true,
      }),
    ).rejects.toThrow('CONTENT_NOT_FOUND');
    const audit = await t.run((ctx) =>
      ctx.db.query('adminAuditEvents').collect(),
    );
    expect(audit.some((event) => event.action === 'today.delete')).toBe(true);
  });

  test('rejects unsupported Markdown and non-CMS or unvalidated covers before publication', async () => {
    const { t, admin, id } = await setup();
    await admin.mutation(api.todayContent.initialize, { requestId: 'init' });
    for (const markdown of [
      '<script>alert(1)</script>',
      '![photo](https://example.test/a.png)',
      '[link](https://example.test)',
      '# Title',
      '```js\ncode\n```',
    ]) {
      await expect(
        admin.mutation(api.todayContent.save, { ...fields, markdown }),
      ).rejects.toThrow('ARTICLE_FORMAT_UNSUPPORTED');
    }
    const assetId = await t.run(async (ctx) => {
      const storageId = await ctx.storage.store(
        new Blob(['fixture'], { type: 'image/png' }),
      );
      return ctx.db.insert('adminAssets', {
        storageId,
        kind: 'reference_csv',
        fileName: 'data.csv',
        mimeType: 'text/csv',
        size: 7,
        status: 'validated',
        createdBy: id,
        createdAt: 1,
        updatedAt: 1,
      });
    });
    await expect(
      admin.mutation(api.todayContent.save, {
        ...fields,
        imageAssetId: assetId,
        publish: true,
      }),
    ).rejects.toThrow('ASSET_NOT_VALIDATED');
    await t.run((ctx) =>
      ctx.db.patch(assetId, {
        kind: 'cms_image',
        mimeType: 'image/png',
        status: 'uploaded',
      }),
    );
    await expect(
      admin.mutation(api.todayContent.save, {
        ...fields,
        imageAssetId: assetId,
        publish: true,
      }),
    ).rejects.toThrow('ASSET_NOT_VALIDATED');
    await t.run((ctx) => ctx.db.patch(assetId, { status: 'validated' }));
    await admin.mutation(api.todayContent.save, {
      ...fields,
      imageAssetId: assetId,
      publish: true,
    });
    const publicRows = await t.query(api.todayContent.published, {});
    expect(
      publicRows!.find((row) => row.title === fields.title)?.imageUrl,
    ).toContain('/api/storage/');
  });
});
