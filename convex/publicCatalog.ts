import { v } from 'convex/values';

import { query } from './_generated/server';

export const activeCalibration = query({
  args: { testSystemKey: v.string(), lotNumber: v.string() },
  handler: async (ctx, args) => {
    const system = await ctx.db
      .query('testSystems')
      .withIndex('by_key', (q) => q.eq('key', args.testSystemKey))
      .unique();
    if (!system || !(system.status === 'active' || system.active)) return null;
    const lot = await ctx.db
      .query('testLots')
      .withIndex('by_system_lot', (q) =>
        q.eq('testSystemId', system._id).eq('lotNumber', args.lotNumber),
      )
      .unique();
    if (!lot || lot.status !== 'active' || !lot.currentCalibrationId)
      return null;
    const calibration = await ctx.db.get(lot.currentCalibrationId);
    if (
      !calibration ||
      calibration.lifecycleStatus !== 'active' ||
      !calibration.manifest ||
      !calibration.signature ||
      !calibration.publicKey
    ) {
      return null;
    }
    const assets = await Promise.all(
      (calibration.assetIds ?? []).map(async (assetId) => {
        const asset = await ctx.db.get(assetId);
        if (!asset || asset.status !== 'validated') return null;
        return {
          kind: asset.kind,
          fileName: asset.fileName,
          checksum: asset.checksum,
          url: await ctx.storage.getUrl(asset.storageId),
        };
      }),
    );
    return {
      testSystemKey: system.key,
      lotNumber: lot.lotNumber,
      version: calibration.version,
      algorithmVersion: calibration.algorithmVersion,
      manifest: calibration.manifest,
      checksum: calibration.checksum,
      signature: calibration.signature,
      publicKey: calibration.publicKey,
      publicKeyVersion: calibration.publicKeyVersion,
      assets: assets.filter(Boolean),
    };
  },
});

export const contentByKey = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const item = await ctx.db
      .query('contentItems')
      .withIndex('by_key', (q) => q.eq('key', key))
      .unique();
    if (!item?.currentPublishedVersionId) return null;
    const version = await ctx.db.get(item.currentPublishedVersionId);
    if (!version || version.status !== 'published') return null;
    let imageUrl: string | null = null;
    if (version.imageAssetId) {
      const asset = await ctx.db.get(version.imageAssetId);
      if (asset?.status === 'validated') {
        imageUrl = await ctx.storage.getUrl(asset.storageId);
      }
    }
    return {
      key: item.key,
      category: item.category,
      placement: item.placement,
      version: version.version,
      title: version.title,
      markdown: version.markdown,
      imageUrl,
      publishedAt: version.publishedAt,
    };
  },
});
