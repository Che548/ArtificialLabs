import { requireOptionalNativeModule } from 'expo';

type StripCvNativeModule = {
  analyzeStripJsonAsync(requestJson: string): Promise<string>;
};

export default requireOptionalNativeModule<StripCvNativeModule>('StripCv');
