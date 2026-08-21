import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';

import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server';
import { requireAdmin, writeAdminAudit } from './lib/adminAccess';

const testKind = v.union(v.literal('pregnancy'), v.literal('ovulation'));
const systemStatus = v.union(
  v.literal('draft'),
  v.literal('active'),
  v.literal('archived'),
);
const lotStatus = v.union(
  v.literal('draft'),
  v.literal('review'),
  v.literal('active'),
  v.literal('archived'),
  v.literal('revoked'),
);
const lifecycleStatus = v.union(
  v.literal('draft'),
  v.literal('review'),
  v.literal('approved'),
  v.literal('rejected'),
  v.literal('revoked'),
);
const contentCategory = v.union(
  v.literal('article'),
  v.literal('infographic'),
  v.literal('term'),
  v.literal('hint'),
  v.literal('tooltip'),
);
const assetKind = v.union(
  v.literal('calibration_json'),
  v.literal('reference_csv'),
  v.literal('reference_json'),
  v.literal('cms_image'),
);

const pageOptions = (paginationOpts: {
  numItems: number;
  cursor: string | null;
  endCursor?: string | null;
  id?: number;
}) => ({
  ...paginationOpts,
  numItems: Math.min(paginationOpts.numItems, 50),
  maximumRowsRead: 75,
  maximumBytesRead: 512_000,
});

function clean(value: string, max: number, code: string) {
  const result = value.trim();
  if (!result || result.length > max) throw new Error(code);
  return result;
}

export const listTestSystems = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query('testSystems')
      .withIndex('by_status_updated')
      .order('desc')
      .paginate(pageOptions(paginationOpts));
  },
});

export const saveTestSystem = mutation({
  args: {
    id: v.optional(v.id('testSystems')),
    key: v.string(),
    name: v.string(),
    manufacturer: v.string(),
    description: v.string(),
    format: v.string(),
    testKind,
    status: systemStatus,
    compatibleAlgorithmVersions: v.array(v.string()),
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const now = Date.now();
    const key = clean(args.key.toLowerCase(), 80, 'INVALID_SYSTEM_KEY');
    const duplicate = await ctx.db
      .query('testSystems')
      .withIndex('by_key', (q) => q.eq('key', key))
      .unique();
    if (duplicate && duplicate._id !== args.id)
      throw new Error('SYSTEM_KEY_EXISTS');
    const patch = {
      key,
      name: clean(args.name, 120, 'INVALID_SYSTEM_NAME'),
      manufacturer: clean(args.manufacturer, 120, 'INVALID_MANUFACTURER'),
      description: args.description.trim().slice(0, 2_000),
      format: clean(args.format, 120, 'INVALID_TEST_FORMAT'),
      testKind: args.testKind,
      resultType: 'qualitative' as const,
      status: args.status,
      active: args.status === 'active',
      compatibleAlgorithmVersions: args.compatibleAlgorithmVersions
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 30),
      updatedAt: now,
    };
    let id = args.id;
    if (id) {
      if (!(await ctx.db.get(id))) throw new Error('SYSTEM_NOT_FOUND');
      await ctx.db.patch(id, patch);
    } else {
      id = await ctx.db.insert('testSystems', { ...patch, createdAt: now });
    }
    await writeAdminAudit(ctx, {
      actorUserId: userId,
      action: args.id ? 'test_system.update' : 'test_system.create',
      entityType: 'test_system',
      entityId: id,
      summary: `${args.id ? 'Обновлена' : 'Создана'} тест-система ${patch.name}`,
      requestId: args.requestId,
      occurredAt: now,
    });
    return id;
  },
});

export const listLots = query({
  args: {
    testSystemId: v.optional(v.id('testSystems')),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { testSystemId, paginationOpts }) => {
    await requireAdmin(ctx);
    const source = testSystemId
      ? ctx.db
          .query('testLots')
          .withIndex('by_system_status_updated', (q) =>
            q.eq('testSystemId', testSystemId),
          )
      : ctx.db.query('testLots').withIndex('by_status_updated');
    return await source.order('desc').paginate(pageOptions(paginationOpts));
  },
});

export const saveLot = mutation({
  args: {
    id: v.optional(v.id('testLots')),
    testSystemId: v.id('testSystems'),
    lotNumber: v.string(),
    manufacturedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    applicabilityMin: v.optional(v.number()),
    applicabilityMax: v.optional(v.number()),
    applicabilityUnit: v.optional(v.string()),
    status: lotStatus,
    compatibleAppVersions: v.array(v.string()),
    compatibleAlgorithmVersions: v.array(v.string()),
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    if (!(await ctx.db.get(args.testSystemId)))
      throw new Error('SYSTEM_NOT_FOUND');
    const lotNumber = clean(args.lotNumber, 100, 'INVALID_LOT_NUMBER');
    const duplicate = await ctx.db
      .query('testLots')
      .withIndex('by_system_lot', (q) =>
        q.eq('testSystemId', args.testSystemId).eq('lotNumber', lotNumber),
      )
      .unique();
    if (duplicate && duplicate._id !== args.id) throw new Error('LOT_EXISTS');
    if (
      args.applicabilityMin !== undefined &&
      args.applicabilityMax !== undefined &&
      args.applicabilityMin > args.applicabilityMax
    ) {
      throw new Error('INVALID_APPLICABILITY_RANGE');
    }
    const now = Date.now();
    const patch = {
      testSystemId: args.testSystemId,
      lotNumber,
      manufacturedAt: args.manufacturedAt,
      expiresAt: args.expiresAt,
      applicabilityMin: args.applicabilityMin,
      applicabilityMax: args.applicabilityMax,
      applicabilityUnit: args.applicabilityUnit?.trim().slice(0, 32),
      status: args.status,
      compatibleAppVersions: args.compatibleAppVersions.slice(0, 30),
      compatibleAlgorithmVersions: args.compatibleAlgorithmVersions.slice(
        0,
        30,
      ),
      updatedAt: now,
    };
    let id = args.id;
    if (id) {
      if (!(await ctx.db.get(id))) throw new Error('LOT_NOT_FOUND');
      await ctx.db.patch(id, patch);
    } else {
      id = await ctx.db.insert('testLots', {
        ...patch,
        createdBy: userId,
        createdAt: now,
      });
    }
    await writeAdminAudit(ctx, {
      actorUserId: userId,
      action: args.id ? 'lot.update' : 'lot.create',
      entityType: 'test_lot',
      entityId: id,
      summary: `${args.id ? 'Обновлена' : 'Создана'} партия ${lotNumber}`,
      requestId: args.requestId,
      occurredAt: now,
    });
    return id;
  },
});

export const listCalibrations = query({
  args: {
    lotId: v.optional(v.id('testLots')),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { lotId, paginationOpts }) => {
    await requireAdmin(ctx);
    const source = lotId
      ? ctx.db
          .query('calibrationVersions')
          .withIndex('by_lot_status_updated', (q) => q.eq('lotId', lotId))
      : ctx.db.query('calibrationVersions').withIndex('by_status_updated');
    return await source.order('desc').paginate(pageOptions(paginationOpts));
  },
});

export const createCalibration = mutation({
  args: {
    testSystemId: v.id('testSystems'),
    lotId: v.id('testLots'),
    version: v.string(),
    algorithmVersion: v.string(),
    instructions: v.array(v.string()),
    assetIds: v.array(v.id('adminAssets')),
    previousVersionId: v.optional(v.id('calibrationVersions')),
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const [system, lot] = await Promise.all([
      ctx.db.get(args.testSystemId),
      ctx.db.get(args.lotId),
    ]);
    if (!system || !lot || lot.testSystemId !== system._id) {
      throw new Error('INVALID_CALIBRATION_TARGET');
    }
    const version = clean(args.version, 64, 'INVALID_CALIBRATION_VERSION');
    const duplicate = await ctx.db
      .query('calibrationVersions')
      .withIndex('by_system_version', (q) =>
        q.eq('testSystemKey', system.key).eq('version', version),
      )
      .unique();
    if (duplicate) throw new Error('CALIBRATION_VERSION_EXISTS');
    for (const assetId of args.assetIds) {
      const asset = await ctx.db.get(assetId);
      if (!asset || asset.status !== 'validated')
        throw new Error('ASSET_NOT_VALIDATED');
    }
    const now = Date.now();
    const id = await ctx.db.insert('calibrationVersions', {
      testSystemKey: system.key,
      testSystemId: system._id,
      lotId: lot._id,
      version,
      status: 'draft',
      lifecycleStatus: 'draft',
      algorithmVersion: clean(
        args.algorithmVersion,
        100,
        'INVALID_ALGORITHM_VERSION',
      ),
      instructions: args.instructions
        .slice(0, 30)
        .map((item) => item.slice(0, 500)),
      checksum: '',
      assetIds: args.assetIds,
      previousVersionId: args.previousVersionId,
      authorId: userId,
      createdAt: now,
      updatedAt: now,
    });
    await writeAdminAudit(ctx, {
      actorUserId: userId,
      action: 'calibration.create',
      entityType: 'calibration',
      entityId: id,
      summary: `Создана калибровка ${system.key} ${version}`,
      requestId: args.requestId,
      occurredAt: now,
    });
    return id;
  },
});

export const setCalibrationStatus = mutation({
  args: {
    calibrationId: v.id('calibrationVersions'),
    status: lifecycleStatus,
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const calibration = await ctx.db.get(args.calibrationId);
    if (!calibration) throw new Error('CALIBRATION_NOT_FOUND');
    if (
      ['published', 'active', 'rolled_back'].includes(
        calibration.lifecycleStatus ?? '',
      )
    ) {
      throw new Error('CALIBRATION_IMMUTABLE');
    }
    const allowed: Record<string, string[]> = {
      draft: ['review', 'rejected'],
      review: ['approved', 'rejected', 'draft'],
      approved: ['review', 'rejected', 'revoked'],
      signing_failed: ['approved', 'revoked'],
    };
    const current = calibration.lifecycleStatus ?? 'draft';
    if (!allowed[current]?.includes(args.status))
      throw new Error('INVALID_STATUS_TRANSITION');
    const now = Date.now();
    await ctx.db.patch(calibration._id, {
      lifecycleStatus: args.status,
      reviewerId: args.status === 'approved' ? userId : calibration.reviewerId,
      approvedAt: args.status === 'approved' ? now : calibration.approvedAt,
      revokedAt: args.status === 'revoked' ? now : calibration.revokedAt,
      updatedAt: now,
    });
    await writeAdminAudit(ctx, {
      actorUserId: userId,
      action: `calibration.${args.status}`,
      entityType: 'calibration',
      entityId: calibration._id,
      summary: `Калибровка ${calibration.version}: ${current} → ${args.status}`,
      requestId: args.requestId,
      occurredAt: now,
    });
    return true;
  },
});

export const requestCalibrationSigning = mutation({
  args: { calibrationId: v.id('calibrationVersions'), requestId: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const calibration = await ctx.db.get(args.calibrationId);
    if (!calibration || calibration.lifecycleStatus !== 'approved') {
      throw new Error('CALIBRATION_NOT_APPROVED');
    }
    const now = Date.now();
    await ctx.db.patch(calibration._id, {
      lifecycleStatus: 'signing',
      updatedAt: now,
    });
    await writeAdminAudit(ctx, {
      actorUserId: userId,
      action: 'calibration.signing_requested',
      entityType: 'calibration',
      entityId: calibration._id,
      summary: `Запущена проверка и подпись ${calibration.version}`,
      requestId: args.requestId,
      occurredAt: now,
    });
    await ctx.scheduler.runAfter(
      0,
      internal.calibrationActions.validateAndSign,
      {
        calibrationId: calibration._id,
        actorUserId: userId,
      },
    );
    return true;
  },
});

export const getCalibrationForSigning = internalQuery({
  args: { calibrationId: v.id('calibrationVersions') },
  handler: async (ctx, { calibrationId }) => {
    const calibration = await ctx.db.get(calibrationId);
    if (!calibration || calibration.lifecycleStatus !== 'signing') return null;
    const assets = await Promise.all(
      (calibration.assetIds ?? []).map((assetId) => ctx.db.get(assetId)),
    );
    return {
      calibration,
      assets: assets.filter(Boolean) as Doc<'adminAssets'>[],
    };
  },
});

export const finishCalibrationSigning = internalMutation({
  args: {
    calibrationId: v.id('calibrationVersions'),
    actorUserId: v.id('users'),
    manifest: v.optional(v.string()),
    checksum: v.optional(v.string()),
    signature: v.optional(v.string()),
    publicKey: v.optional(v.string()),
    publicKeyVersion: v.optional(v.string()),
    assetChecks: v.optional(
      v.array(
        v.object({
          assetId: v.id('adminAssets'),
          checksum: v.string(),
        }),
      ),
    ),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const calibration = await ctx.db.get(args.calibrationId);
    if (!calibration || calibration.lifecycleStatus !== 'signing') return false;
    const now = Date.now();
    if (args.error) {
      await ctx.db.patch(calibration._id, {
        lifecycleStatus: 'signing_failed',
        updatedAt: now,
      });
      await writeAdminAudit(ctx, {
        actorUserId: args.actorUserId,
        action: 'calibration.signing_failed',
        entityType: 'calibration',
        entityId: calibration._id,
        summary: `Подпись ${calibration.version} отклонена: ${args.error.slice(0, 180)}`,
        requestId: `signing:${calibration._id}:${now}`,
        occurredAt: now,
      });
      return false;
    }
    if (
      !args.manifest ||
      !args.checksum ||
      !args.signature ||
      !args.publicKey
    ) {
      throw new Error('INCOMPLETE_SIGNATURE');
    }
    for (const assetCheck of args.assetChecks ?? []) {
      const asset = await ctx.db.get(assetCheck.assetId);
      if (asset && asset.status !== 'rejected') {
        await ctx.db.patch(asset._id, {
          checksum: assetCheck.checksum,
          status: 'validated',
          validationError: undefined,
          updatedAt: now,
        });
      }
    }
    await ctx.db.patch(calibration._id, {
      lifecycleStatus: 'published',
      status: 'published',
      manifest: args.manifest,
      checksum: args.checksum,
      signature: args.signature,
      publicKey: args.publicKey,
      publicKeyVersion: args.publicKeyVersion ?? 'v1',
      signedAt: now,
      publishedAt: now,
      updatedAt: now,
    });
    if (calibration.lotId) {
      const lot = await ctx.db.get(calibration.lotId);
      if (lot) {
        if (lot.currentCalibrationId) {
          const current = await ctx.db.get(lot.currentCalibrationId);
          if (current && current.lifecycleStatus === 'active') {
            await ctx.db.patch(current._id, {
              lifecycleStatus: 'published',
              updatedAt: now,
            });
          }
        }
        await ctx.db.patch(lot._id, {
          currentCalibrationId: calibration._id,
          status: 'active',
          updatedAt: now,
        });
      }
    }
    await ctx.db.patch(calibration._id, { lifecycleStatus: 'active' });
    await writeAdminAudit(ctx, {
      actorUserId: args.actorUserId,
      action: 'calibration.published',
      entityType: 'calibration',
      entityId: calibration._id,
      summary: `Опубликована подписанная калибровка ${calibration.version}`,
      requestId: `signing:${calibration._id}:${now}`,
      occurredAt: now,
    });
    return true;
  },
});

export const rollbackCalibration = mutation({
  args: {
    lotId: v.id('testLots'),
    targetCalibrationId: v.id('calibrationVersions'),
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const [lot, target] = await Promise.all([
      ctx.db.get(args.lotId),
      ctx.db.get(args.targetCalibrationId),
    ]);
    if (!lot || !target || target.lotId !== lot._id || !target.signature) {
      throw new Error('INVALID_ROLLBACK_TARGET');
    }
    const now = Date.now();
    if (lot.currentCalibrationId) {
      const current = await ctx.db.get(lot.currentCalibrationId);
      if (current) {
        await ctx.db.patch(current._id, {
          lifecycleStatus: 'rolled_back',
          updatedAt: now,
        });
      }
    }
    await ctx.db.patch(target._id, {
      lifecycleStatus: 'active',
      updatedAt: now,
    });
    await ctx.db.patch(lot._id, {
      currentCalibrationId: target._id,
      status: 'active',
      updatedAt: now,
    });
    await writeAdminAudit(ctx, {
      actorUserId: userId,
      action: 'calibration.rollback',
      entityType: 'calibration',
      entityId: target._id,
      summary: `Партия ${lot.lotNumber} возвращена на калибровку ${target.version}`,
      requestId: args.requestId,
      occurredAt: now,
    });
    return true;
  },
});

export const saveValidation = mutation({
  args: {
    calibrationId: v.id('calibrationVersions'),
    datasetAssetId: v.optional(v.id('adminAssets')),
    sampleCount: v.number(),
    passed: v.boolean(),
    metrics: v.array(
      v.object({
        key: v.string(),
        value: v.number(),
        threshold: v.optional(v.number()),
        passed: v.boolean(),
      }),
    ),
    notes: v.optional(v.string()),
    algorithmVersions: v.array(v.string()),
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    if (!(await ctx.db.get(args.calibrationId)))
      throw new Error('CALIBRATION_NOT_FOUND');
    if (!Number.isInteger(args.sampleCount) || args.sampleCount < 0) {
      throw new Error('INVALID_SAMPLE_COUNT');
    }
    const now = Date.now();
    const id = await ctx.db.insert('calibrationValidations', {
      calibrationId: args.calibrationId,
      datasetAssetId: args.datasetAssetId,
      sampleCount: args.sampleCount,
      passed: args.passed,
      metrics: args.metrics.slice(0, 50),
      notes: args.notes?.slice(0, 2_000),
      algorithmVersions: args.algorithmVersions.slice(0, 30),
      createdBy: userId,
      createdAt: now,
    });
    await writeAdminAudit(ctx, {
      actorUserId: userId,
      action: 'validation.create',
      entityType: 'calibration_validation',
      entityId: id,
      summary: `Зафиксирована валидация: ${args.sampleCount} образцов, ${args.passed ? 'пройдена' : 'не пройдена'}`,
      requestId: args.requestId,
      occurredAt: now,
    });
    return id;
  },
});

export const listValidations = query({
  args: {
    calibrationId: v.optional(v.id('calibrationVersions')),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { calibrationId, paginationOpts }) => {
    await requireAdmin(ctx);
    const source = calibrationId
      ? ctx.db
          .query('calibrationValidations')
          .withIndex('by_calibration_time', (q) =>
            q.eq('calibrationId', calibrationId),
          )
      : ctx.db.query('calibrationValidations').withIndex('by_time');
    return await source.order('desc').paginate(pageOptions(paginationOpts));
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const listAssets = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query('adminAssets')
      .withIndex('by_status_updated')
      .order('desc')
      .paginate(pageOptions(paginationOpts));
  },
});

export const registerAsset = mutation({
  args: {
    storageId: v.id('_storage'),
    kind: assetKind,
    fileName: v.string(),
    mimeType: v.string(),
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const metadata = await ctx.storage.getMetadata(args.storageId);
    if (!metadata) throw new Error('STORAGE_FILE_NOT_FOUND');
    const limits = {
      calibration_json: 5 * 1024 * 1024,
      reference_csv: 20 * 1024 * 1024,
      reference_json: 20 * 1024 * 1024,
      cms_image: 10 * 1024 * 1024,
    } as const;
    if (metadata.size > limits[args.kind]) {
      await ctx.storage.delete(args.storageId);
      throw new Error('ASSET_TOO_LARGE');
    }
    const existing = await ctx.db
      .query('adminAssets')
      .withIndex('by_storage', (q) => q.eq('storageId', args.storageId))
      .unique();
    if (existing) return existing._id;
    const now = Date.now();
    const id = await ctx.db.insert('adminAssets', {
      storageId: args.storageId,
      kind: args.kind,
      fileName: clean(args.fileName, 180, 'INVALID_FILE_NAME'),
      mimeType: clean(args.mimeType, 120, 'INVALID_MIME_TYPE'),
      size: metadata.size,
      status: 'uploaded',
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });
    await writeAdminAudit(ctx, {
      actorUserId: userId,
      action: 'asset.upload',
      entityType: 'admin_asset',
      entityId: id,
      summary: `Загружен служебный файл ${args.fileName}`,
      requestId: args.requestId,
      occurredAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.adminAssetActions.validateAsset, {
      assetId: id,
      actorUserId: userId,
    });
    return id;
  },
});

export const getAssetForValidation = internalQuery({
  args: { assetId: v.id('adminAssets') },
  handler: async (ctx, { assetId }) => await ctx.db.get(assetId),
});

export const finishAssetValidation = internalMutation({
  args: {
    assetId: v.id('adminAssets'),
    actorUserId: v.id('users'),
    checksum: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.status !== 'uploaded') return false;
    const now = Date.now();
    if (args.error) {
      await ctx.db.patch(asset._id, {
        status: 'rejected',
        validationError: args.error.slice(0, 180),
        updatedAt: now,
      });
      await ctx.storage.delete(asset.storageId);
    } else {
      if (!args.checksum) throw new Error('CHECKSUM_REQUIRED');
      await ctx.db.patch(asset._id, {
        status: 'validated',
        checksum: args.checksum,
        validationError: undefined,
        updatedAt: now,
      });
    }
    await writeAdminAudit(ctx, {
      actorUserId: args.actorUserId,
      action: args.error ? 'asset.rejected' : 'asset.validated',
      entityType: 'admin_asset',
      entityId: asset._id,
      summary: args.error
        ? `Файл ${asset.fileName} отклонён при проверке`
        : `Файл ${asset.fileName} проверен`,
      requestId: `asset-validation:${asset._id}:${now}`,
      occurredAt: now,
    });
    return true;
  },
});

export const saveContent = mutation({
  args: {
    contentItemId: v.optional(v.id('contentItems')),
    key: v.string(),
    category: contentCategory,
    placement: v.string(),
    title: v.string(),
    markdown: v.string(),
    imageAssetId: v.optional(v.id('adminAssets')),
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    if (args.markdown.length > 100_000) throw new Error('CONTENT_TOO_LARGE');
    const now = Date.now();
    let itemId = args.contentItemId;
    let version = 1;
    if (itemId) {
      const item = await ctx.db.get(itemId);
      if (!item) throw new Error('CONTENT_NOT_FOUND');
      const latest = await ctx.db
        .query('contentVersions')
        .withIndex('by_item_version', (q) => q.eq('contentItemId', itemId!))
        .order('desc')
        .first();
      version = (latest?.version ?? 0) + 1;
      await ctx.db.patch(itemId, {
        category: args.category,
        placement: clean(args.placement, 120, 'INVALID_PLACEMENT'),
        updatedAt: now,
      });
    } else {
      const key = clean(args.key.toLowerCase(), 100, 'INVALID_CONTENT_KEY');
      if (
        await ctx.db
          .query('contentItems')
          .withIndex('by_key', (q) => q.eq('key', key))
          .unique()
      ) {
        throw new Error('CONTENT_KEY_EXISTS');
      }
      itemId = await ctx.db.insert('contentItems', {
        key,
        category: args.category,
        placement: clean(args.placement, 120, 'INVALID_PLACEMENT'),
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
    }
    const versionId = await ctx.db.insert('contentVersions', {
      contentItemId: itemId,
      version,
      title: clean(args.title, 180, 'INVALID_CONTENT_TITLE'),
      markdown: args.markdown,
      imageAssetId: args.imageAssetId,
      status: 'draft',
      authorId: userId,
      createdAt: now,
      updatedAt: now,
    });
    await writeAdminAudit(ctx, {
      actorUserId: userId,
      action: 'content.save',
      entityType: 'content_version',
      entityId: versionId,
      summary: `Сохранена версия ${version} материала ${args.title}`,
      requestId: args.requestId,
      occurredAt: now,
    });
    return { itemId, versionId };
  },
});

export const reviewContent = mutation({
  args: { versionId: v.id('contentVersions'), requestId: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const version = await ctx.db.get(args.versionId);
    if (!version) throw new Error('CONTENT_VERSION_NOT_FOUND');
    if (version.status !== 'draft') throw new Error('CONTENT_NOT_DRAFT');
    const now = Date.now();
    await ctx.db.patch(version._id, {
      status: 'review',
      reviewerId: userId,
      updatedAt: now,
    });
    await writeAdminAudit(ctx, {
      actorUserId: userId,
      action: 'content.review',
      entityType: 'content_version',
      entityId: version._id,
      summary: `Материал ${version.title}, версия ${version.version}, отправлен на review`,
      requestId: args.requestId,
      occurredAt: now,
    });
    return true;
  },
});

export const publishContent = mutation({
  args: { versionId: v.id('contentVersions'), requestId: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const version = await ctx.db.get(args.versionId);
    if (!version) throw new Error('CONTENT_VERSION_NOT_FOUND');
    if (version.status !== 'review') throw new Error('CONTENT_NOT_REVIEWED');
    const item = await ctx.db.get(version.contentItemId);
    if (!item) throw new Error('CONTENT_NOT_FOUND');
    const now = Date.now();
    if (item.currentPublishedVersionId) {
      const previous = await ctx.db.get(item.currentPublishedVersionId);
      if (previous) {
        await ctx.db.patch(previous._id, {
          status: 'unpublished',
          updatedAt: now,
        });
      }
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
    await writeAdminAudit(ctx, {
      actorUserId: userId,
      action: 'content.publish',
      entityType: 'content_version',
      entityId: version._id,
      summary: `Опубликован материал ${version.title}, версия ${version.version}`,
      requestId: args.requestId,
      occurredAt: now,
    });
    return true;
  },
});

export const listContent = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    await requireAdmin(ctx);
    const page = await ctx.db
      .query('contentItems')
      .withIndex('by_category_updated')
      .order('desc')
      .paginate(pageOptions(paginationOpts));
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
