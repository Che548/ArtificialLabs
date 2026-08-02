import { analyzeStripAsync } from '../../modules/strip-cv';
import type {
  AnalysisResult,
  AssayProfile,
  CardProfile,
} from '../../modules/strip-cv';
import { parseCvProfileQr } from './profile-qr';
import { assertTrustedCvProfileEnvelope } from './profile-trust';
import { DEFAULT_ASSAY_PROFILE, DEFAULT_CARD_PROFILE } from './profiles';

export type ScanProductMetadata = {
  label: string;
  batch: string;
  expiresAt: string;
};

export type ActiveCvConfiguration = {
  assayProfile: AssayProfile;
  cardProfile: CardProfile | null;
  cutoff: number | null;
  source: 'bundled' | 'qr';
  product: ScanProductMetadata;
};

const bundledConfiguration: ActiveCvConfiguration = {
  assayProfile: DEFAULT_ASSAY_PROFILE,
  cardProfile: DEFAULT_CARD_PROFILE,
  cutoff: null,
  source: 'bundled',
  product: {
    label: 'Двухлинейная тест-полоска',
    batch: 'Тестовый профиль',
    expiresAt: '—',
  },
};

export class ScanningService {
  private activeConfiguration = bundledConfiguration;

  getConfiguration(): ActiveCvConfiguration {
    return this.activeConfiguration;
  }

  resetConfiguration(): ActiveCvConfiguration {
    this.activeConfiguration = bundledConfiguration;
    return this.activeConfiguration;
  }

  applyQrConfiguration(data: string): boolean {
    const envelope = parseCvProfileQr(data);
    if (!envelope) {
      return false;
    }
    assertTrustedCvProfileEnvelope(envelope);
    this.activeConfiguration = {
      assayProfile: DEFAULT_ASSAY_PROFILE,
      cardProfile: DEFAULT_CARD_PROFILE,
      cutoff: null,
      source: 'qr',
      product: {
        label: envelope.product?.label ?? envelope.assay_profile.id,
        batch: envelope.product?.batch ?? envelope.assay_profile.version,
        expiresAt: envelope.product?.expires_at ?? '—',
      },
    };
    return true;
  }

  async analyze(imageUri: string): Promise<AnalysisResult> {
    const configuration = this.activeConfiguration;
    return analyzeStripAsync({
      imageUri,
      assayProfile: configuration.assayProfile,
      cardProfile: configuration.cardProfile,
      cutoff: configuration.cutoff,
    });
  }
}

export const scanningService = new ScanningService();
