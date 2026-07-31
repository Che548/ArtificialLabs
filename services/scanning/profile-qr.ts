import type { AssayProfile, CardProfile } from '../../modules/strip-cv';

export const CV_PROFILE_QR_SCHEMA = 'artificial-labs.cv-profile/1' as const;

export type CvProfileQrEnvelope = {
  schema_version: typeof CV_PROFILE_QR_SCHEMA;
  assay_profile: AssayProfile;
  card_profile?: CardProfile | null;
  cutoff?: number | null;
  product?: {
    label?: string;
    batch?: string;
    expires_at?: string;
  };
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isRect = (value: unknown): boolean =>
  Array.isArray(value) &&
  value.length === 4 &&
  value.every(isFiniteNumber) &&
  value[0] >= 0 &&
  value[1] >= 0 &&
  value[2] <= 1 &&
  value[3] <= 1 &&
  value[2] > value[0] &&
  value[3] > value[1];

function assertAssayProfile(value: unknown): asserts value is AssayProfile {
  if (!isObject(value)) {
    throw new Error('QR profile is missing assay_profile.');
  }
  if (
    value.schema_version !== '1.0' ||
    typeof value.id !== 'string' ||
    typeof value.version !== 'string' ||
    !isFiniteNumber(value.canonical_width) ||
    !isFiniteNumber(value.canonical_height) ||
    value.canonical_width < 128 ||
    value.canonical_height < 32 ||
    !isFiniteNumber(value.min_aspect_ratio) ||
    !isFiniteNumber(value.max_aspect_ratio) ||
    value.min_aspect_ratio <= 1 ||
    value.max_aspect_ratio <= value.min_aspect_ratio ||
    !isRect(value.membrane_roi) ||
    !isRect(value.test_window) ||
    !isRect(value.control_window) ||
    !isFiniteNumber(value.expected_line_width) ||
    !isFiniteNumber(value.integration_half_width) ||
    !['left_to_right', 'right_to_left'].includes(
      String(value.sample_to_wick),
    ) ||
    value.positive_when !== 'gte' ||
    !isObject(value.quality)
  ) {
    throw new Error('QR assay profile does not match StripCV schema v1.');
  }
}

function assertCardProfile(value: unknown): asserts value is CardProfile {
  if (!isObject(value)) {
    throw new Error('QR card profile must be an object or null.');
  }
  if (
    value.schema_version !== '1.0' ||
    typeof value.id !== 'string' ||
    typeof value.version !== 'string' ||
    typeof value.print_batch !== 'string' ||
    typeof value.enrolled !== 'boolean' ||
    !Array.isArray(value.fiducial_centers) ||
    value.fiducial_centers.length !== 4 ||
    !Array.isArray(value.patches) ||
    value.patches.length === 0
  ) {
    throw new Error(
      'QR calibration-card profile does not match StripCV schema v1.',
    );
  }
}

function decodePayload(data: string): unknown {
  const trimmed = data.trim();
  const prefix = 'artificial-labs://cv-profile?payload=';
  const json = trimmed.startsWith(prefix)
    ? decodeURIComponent(trimmed.slice(prefix.length))
    : trimmed;
  return JSON.parse(json) as unknown;
}

export function parseCvProfileQr(data: string): CvProfileQrEnvelope | null {
  let decoded: unknown;
  try {
    decoded = decodePayload(data);
  } catch {
    return null;
  }
  if (!isObject(decoded) || decoded.schema_version !== CV_PROFILE_QR_SCHEMA) {
    return null;
  }
  assertAssayProfile(decoded.assay_profile);
  if (decoded.card_profile !== undefined && decoded.card_profile !== null) {
    assertCardProfile(decoded.card_profile);
  }
  if (
    decoded.cutoff !== undefined &&
    decoded.cutoff !== null &&
    (!isFiniteNumber(decoded.cutoff) || decoded.cutoff < 0)
  ) {
    throw new Error('QR cutoff must be a non-negative number or null.');
  }
  return decoded as CvProfileQrEnvelope;
}
