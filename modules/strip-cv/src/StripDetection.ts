import { Platform } from 'react-native';
import StripCvModule from './StripCvModule';

export type StripDetection = {
  width: number;
  height: number;
  bbox: readonly [number, number, number, number];
  confidence: number;
};

export const isStripDetectorAvailable = Platform.OS !== 'web' &&
  typeof StripCvModule?.detectStripJsonAsync === 'function';

export async function detectStripAsync(imageUri: string): Promise<StripDetection | null> {
  if (!StripCvModule?.detectStripJsonAsync || Platform.OS === 'web') return null;
  const raw = JSON.parse(await StripCvModule.detectStripJsonAsync(JSON.stringify({ imageUri })));
  if (raw?.schema_version !== '1.0' || !['strip-reader-experimental-20260914', 'strip-reader-experimental-20260914-r2', 'strip-reader-experimental-20260914-r3', 'strip-reader-experimental-20260914-r4', 'strip-reader-experimental-20260914-r5', 'strip-reader-experimental-20260914-r6'].includes(raw.algorithm_version) ||
      !Number.isFinite(raw.width) || !Number.isFinite(raw.height) || raw.width <= 0 || raw.height <= 0 ||
      !Array.isArray(raw.detector_proposals)) throw new Error('Invalid local detector response.');
  const top = raw.detector_proposals[0];
  if (!top) return null;
  if (!Array.isArray(top.bbox) || top.bbox.length !== 4 || !top.bbox.every(Number.isFinite) ||
      !Number.isFinite(top.confidence) || top.confidence < .05 || top.confidence > 1 ||
      top.bbox[2] <= top.bbox[0] || top.bbox[3] <= top.bbox[1]) return null;
  return { width: raw.width, height: raw.height, bbox: top.bbox, confidence: top.confidence };
}
