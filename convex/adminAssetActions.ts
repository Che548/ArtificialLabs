'use node';

import { createHash } from 'node:crypto';
import { v } from 'convex/values';

import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalAction } from './_generated/server';

const mimeByKind: Record<Doc<'adminAssets'>['kind'], Set<string>> = {
  calibration_json: new Set(['application/json', 'text/json']),
  reference_json: new Set(['application/json', 'text/json']),
  reference_csv: new Set(['text/csv', 'application/csv', 'text/plain']),
  cms_image: new Set(['image/png', 'image/jpeg', 'image/webp']),
};

function validate(asset: Doc<'adminAssets'>, bytes: Uint8Array) {
  const mime = asset.mimeType.toLowerCase().split(';', 1)[0];
  if (!mimeByKind[asset.kind].has(mime)) throw new Error('MIME_TYPE_REJECTED');
  if (asset.kind === 'cms_image') {
    const png =
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47;
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const decoder = new TextDecoder();
    const webp =
      decoder.decode(bytes.slice(0, 4)) === 'RIFF' &&
      decoder.decode(bytes.slice(8, 12)) === 'WEBP';
    if (!png && !jpeg && !webp) throw new Error('INVALID_IMAGE_SIGNATURE');
    return;
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (asset.kind.endsWith('_json')) {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('INVALID_JSON_ROOT');
    }
  } else {
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2 || !(lines[0] ?? '').includes(',')) {
      throw new Error('INVALID_CSV_STRUCTURE');
    }
  }
}

export const validateAsset = internalAction({
  args: { assetId: v.id('adminAssets'), actorUserId: v.id('users') },
  handler: async (ctx, args): Promise<boolean> => {
    try {
      const asset = await ctx.runQuery(
        internal.adminCatalog.getAssetForValidation,
        { assetId: args.assetId },
      );
      if (!asset || asset.status !== 'uploaded') return false;
      const blob = await ctx.storage.get(asset.storageId);
      if (!blob) throw new Error('STORAGE_FILE_NOT_FOUND');
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (bytes.byteLength !== asset.size) throw new Error('SIZE_MISMATCH');
      validate(asset, bytes);
      const checksum = createHash('sha256').update(bytes).digest('hex');
      return await ctx.runMutation(
        internal.adminCatalog.finishAssetValidation,
        { assetId: asset._id, actorUserId: args.actorUserId, checksum },
      );
    } catch (error) {
      return await ctx.runMutation(
        internal.adminCatalog.finishAssetValidation,
        {
          assetId: args.assetId,
          actorUserId: args.actorUserId,
          error:
            error instanceof Error ? error.message : 'ASSET_VALIDATION_FAILED',
        },
      );
    }
  },
});
