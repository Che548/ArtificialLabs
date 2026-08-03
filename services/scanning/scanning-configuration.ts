import type { AssayProfile, CardProfile } from '../../modules/strip-cv';
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
  source: 'bundled' | 'manual' | 'qr';
  product: ScanProductMetadata;
};

export type ConfigurationOptions = {
  useLegacyPipeline?: boolean;
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

export class ScanningConfiguration {
  private activeConfiguration = bundledConfiguration;
  private legacyConfiguration = bundledConfiguration;
  private qrProfileIsTrusted = true;

  getConfiguration(
    options: ConfigurationOptions = {},
  ): ActiveCvConfiguration {
    return options.useLegacyPipeline
      ? this.legacyConfiguration
      : this.activeConfiguration;
  }

  resetConfiguration(): ActiveCvConfiguration {
    this.activeConfiguration = bundledConfiguration;
    this.legacyConfiguration = bundledConfiguration;
    this.qrProfileIsTrusted = true;
    return this.activeConfiguration;
  }

  applyQrConfiguration(data: string): boolean {
    const envelope = parseCvProfileQr(data);
    if (!envelope) {
      return false;
    }

    // The normal pipeline remains locked to the bundled, trusted profile.
    // Keep the schema-validated QR profile separately so the explicit local
    // test-mode switch can reproduce the legacy QR-driven pipeline.
    let qrProfileIsTrusted = true;
    try {
      assertTrustedCvProfileEnvelope(envelope);
    } catch {
      qrProfileIsTrusted = false;
    }

    const product = {
      label: envelope.product?.label ?? envelope.assay_profile.id,
      batch: envelope.product?.batch ?? envelope.assay_profile.version,
      expiresAt: envelope.product?.expires_at ?? '—',
    };
    this.legacyConfiguration = {
      assayProfile: envelope.assay_profile,
      cardProfile:
        envelope.card_profile === undefined
          ? this.activeConfiguration.cardProfile
          : envelope.card_profile,
      cutoff: envelope.cutoff ?? envelope.assay_profile.default_cutoff,
      source: 'qr',
      product,
    };
    this.activeConfiguration = {
      assayProfile: DEFAULT_ASSAY_PROFILE,
      cardProfile: DEFAULT_CARD_PROFILE,
      cutoff: null,
      source: 'qr',
      product,
    };
    this.qrProfileIsTrusted = qrProfileIsTrusted;
    return true;
  }

  applyManualBatchCode(batch: string): ActiveCvConfiguration {
    this.activeConfiguration = {
      ...bundledConfiguration,
      source: 'manual',
      product: {
        ...bundledConfiguration.product,
        batch: batch.trim(),
      },
    };
    this.legacyConfiguration = this.activeConfiguration;
    this.qrProfileIsTrusted = true;
    return this.activeConfiguration;
  }

  assertNormalPipelineAllowed(useLegacyPipeline: boolean): void {
    if (!useLegacyPipeline && !this.qrProfileIsTrusted) {
      throw new Error(
        'QR-профиль доступен только в тестовом режиме; включите его перед анализом.',
      );
    }
  }
}
