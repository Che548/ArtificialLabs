import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { requireAdmin, writeAdminAudit } from './lib/adminAccess';
import {
  defaultTodayArticles,
  defaultArticleMarkdown,
  TODAY_ARTICLE_LIMIT,
  TODAY_MARKDOWN_LIMIT,
} from '../shared/today-content';
import { parseArticleMarkdown } from '../shared/article-markdown';

const placement = 'today';
const fields = {
  title: v.string(),
  markdown: v.string(),
  cardTitle: v.string(),
  cardKind: v.union(v.literal('article'), v.literal('care-plan')),
  coverPreset: v.union(v.literal('nutrition'), v.literal('care-plan')),
  imageAssetId: v.optional(v.id('adminAssets')),
  sortOrder: v.number(),
};
const clean = (value: string, limit: number) => {
  const text = value.trim();
  if (!text || text.length > limit) throw new Error('INVALID_ARTICLE_FIELDS');
  return text;
};
const collection = (ctx: Pick<QueryCtx, 'db'>) =>
  ctx.db
    .query('contentCollections')
    .withIndex('by_key', (q) => q.eq('key', placement))
    .unique();
const items = (ctx: Pick<QueryCtx, 'db'>) =>
  ctx.db
    .query('contentItems')
    .withIndex('by_placement_deleted', (q) =>
      q.eq('placement', placement).eq('deletedAt', undefined),
    );
async function article(ctx: Pick<QueryCtx, 'db'>, id: Id<'contentItems'>) {
  const item = await ctx.db.get(id);
  if (!item || item.placement !== placement || item.deletedAt !== undefined)
    throw new Error('CONTENT_NOT_FOUND');
  return item;
}
async function validCover(
  ctx: Pick<QueryCtx, 'db' | 'storage'>,
  id?: Id<'adminAssets'>,
) {
  if (!id) return;
  const asset = await ctx.db.get(id);
  if (
    !asset ||
    asset.kind !== 'cms_image' ||
    asset.status !== 'validated' ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(asset.mimeType) ||
    !(await ctx.db.system.get('_storage', asset.storageId))
  ) {
    throw new Error('ASSET_NOT_VALIDATED');
  }
}
async function audit(
  ctx: MutationCtx,
  userId: Id<'users'>,
  action: string,
  id: string,
  requestId: string,
) {
  await writeAdminAudit(ctx, {
    actorUserId: userId,
    action: `today.${action}`,
    entityType: 'content_item',
    entityId: id,
    summary: `Статья на Сегодня: ${action}`,
    requestId,
  });
}
async function publishVersion(
  ctx: MutationCtx,
  item: Doc<'contentItems'>,
  version: Doc<'contentVersions'>,
  userId: Id<'users'>,
) {
  await validCover(ctx, version.imageAssetId);
  parseArticleMarkdown(version.markdown);
  const now = Date.now();
  if (
    item.currentPublishedVersionId &&
    item.currentPublishedVersionId !== version._id
  ) {
    await ctx.db.patch(item.currentPublishedVersionId, {
      status: 'unpublished',
      updatedAt: now,
    });
  }
  await ctx.db.patch(version._id, {
    status: 'published',
    reviewerId: userId,
    publishedAt: now,
    updatedAt: now,
  });
  await ctx.db.patch(item._id, {
    currentPublishedVersionId: version._id,
    updatedAt: now,
  });
}

export const status = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return { initialized: Boolean(await collection(ctx)) };
  },
});

// Explicit, idempotent setup copies the two existing articles without changing
// their text. The collection marker distinguishes an intentionally empty feed.
export const initialize = mutation({
  args: { requestId: v.string() },
  handler: async (ctx, { requestId }) => {
    const { userId } = await requireAdmin(ctx);
    if (await collection(ctx)) return;
    const now = Date.now();
    for (const source of defaultTodayArticles) {
      const key = `today-${source.id}`;
      if (
        await ctx.db
          .query('contentItems')
          .withIndex('by_key', (q) => q.eq('key', key))
          .unique()
      )
        throw new Error('CONTENT_KEY_EXISTS');
      const itemId = await ctx.db.insert('contentItems', {
        key,
        category: 'article',
        placement,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
      const versionId = await ctx.db.insert('contentVersions', {
        contentItemId: itemId,
        version: 1,
        title: source.title,
        markdown: defaultArticleMarkdown(source),
        cardTitle: source.cardTitle,
        cardKind: source.cardKind,
        coverPreset: source.coverPreset,
        sortOrder: source.sortOrder,
        status: 'published',
        authorId: userId,
        reviewerId: userId,
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(itemId, { currentPublishedVersionId: versionId });
      await audit(ctx, userId, 'initialize', itemId, requestId);
    }
    await ctx.db.insert('contentCollections', {
      key: placement,
      createdAt: now,
    });
  },
});

export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    await requireAdmin(ctx);
    const page = await items(ctx).paginate({
      ...paginationOpts,
      numItems: Math.min(paginationOpts.numItems, 20),
      maximumRowsRead: 25,
    });
    return {
      ...page,
      page: await Promise.all(
        page.page.map(async (item) => ({
          ...item,
          latestVersion: await ctx.db
            .query('contentVersions')
            .withIndex('by_item_version', (q) =>
              q.eq('contentItemId', item._id),
            )
            .order('desc')
            .first(),
          publishedVersion: item.currentPublishedVersionId
            ? await ctx.db.get(item.currentPublishedVersionId)
            : null,
        })),
      ),
    };
  },
});

export const save = mutation({
  args: {
    ...fields,
    itemId: v.optional(v.id('contentItems')),
    expectedVersion: v.optional(v.number()),
    publish: v.boolean(),
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    if (!(await collection(ctx))) throw new Error('TODAY_NOT_INITIALIZED');
    const markdown = clean(args.markdown, TODAY_MARKDOWN_LIMIT);
    if (!parseArticleMarkdown(markdown).length)
      throw new Error('INVALID_ARTICLE_FIELDS');
    if (
      !Number.isInteger(args.sortOrder) ||
      args.sortOrder < 0 ||
      args.sortOrder > 999
    )
      throw new Error('INVALID_ARTICLE_FIELDS');
    await validCover(ctx, args.imageAssetId);
    const now = Date.now();
    let item: Doc<'contentItems'>;
    let nextVersion = 1;
    if (args.itemId) {
      item = await article(ctx, args.itemId);
      const latest = await ctx.db
        .query('contentVersions')
        .withIndex('by_item_version', (q) => q.eq('contentItemId', item._id))
        .order('desc')
        .first();
      if (args.expectedVersion !== latest?.version)
        throw new Error('CONTENT_CONFLICT');
      nextVersion = (latest?.version ?? 0) + 1;
    } else {
      if (
        (await items(ctx).take(TODAY_ARTICLE_LIMIT)).length >=
        TODAY_ARTICLE_LIMIT
      )
        throw new Error('TODAY_LIMIT');
      const id = await ctx.db.insert('contentItems', {
        key: `today-${crypto.randomUUID()}`,
        category: 'article',
        placement,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
      item = (await ctx.db.get(id))!;
    }
    const versionId = await ctx.db.insert('contentVersions', {
      contentItemId: item._id,
      version: nextVersion,
      title: clean(args.title, 180),
      markdown,
      cardTitle: clean(args.cardTitle, 90),
      cardKind: args.cardKind,
      coverPreset: args.coverPreset,
      imageAssetId: args.imageAssetId,
      sortOrder: args.sortOrder,
      status: 'draft',
      authorId: userId,
      createdAt: now,
      updatedAt: now,
    });
    if (args.publish)
      await publishVersion(ctx, item, (await ctx.db.get(versionId))!, userId);
    else await ctx.db.patch(item._id, { updatedAt: now });
    await audit(
      ctx,
      userId,
      args.publish ? 'publish' : 'save',
      item._id,
      args.requestId,
    );
    return { itemId: item._id, version: nextVersion };
  },
});

export const remove = mutation({
  args: {
    itemId: v.id('contentItems'),
    expectedUpdatedAt: v.number(),
    delete: v.boolean(),
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const item = await article(ctx, args.itemId);
    if (item.updatedAt !== args.expectedUpdatedAt)
      throw new Error('CONTENT_CONFLICT');
    const now = Date.now();
    if (item.currentPublishedVersionId)
      await ctx.db.patch(item.currentPublishedVersionId, {
        status: 'unpublished',
        updatedAt: now,
      });
    // Keep version history and audit; deletion removes the article from both UI
    // and public reads without deleting a cover shared by other articles.
    await ctx.db.patch(item._id, {
      currentPublishedVersionId: undefined,
      deletedAt: args.delete ? now : undefined,
      updatedAt: now,
    });
    await audit(
      ctx,
      userId,
      args.delete ? 'delete' : 'unpublish',
      item._id,
      args.requestId,
    );
  },
});

export const covers = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    await requireAdmin(ctx);
    const page = await ctx.db
      .query('adminAssets')
      .withIndex('by_status_updated', (q) => q.eq('status', 'validated'))
      .filter((q) => q.eq(q.field('kind'), 'cms_image'))
      .order('desc')
      .paginate({
        ...paginationOpts,
        numItems: Math.min(paginationOpts.numItems, 20),
        maximumRowsRead: 50,
      });
    return {
      ...page,
      page: await Promise.all(
        page.page.map(async (asset) => ({
          id: asset._id,
          name: asset.fileName,
          url: await ctx.storage.getUrl(asset.storageId),
        })),
      ),
    };
  },
});
export const coverStatus = query({
  args: { id: v.id('adminAssets') },
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx);
    const asset = await ctx.db.get(id);
    if (!asset || asset.kind !== 'cms_image') return null;
    return {
      id,
      status: asset.status,
      name: asset.fileName,
      url:
        asset.status === 'validated'
          ? await ctx.storage.getUrl(asset.storageId)
          : null,
    };
  },
});

// Public editorial content only. No identity, author IDs, storage IDs or draft
// fields leave this query. Personal health values are never queried here.
export const published = query({
  args: {},
  handler: async (ctx) => {
    if (!(await collection(ctx))) return null;
    const rows = await items(ctx).take(TODAY_ARTICLE_LIMIT);
    const articles = await Promise.all(
      rows.map(async (item) => {
        if (!item.currentPublishedVersionId) return null;
        const version = await ctx.db.get(item.currentPublishedVersionId);
        if (
          !version ||
          version.status !== 'published' ||
          version.contentItemId !== item._id
        )
          return null;
        let imageUrl: string | null = null;
        if (version.imageAssetId) {
          const asset = await ctx.db.get(version.imageAssetId);
          if (asset?.kind === 'cms_image' && asset.status === 'validated')
            imageUrl = await ctx.storage.getUrl(asset.storageId);
        }
        return {
          id: item.key,
          title: version.title,
          markdown: version.markdown,
          cardTitle: version.cardTitle ?? version.title,
          cardKind: version.cardKind ?? 'article',
          coverPreset: version.coverPreset ?? 'nutrition',
          sortOrder: version.sortOrder ?? 0,
          imageUrl,
        };
      }),
    );
    return articles
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  },
});
