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

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 128;

const isIntegerInRange = (value: unknown, min: number, max: number): boolean =>
  Number.isInteger(value) &&
  isFiniteNumber(value) &&
  value >= min &&
  value <= max;

const isNumberInRange = (
  value: unknown,
  min: number,
  max: number,
  includeMin = true,
): value is number =>
  isFiniteNumber(value) &&
  (includeMin ? value >= min : value > min) &&
  value <= max;

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

const qualityThresholdsAreValid = (value: unknown): boolean => {
  if (!isObject(value)) {
    return false;
  }
  return (
    isNumberInRange(value.min_control_snr, 0, 1_000, false) &&
    isNumberInRange(value.min_test_snr, 0, 1_000, false) &&
    isNumberInRange(value.min_control_area, 0, 1, false) &&
    isNumberInRange(value.min_valid_fraction, 0, 1, false) &&
    isNumberInRange(value.min_blur_variance, 0, 1_000_000, false) &&
    isNumberInRange(value.max_clipped_fraction, 0, 1) &&
    isNumberInRange(value.max_glare_fraction, 0, 1) &&
    isNumberInRange(value.min_quad_area_fraction, 0, 1, false) &&
    isNumberInRange(value.max_calibration_residual, 0, 10, false)
  );
};

const isPointWithin = (
  value: unknown,
  width: number,
  height: number,
): value is readonly [number, number] =>
  Array.isArray(value) &&
  value.length === 2 &&
  isNumberInRange(value[0], 0, width) &&
  isNumberInRange(value[1], 0, height);

const isConvexQuad = (points: readonly (readonly [number, number])[]) => {
  const crossProducts = points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    const afterNext = points[(index + 2) % points.length];
    return (
      (next[0] - point[0]) * (afterNext[1] - next[1]) -
      (next[1] - point[1]) * (afterNext[0] - next[0])
    );
  });
  return (
    crossProducts.every((cross) => cross > 0) ||
    crossProducts.every((cross) => cross < 0)
  );
};

function assertAssayProfile(value: unknown): asserts value is AssayProfile {
  if (!isObject(value)) {
    throw new Error('QR profile is missing assay_profile.');
  }
  if (
    value.schema_version !== '1.0' ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.version) ||
    !isIntegerInRange(value.canonical_width, 128, 8192) ||
    !isIntegerInRange(value.canonical_height, 32, 4096) ||
    !isNumberInRange(value.min_aspect_ratio, 1, 100, false) ||
    !isNumberInRange(value.max_aspect_ratio, 1, 100) ||
    value.min_aspect_ratio <= 1 ||
    value.max_aspect_ratio <= value.min_aspect_ratio ||
    !isRect(value.membrane_roi) ||
    !isRect(value.test_window) ||
    !isRect(value.control_window) ||
    !isNumberInRange(value.expected_line_width, 0, 0.5, false) ||
    !isNumberInRange(value.integration_half_width, 0, 0.5, false) ||
    !['left_to_right', 'right_to_left'].includes(
      String(value.sample_to_wick),
    ) ||
    value.positive_when !== 'gte' ||
    (value.default_cutoff !== null &&
      !isNumberInRange(value.default_cutoff, 0, 1_000)) ||
    !qualityThresholdsAreValid(value.quality)
  ) {
    throw new Error('QR assay profile does not match StripCV schema v1.');
  }
}

function assertCardProfile(value: unknown): asserts value is CardProfile {
  if (!isObject(value)) {
    throw new Error('QR card profile must be an object or null.');
  }
  const canonicalWidth = value.canonical_width;
  const canonicalHeight = value.canonical_height;
  const physicalWidth = value.physical_width_mm;
  const physicalHeight = value.physical_height_mm;
  const centers = value.fiducial_centers;
  const patches = value.patches;
  if (
    value.schema_version !== '1.0' ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.version) ||
    !isNonEmptyString(value.print_batch) ||
    typeof value.enrolled !== 'boolean' ||
    !isIntegerInRange(canonicalWidth, 256, 8192) ||
    !isIntegerInRange(canonicalHeight, 256, 8192) ||
    Math.abs(Number(canonicalWidth) - Number(canonicalHeight)) > 1 ||
    !isNumberInRange(physicalWidth, 0, 1_000, false) ||
    !isNumberInRange(physicalHeight, 0, 1_000, false) ||
    Math.abs(Number(physicalWidth) - Number(physicalHeight)) > 0.01 ||
    !isNumberInRange(value.min_area_fraction, 0, 1, false) ||
    !isNumberInRange(value.max_holdout_residual, 0, 10, false) ||
    (value.fiducial_side_px !== undefined &&
      !isNumberInRange(
        value.fiducial_side_px,
        0,
        Number(canonicalWidth),
        false,
      )) ||
    !Array.isArray(centers) ||
    centers.length !== 4 ||
    !centers.every((point) =>
      isPointWithin(point, Number(canonicalWidth), Number(canonicalHeight)),
    ) ||
    new Set(centers.map((point) => JSON.stringify(point))).size !== 4 ||
    !isConvexQuad(centers as readonly (readonly [number, number])[]) ||
    !Array.isArray(patches) ||
    patches.length === 0 ||
    patches.length > 256 ||
    !patches.every(
      (patch) =>
        isObject(patch) &&
        isNonEmptyString(patch.id) &&
        ['neutral', 'holdout', 'black', 'calibration'].includes(
          String(patch.role),
        ) &&
        isRect(patch.roi) &&
        Array.isArray(patch.reference_rgb) &&
        patch.reference_rgb.length === 3 &&
        patch.reference_rgb.every((channel) => isNumberInRange(channel, 0, 1)),
    ) ||
    new Set(patches.map((patch) => (isObject(patch) ? patch.id : undefined)))
      .size !== patches.length
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
    !isNumberInRange(decoded.cutoff, 0, 1_000)
  ) {
    throw new Error('QR cutoff must be between 0 and 1000 or null.');
  }
  if (
    decoded.product !== undefined &&
    (!isObject(decoded.product) ||
      (decoded.product.label !== undefined &&
        !isNonEmptyString(decoded.product.label)) ||
      (decoded.product.batch !== undefined &&
        !isNonEmptyString(decoded.product.batch)) ||
      (decoded.product.expires_at !== undefined &&
        !isNonEmptyString(decoded.product.expires_at)))
  ) {
    throw new Error('QR product metadata must contain short text fields only.');
  }
  return decoded as CvProfileQrEnvelope;
}
