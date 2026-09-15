import type { StripDetection } from '../../modules/strip-cv/src/StripDetection';

const MIN_INTERVAL_MS = 1500;
const MANUAL_OVERRIDE_MS = 5000;

type FocusTarget = { x: number; y: number; span: number };

/** Actual detector center in the aspect-fill preview, without HUD padding/clipping. */
export function mapDetectionFocus(
  detection: StripDetection,
  view: { width: number; height: number },
): FocusTarget | null {
  const { width, height, bbox } = detection;
  if (![width, height, view.width, view.height, ...bbox].every(Number.isFinite) ||
      Math.min(width, height, view.width, view.height) <= 0 ||
      bbox[2] <= bbox[0] || bbox[3] <= bbox[1]) return null;
  const scale = Math.max(view.width / width, view.height / height);
  const x = .5 + ((bbox[0] + bbox[2]) / 2 - width / 2) * scale / view.width;
  const y = .5 + ((bbox[1] + bbox[3]) / 2 - height / 2) * scale / view.height;
  // A cropped-away center is not a useful focus target at the preview edge.
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  const span = Math.hypot((bbox[2] - bbox[0]) * scale / view.width,
    (bbox[3] - bbox[1]) * scale / view.height);
  return { x, y, span };
}

export class DetectionAutofocus {
  private last: (FocusTarget & { time: number }) | null = null;
  private manualUntil = 0;

  manualFocus(now: number): void {
    this.manualUntil = now + MANUAL_OVERRIDE_MS;
    this.last = null;
  }

  reset(): void {
    this.last = null;
  }

  next(detection: StripDetection, view: { width: number; height: number }, now: number,
    stable = false): { x: number; y: number } | null {
    if (now < this.manualUntil || !Number.isFinite(detection.confidence) ||
        detection.confidence <= 0 || detection.confidence > 1 ||
        (detection.confidence < .8 && !stable)) return null;
    const target = mapDetectionFocus(detection, view);
    if (!target) return null;
    if (this.last) {
      const elapsed = now - this.last.time;
      if (elapsed >= 0 && elapsed < MIN_INTERVAL_MS) return null;
      const moved = Math.hypot(target.x - this.last.x, target.y - this.last.y) >= .04;
      const scale = target.span / this.last.span;
      // Native continuous autofocus follows depth without resetting the point.
      if (!moved && scale > .85 && scale < 1.15) return null;
    }
    this.last = { ...target, time: now };
    return { x: target.x, y: target.y };
  }
}
