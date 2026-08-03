import { analyzeStripAsync } from '../../modules/strip-cv';
import type { AnalysisResult } from '../../modules/strip-cv';
import {
  ScanningConfiguration,
  type ActiveCvConfiguration,
  type ConfigurationOptions,
} from './scanning-configuration';

export type {
  ActiveCvConfiguration,
  ConfigurationOptions,
  ScanProductMetadata,
} from './scanning-configuration';

export class ScanningService {
  private configuration = new ScanningConfiguration();

  getConfiguration(options: ConfigurationOptions = {}): ActiveCvConfiguration {
    return this.configuration.getConfiguration(options);
  }

  resetConfiguration(): ActiveCvConfiguration {
    return this.configuration.resetConfiguration();
  }

  applyQrConfiguration(data: string): boolean {
    return this.configuration.applyQrConfiguration(data);
  }

  applyManualBatchCode(batch: string): ActiveCvConfiguration {
    return this.configuration.applyManualBatchCode(batch);
  }

  async analyze(
    imageUri: string,
    options: {
      /** @deprecated Kept for compatibility; native quality checks remain enabled. */
      bypassQualityChecks?: boolean;
      useLegacyPipeline?: boolean;
      includeRectifiedImage?: boolean;
    } = {},
  ): Promise<AnalysisResult> {
    const useLegacyPipeline = options.useLegacyPipeline ?? false;
    this.configuration.assertNormalPipelineAllowed(useLegacyPipeline);
    const configuration = this.configuration.getConfiguration({
      useLegacyPipeline,
    });
    return analyzeStripAsync({
      imageUri,
      assayProfile: configuration.assayProfile,
      cardProfile: configuration.cardProfile,
      cutoff: configuration.cutoff,
      // The native boundary accepts this deprecated field as a no-op so older
      // callers cannot accidentally weaken the shared quality policy.
      bypassQualityChecks: options.bypassQualityChecks,
      includeRectifiedImage: options.includeRectifiedImage,
    });
  }
}

export const scanningService = new ScanningService();
