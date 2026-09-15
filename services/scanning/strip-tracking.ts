import type { StripDetection } from '../../modules/strip-cv/src/StripDetection';

export type TrackingRect = { x: number; y: number; width: number; height: number };

export function getStripCaptureAdvice(current: StripDetection, previous: StripDetection | null, trackingLocked = false): string | null {
  const [x0, y0, x1, y1] = current.bbox;
  if (x0 < current.width * .015 || y0 < current.height * .015 ||
      x1 > current.width * .985 || y1 > current.height * .985) return 'Покажите тест в кадре целиком';
  if (Math.max((x1 - x0) / current.width, (y1 - y0) / current.height) < .35)
    return 'Приблизьте камеру к тесту';
  if (!previous || previous.width !== current.width || previous.height !== current.height)
    return 'Зафиксируйте камеру над тестом';
  const p = previous.bbox;
  if (trackingLocked) {
    // Thin strips lose most box overlap after just a few pixels of translation.
    // Once acquired, compare movement against the image, not the strip thickness.
    const centerShift = Math.hypot((x0 + x1 - p[0] - p[2]) / (2 * current.width),
      (y0 + y1 - p[1] - p[3]) / (2 * current.height));
    const scale = Math.max(x1 - x0, y1 - y0) / Math.max(p[2] - p[0], p[3] - p[1]);
    if (centerShift <= .05 && scale >= .8 && scale <= 1.25) return null;
  }
  const overlap = Math.max(0, Math.min(x1, p[2]) - Math.max(x0, p[0])) *
    Math.max(0, Math.min(y1, p[3]) - Math.max(y0, p[1]));
  const union = (x1 - x0) * (y1 - y0) + (p[2] - p[0]) * (p[3] - p[1]) - overlap;
  if (union <= 0 || overlap / union < .8) return 'Держите камеру неподвижно';
  return null;
}

/** Map source pixels to the centered, aspect-fill back-camera preview. */
export function mapStripTrackingBox(
  detection: StripDetection,
  view: { width: number; height: number },
): TrackingRect | null {
  const { width, height, bbox } = detection;
  if (![width, height, view.width, view.height, ...bbox].every(Number.isFinite) ||
      Math.min(width, height, view.width, view.height) <= 0 || bbox[2] <= bbox[0] || bbox[3] <= bbox[1]) return null;
  const scale = Math.max(view.width / width, view.height / height);
  const dx = (view.width - width * scale) / 2;
  const dy = (view.height - height * scale) / 2;
  const left = bbox[0] * scale + dx, top = bbox[1] * scale + dy;
  const right = bbox[2] * scale + dx, bottom = bbox[3] * scale + dy;
  if (right <= 0 || bottom <= 0 || left >= view.width || top >= view.height) return null;
  const x = Math.max(8, left - 12), y = Math.max(8, top - 12);
  const endX = Math.min(view.width - 8, right + 12), endY = Math.min(view.height - 8, bottom + 12);
  if (endX - x < 28 || endY - y < 28) return null;
  return { x, y, width: endX - x, height: endY - y };
}
