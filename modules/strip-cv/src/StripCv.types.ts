export type Point = readonly [x: number, y: number];
export type NormalizedRect = readonly [
  x0: number,
  y0: number,
  x1: number,
  y1: number,
];

export type AssayProfile = {
  schema_version: '1.0';
  id: string;
  version: string;
  canonical_width: number;
  canonical_height: number;
  min_aspect_ratio: number;
  max_aspect_ratio: number;
  membrane_roi: NormalizedRect;
  sample_to_wick: 'left_to_right' | 'right_to_left';
  test_window: NormalizedRect;
  control_window: NormalizedRect;
  expected_line_width: number;
  integration_half_width: number;
  default_cutoff: number | null;
  positive_when: 'gte';
  quality: {
    min_control_snr: number;
    min_test_snr: number;
    min_control_area: number;
    min_valid_fraction: number;
    min_blur_variance: number;
    max_clipped_fraction: number;
    max_glare_fraction: number;
    min_quad_area_fraction: number;
    max_calibration_residual: number;
  };
};

export type CardProfile = {
  schema_version: '1.0';
  id: string;
  version: string;
  print_batch: string;
  enrolled: boolean;
  canonical_width: number;
  canonical_height: number;
  physical_width_mm: number;
  physical_height_mm: number;
  min_area_fraction: number;
  fiducial_centers: readonly Point[];
  fiducial_side_px?: number;
  max_holdout_residual: number;
  patches: readonly {
    id: string;
    role: 'neutral' | 'holdout' | 'black' | 'calibration';
    roi: NormalizedRect;
    reference_rgb: readonly [number, number, number];
  }[];
};

export type AnalyzeStripRequest = {
  imageUri: string;
  assayProfile: AssayProfile;
  cardProfile?: CardProfile | null;
  cutoff?: number | null;
  cornerOverride?: readonly [Point, Point, Point, Point] | null;
  flipOrientation?: boolean;
};

export type PeakMetrics = {
  detected: boolean;
  position: number;
  height: number;
  prominence: number;
  snr: number;
  fwhm: number;
  area: number;
};

export type AnalysisResult = {
  schema_version: '1.0';
  algorithm_version: string;
  assay_profile: { id: string; version: string };
  status: 'valid' | 'review' | 'invalid';
  reason_codes: string[];
  calibration_mode:
    'none' | 'internal_reference' | 'card_uncalibrated' | 'card_calibrated';
  geometry: {
    mode: string;
    corners: Point[];
    homography: number[][];
    manually_corrected: boolean;
    calibration_tile: {
      detected: boolean;
      corners: Point[];
      homography: number[][];
    };
  };
  quality: Record<string, number>;
  profile: {
    x: number[];
    raw: number[];
    baseline: number[];
    corrected: number[];
  };
  peaks: { test: PeakMetrics; control: PeakMetrics };
  signal: {
    metric: 'test_control_peak_area_ratio';
    value: number | null;
    cutoff: number | null;
    cutoff_source: 'none' | 'assay_profile' | 'session_override';
    positive_when: 'gte';
    classification: 'POS' | 'NEG' | null;
  };
  artifacts: Record<string, number>;
  timings_ms: Record<string, number>;
};
