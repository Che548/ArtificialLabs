'use node';

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
} from 'node:crypto';
import { v } from 'convex/values';

import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalAction } from './_generated/server';

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function validateAsset(kind: string, mimeType: string, bytes: Uint8Array) {
  const textKinds = new Set([
    'calibration_json',
    'reference_csv',
    'reference_json',
  ]);
  if (!textKinds.has(kind)) return;
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (kind.endsWith('_json')) {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object')
      throw new Error('INVALID_JSON_ROOT');
  } else {
    const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
    if (!firstLine.includes(',')) throw new Error('INVALID_CSV_HEADER');
  }
  if (!mimeType) throw new Error('MIME_TYPE_REQUIRED');
}

export const validateAndSign = internalAction({
  args: {
    calibrationId: v.id('calibrationVersions'),
    actorUserId: v.id('users'),
  },
  handler: async (ctx, args): Promise<boolean> => {
    try {
      const payload: {
        calibration: Doc<'calibrationVersions'>;
        assets: Doc<'adminAssets'>[];
      } | null = await ctx.runQuery(
        internal.adminCatalog.getCalibrationForSigning,
        { calibrationId: args.calibrationId },
      );
      if (!payload) return false;
      if (!payload.assets.length) throw new Error('CALIBRATION_ASSET_REQUIRED');
      const assetChecks: Array<{
        assetId: (typeof payload.assets)[number]['_id'];
        checksum: string;
      }> = [];
      const manifestAssets = [];
      for (const asset of payload.assets) {
        const blob = await ctx.storage.get(asset.storageId);
        if (!blob) throw new Error(`ASSET_MISSING:${asset._id}`);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        validateAsset(asset.kind, asset.mimeType, bytes);
        const checksum = createHash('sha256').update(bytes).digest('hex');
        assetChecks.push({ assetId: asset._id, checksum });
        manifestAssets.push({
          kind: asset.kind,
          fileName: asset.fileName,
          mimeType: asset.mimeType,
          size: asset.size,
          checksum,
        });
      }
      const calibration = payload.calibration;
      const manifest = stableJson({
        schemaVersion: 1,
        testSystemKey: calibration.testSystemKey,
        lotId: calibration.lotId,
        version: calibration.version,
        algorithmVersion: calibration.algorithmVersion,
        instructions: calibration.instructions,
        assets: manifestAssets,
      });
      const checksum = createHash('sha256').update(manifest).digest('hex');
      const privatePem = process.env.CALIBRATION_SIGNING_PRIVATE_KEY;
      if (!privatePem) throw new Error('SIGNING_KEY_NOT_CONFIGURED');
      const privateKey = createPrivateKey(privatePem.replace(/\\n/g, '\n'));
      const publicKey = createPublicKey(privateKey)
        .export({ format: 'pem', type: 'spki' })
        .toString();
      const signature = sign(null, Buffer.from(manifest), privateKey).toString(
        'base64',
      );
      return await ctx.runMutation(
        internal.adminCatalog.finishCalibrationSigning,
        {
          calibrationId: calibration._id,
          actorUserId: args.actorUserId,
          manifest,
          checksum,
          signature,
          publicKey,
          publicKeyVersion: process.env.CALIBRATION_PUBLIC_KEY_VERSION ?? 'v1',
          assetChecks,
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'SIGNING_FAILED';
      await ctx.runMutation(internal.adminCatalog.finishCalibrationSigning, {
        calibrationId: args.calibrationId,
        actorUserId: args.actorUserId,
        error: message.slice(0, 180),
      });
      return false;
    }
  },
});
