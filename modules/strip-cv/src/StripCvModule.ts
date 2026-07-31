import { requireNativeModule } from 'expo';

type StripCvNativeModule = {
  analyzeStripJsonAsync(requestJson: string): Promise<string>;
};

export default requireNativeModule<StripCvNativeModule>('StripCv');
