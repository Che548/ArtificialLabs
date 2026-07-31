import { Platform } from "react-native";

import StripCvModule from "./StripCvModule";
import type { AnalysisResult, AnalyzeStripRequest } from "./StripCv.types";

export const isStripCvAvailable =
  Platform.OS === "ios" || Platform.OS === "android" || Platform.OS === "web";

export async function analyzeStripAsync(
  request: AnalyzeStripRequest,
): Promise<AnalysisResult> {
  const payload = {
    imageUri: request.imageUri,
    assayProfile: request.assayProfile,
    cardProfile: request.cardProfile ?? null,
    options: {
      cutoff: request.cutoff ?? null,
      corner_override: request.cornerOverride ?? null,
      flip_orientation: request.flipOrientation ?? false,
    },
  };
  const resultJson = await StripCvModule.analyzeStripJsonAsync(
    JSON.stringify(payload),
  );
  const result = JSON.parse(resultJson) as AnalysisResult;

  if (result.schema_version !== "1.0") {
    throw new Error(
      `Unsupported StripCV result schema: ${result.schema_version}`,
    );
  }
  return result;
}
