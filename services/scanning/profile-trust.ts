import { DEFAULT_ASSAY_PROFILE, DEFAULT_CARD_PROFILE } from './profiles.ts';
import type { CvProfileQrEnvelope } from './profile-qr.ts';

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => left.localeCompare(right),
    );
    return `{${entries
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function assertTrustedCvProfileEnvelope(
  envelope: CvProfileQrEnvelope,
): void {
  if (
    canonicalJson(envelope.assay_profile) !==
      canonicalJson(DEFAULT_ASSAY_PROFILE) ||
    canonicalJson(envelope.card_profile) !==
      canonicalJson(DEFAULT_CARD_PROFILE) ||
    envelope.cutoff != null
  ) {
    throw new Error(
      'QR-профиль не подписан или не входит во встроенный список доверенных профилей.',
    );
  }
}
