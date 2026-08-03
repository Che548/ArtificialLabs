import { Platform } from 'react-native';

import StripCvModule from './StripCvModule';
import type { AnalysisResult, AnalyzeStripRequest } from './StripCv.types';

export const isStripCvAvailable =
  Platform.OS === 'web' || StripCvModule !== null;

export async function analyzeStripAsync(
  request: AnalyzeStripRequest,
): Promise<AnalysisResult> {
  const nativeModule = StripCvModule;
  if (!nativeModule) {
    throw new Error(
      'StripCV requires a native development build and is unavailable in Expo Go.',
    );
  }
  const payload = {
    imageUri: request.imageUri,
    assayProfile: request.assayProfile,
    cardProfile: request.cardProfile ?? null,
    options: {
      cutoff: request.cutoff ?? null,
      corner_override: request.cornerOverride ?? null,
      flip_orientation: request.flipOrientation ?? false,
      bypass_quality_checks: request.bypassQualityChecks ?? false,
      include_rectified_image: request.includeRectifiedImage ?? false,
    },
  };
  const resultJson = await nativeModule.analyzeStripJsonAsync(
    JSON.stringify(payload),
  );
  const result = JSON.parse(resultJson) as AnalysisResult;

  if (result.schema_version !== '1.0') {
    throw new Error(
      `Unsupported StripCV result schema: ${result.schema_version}`,
    );
  }
  return result;
}
