import type { AnalysisResult } from '../../modules/strip-cv';
import type { ActiveCvConfiguration } from './scanning-configuration';

export type OverlayPoint = {
  x: number;
  y: number;
};

export type ScanOverlayGeometry = {
  strip: OverlayPoint[] | null;
  calibrationTile: OverlayPoint[] | null;
  controlWindow: OverlayPoint[] | null;
  testWindow: OverlayPoint[] | null;
  controlPeak: OverlayPoint[] | null;
  testPeak: OverlayPoint[] | null;
};

type ImageSize = {
  width: number;
  height: number;
};

type ViewSize = ImageSize;
type ResizeMode = 'cover' | 'contain';

const isFinitePoint = (point: readonly number[]): boolean =>
  point.length === 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]);

const sourcePointToView = (
  point: readonly number[],
  imageSize: ImageSize,
  viewSize: ViewSize,
  resizeMode: ResizeMode,
): OverlayPoint | null => {
  if (
    !isFinitePoint(point) ||
    imageSize.width <= 0 ||
    imageSize.height <= 0 ||
    viewSize.width <= 0 ||
    viewSize.height <= 0
  ) {
    return null;
  }

  const scale =
    resizeMode === 'contain'
      ? Math.min(
          viewSize.width / imageSize.width,
          viewSize.height / imageSize.height,
        )
      : Math.max(
          viewSize.width / imageSize.width,
          viewSize.height / imageSize.height,
        );
  const renderedWidth = imageSize.width * scale;
  const renderedHeight = imageSize.height * scale;
  return {
    x: (viewSize.width - renderedWidth) / 2 + point[0] * scale,
    y: (viewSize.height - renderedHeight) / 2 + point[1] * scale,
  };
};

const mapSourcePolygon = (
  points: readonly (readonly number[])[],
  imageSize: ImageSize,
  viewSize: ViewSize,
  resizeMode: ResizeMode,
): OverlayPoint[] | null => {
  if (points.length < 2) {
    return null;
  }
  const mapped = points.map((point) =>
    sourcePointToView(point, imageSize, viewSize, resizeMode),
  );
  return mapped.every((point): point is OverlayPoint => point !== null)
    ? mapped
    : null;
};

const invertHomography = (
  matrix: readonly (readonly number[])[],
): number[][] | null => {
  if (
    matrix.length !== 3 ||
    matrix.some(
      (row) => row.length !== 3 || row.some((value) => !Number.isFinite(value)),
    )
  ) {
    return null;
  }

  const [a, b, c] = matrix[0];
  const [d, e, f] = matrix[1];
  const [g, h, i] = matrix[2];
  const determinant =
    a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-9) {
    return null;
  }

  return [
    [
      (e * i - f * h) / determinant,
      (c * h - b * i) / determinant,
      (b * f - c * e) / determinant,
    ],
    [
      (f * g - d * i) / determinant,
      (a * i - c * g) / determinant,
      (c * d - a * f) / determinant,
    ],
    [
      (d * h - e * g) / determinant,
      (b * g - a * h) / determinant,
      (a * e - b * d) / determinant,
    ],
  ];
};

const project = (
  matrix: readonly (readonly number[])[],
  point: OverlayPoint,
): OverlayPoint | null => {
  const denominator =
    matrix[2][0] * point.x + matrix[2][1] * point.y + matrix[2][2];
  if (!Number.isFinite(denominator) || Math.abs(denominator) < 1e-9) {
    return null;
  }
  const x =
    (matrix[0][0] * point.x + matrix[0][1] * point.y + matrix[0][2]) /
    denominator;
  const y =
    (matrix[1][0] * point.x + matrix[1][1] * point.y + matrix[1][2]) /
    denominator;
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
};

const canonicalToSource = (
  result: AnalysisResult,
  point: OverlayPoint,
): OverlayPoint | null => {
  const inverse = invertHomography(result.geometry.homography);
  return inverse ? project(inverse, point) : null;
};

const mapCanonicalPolygon = (
  result: AnalysisResult,
  points: readonly OverlayPoint[],
  imageSize: ImageSize,
  viewSize: ViewSize,
  resizeMode: ResizeMode,
): OverlayPoint[] | null => {
  const sourcePoints = points.map((point) => canonicalToSource(result, point));
  if (!sourcePoints.every((point): point is OverlayPoint => point !== null)) {
    return null;
  }
  return mapSourcePolygon(
    sourcePoints.map((point) => [point.x, point.y]),
    imageSize,
    viewSize,
    resizeMode,
  );
};

const canonicalWindow = (
  configuration: ActiveCvConfiguration,
  window: readonly [number, number, number, number],
): OverlayPoint[] => {
  const membrane = configuration.assayProfile.membrane_roi;
  const membraneWidth = membrane[2] - membrane[0];
  const membraneHeight = membrane[3] - membrane[1];
  const [x0, y0, x1, y1] = window;
  const canonicalWidth = configuration.assayProfile.canonical_width - 1;
  const canonicalHeight = configuration.assayProfile.canonical_height - 1;
  return [
    {
      x: (membrane[0] + x0 * membraneWidth) * canonicalWidth,
      y: (membrane[1] + y0 * membraneHeight) * canonicalHeight,
    },
    {
      x: (membrane[0] + x1 * membraneWidth) * canonicalWidth,
      y: (membrane[1] + y0 * membraneHeight) * canonicalHeight,
    },
    {
      x: (membrane[0] + x1 * membraneWidth) * canonicalWidth,
      y: (membrane[1] + y1 * membraneHeight) * canonicalHeight,
    },
    {
      x: (membrane[0] + x0 * membraneWidth) * canonicalWidth,
      y: (membrane[1] + y1 * membraneHeight) * canonicalHeight,
    },
  ];
};

const canonicalPeak = (
  configuration: ActiveCvConfiguration,
  position: number,
): OverlayPoint[] => {
  const membrane = configuration.assayProfile.membrane_roi;
  const membraneWidth = membrane[2] - membrane[0];
  const canonicalWidth = configuration.assayProfile.canonical_width - 1;
  const canonicalHeight = configuration.assayProfile.canonical_height - 1;
  const x = (membrane[0] + position * membraneWidth) * canonicalWidth;
  const y0 = membrane[1] * canonicalHeight;
  const y1 = membrane[3] * canonicalHeight;
  return [
    { x, y: y0 },
    { x, y: y1 },
  ];
};

export function getScanOverlayGeometry(
  result: AnalysisResult,
  configuration: ActiveCvConfiguration,
  imageSize: ImageSize,
  viewSize: ViewSize,
  resizeMode: ResizeMode = 'cover',
): ScanOverlayGeometry {
  const strip = mapSourcePolygon(
    result.geometry.corners,
    imageSize,
    viewSize,
    resizeMode,
  );
  const calibrationTile = result.geometry.calibration_tile.detected
    ? mapSourcePolygon(
        result.geometry.calibration_tile.corners,
        imageSize,
        viewSize,
        resizeMode,
      )
    : null;
  const controlWindow = mapCanonicalPolygon(
    result,
    canonicalWindow(configuration, configuration.assayProfile.control_window),
    imageSize,
    viewSize,
    resizeMode,
  );
  const testWindow = mapCanonicalPolygon(
    result,
    canonicalWindow(configuration, configuration.assayProfile.test_window),
    imageSize,
    viewSize,
    resizeMode,
  );
  const controlPeak = result.peaks.control.detected
    ? mapCanonicalPolygon(
        result,
        canonicalPeak(configuration, result.peaks.control.position),
        imageSize,
        viewSize,
        resizeMode,
      )
    : null;
  const testPeak = result.peaks.test.detected
    ? mapCanonicalPolygon(
        result,
        canonicalPeak(configuration, result.peaks.test.position),
        imageSize,
        viewSize,
        resizeMode,
      )
    : null;

  return {
    strip,
    calibrationTile,
    controlWindow,
    testWindow,
    controlPeak,
    testPeak,
  };
}
