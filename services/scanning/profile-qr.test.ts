import assert from 'node:assert/strict';
import test from 'node:test';

import { parseCvProfileQr } from './profile-qr.ts';
import { assertTrustedCvProfileEnvelope } from './profile-trust.ts';
import { DEFAULT_ASSAY_PROFILE, DEFAULT_CARD_PROFILE } from './profiles.ts';
import { ScanningConfiguration } from './scanning-configuration.ts';

const incompleteProfileEnvelope = {
  schema_version: 'artificial-labs.cv-profile/1',
  assay_profile: {
    schema_version: '1.0',
    id: 'test-strip',
    version: '1.0',
    canonical_width: 1024,
    canonical_height: 160,
    min_aspect_ratio: 3,
    max_aspect_ratio: 35,
    membrane_roi: [0.38, 0.15, 0.97, 0.85],
    sample_to_wick: 'left_to_right',
    test_window: [0.17, 0, 0.27, 1],
    control_window: [0.075, 0, 0.17, 1],
    expected_line_width: 0.035,
    integration_half_width: 0.03,
    default_cutoff: null,
    positive_when: 'gte',
    quality: {},
  },
};

const validQuality = {
  min_control_snr: 5,
  min_test_snr: 3,
  min_control_area: 0.0001,
  min_valid_fraction: 0.65,
  min_blur_variance: 18,
  max_clipped_fraction: 0.08,
  max_glare_fraction: 0.03,
  min_quad_area_fraction: 0.025,
  max_calibration_residual: 0.12,
};

const validCardProfile = {
  schema_version: '1.0',
  id: 'calibration-card',
  version: '2.0',
  print_batch: 'batch-1',
  enrolled: true,
  canonical_width: 700,
  canonical_height: 700,
  physical_width_mm: 70,
  physical_height_mm: 70,
  min_area_fraction: 0.005,
  fiducial_centers: [
    [100, 100],
    [600, 100],
    [600, 600],
    [100, 600],
  ],
  fiducial_side_px: 120,
  max_holdout_residual: 0.12,
  patches: [
    {
      id: 'white',
      role: 'calibration',
      roi: [0.2, 0.2, 0.3, 0.3],
      reference_rgb: [0.95, 0.95, 0.95],
    },
  ],
};

const validEnvelope = {
  ...incompleteProfileEnvelope,
  assay_profile: {
    ...incompleteProfileEnvelope.assay_profile,
    quality: validQuality,
  },
  card_profile: validCardProfile,
  cutoff: 1.25,
};

test('rejects QR assay profiles with incomplete quality thresholds', () => {
  assert.throws(
    () => parseCvProfileQr(JSON.stringify(incompleteProfileEnvelope)),
    /does not match StripCV schema v1/,
  );
});

test('rejects malformed numeric and geometric card-profile fields', () => {
  const malformedCards = [
    { ...validCardProfile, canonical_width: Number.NaN },
    { ...validCardProfile, physical_height_mm: -1 },
    {
      ...validCardProfile,
      fiducial_centers: [
        [100, 100],
        [600, 600],
        [600, 100],
        [100, 600],
      ],
    },
    {
      ...validCardProfile,
      patches: [
        {
          id: 'bad-rgb',
          role: 'calibration',
          roi: [0.2, 0.2, 0.3, 0.3],
          reference_rgb: [0.5, Number.NaN, 2],
        },
      ],
    },
  ];

  for (const card_profile of malformedCards) {
    assert.throws(
      () =>
        parseCvProfileQr(JSON.stringify({ ...validEnvelope, card_profile })),
      /calibration-card profile does not match StripCV schema v1/,
    );
  }
});

test('accepts a complete valid assay and card profile', () => {
  assert.deepEqual(
    parseCvProfileQr(JSON.stringify(validEnvelope)),
    validEnvelope,
  );
});

test('rejects malformed display metadata and nonsensical cutoffs', () => {
  assert.throws(
    () =>
      parseCvProfileQr(
        JSON.stringify({
          ...validEnvelope,
          product: { label: { nested: 'not renderable' } },
        }),
      ),
    /product metadata/,
  );
  assert.throws(
    () =>
      parseCvProfileQr(JSON.stringify({ ...validEnvelope, cutoff: 1_000_000 })),
    /cutoff/,
  );
});

test('trust gate rejects unsigned algorithm and cutoff overrides', () => {
  const parsed = parseCvProfileQr(JSON.stringify(validEnvelope));
  assert.ok(parsed);
  assert.throws(
    () => assertTrustedCvProfileEnvelope(parsed),
    /не подписан|доверенных профилей/,
  );
  assert.throws(() =>
    assertTrustedCvProfileEnvelope({
      schema_version: 'artificial-labs.cv-profile/1',
      assay_profile: DEFAULT_ASSAY_PROFILE,
      card_profile: null,
      cutoff: null,
    }),
  );
});

test('trust gate accepts only the exact bundled algorithm without a cutoff', () => {
  const parsed = parseCvProfileQr(
    JSON.stringify({
      schema_version: 'artificial-labs.cv-profile/1',
      assay_profile: DEFAULT_ASSAY_PROFILE,
      card_profile: DEFAULT_CARD_PROFILE,
      cutoff: null,
      product: { label: 'Проверенный встроенный профиль' },
    }),
  );
  assert.ok(parsed);
  assert.doesNotThrow(() => assertTrustedCvProfileEnvelope(parsed));
});

test('test mode selects the schema-validated legacy QR pipeline', async () => {
  const configuration = new ScanningConfiguration();

  assert.equal(
    configuration.applyQrConfiguration(JSON.stringify(validEnvelope)),
    true,
  );

  const normalConfiguration = configuration.getConfiguration();
  const legacyConfiguration = configuration.getConfiguration({
    useLegacyPipeline: true,
  });

  assert.equal(normalConfiguration.assayProfile.id, DEFAULT_ASSAY_PROFILE.id);
  assert.equal(normalConfiguration.cutoff, null);
  assert.equal(
    legacyConfiguration.assayProfile.id,
    validEnvelope.assay_profile.id,
  );
  assert.deepEqual(legacyConfiguration.cardProfile, validEnvelope.card_profile);
  assert.equal(legacyConfiguration.cutoff, validEnvelope.cutoff);
  assert.throws(
    () => configuration.assertNormalPipelineAllowed(false),
    /доступен только в тестовом режиме/,
  );
});
