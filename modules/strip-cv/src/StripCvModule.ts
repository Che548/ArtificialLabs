import { requireOptionalNativeModule } from 'expo-modules-core';

type StripCvNativeModule = {
  analyzeStripJsonAsync(requestJson: string): Promise<string>;
  analyzeLearnedStripJsonAsync?: (requestJson: string) => Promise<string>;
  detectStripJsonAsync?: (requestJson: string) => Promise<string>;
};

export default requireOptionalNativeModule<StripCvNativeModule>('StripCv');
