import assert from 'node:assert/strict';
import test from 'node:test';
import { DetectionAutofocus, mapDetectionFocus } from './detection-autofocus';
import type { StripDetection } from '../../modules/strip-cv/src/StripDetection';

const view = { width: 400, height: 800 };
const detection: StripDetection = { width: 1200, height: 1600,
  bbox: [500, 1000, 900, 1100], confidence: .9 };

test('focus uses the source center after aspect-fill cropping, without HUD clipping', () => {
  const target = mapDetectionFocus(detection, view)!;
  assert.equal(target.x, .625);
  assert.equal(target.y, .65625);
  // Partial visibility must not pull the true center toward the clipped HUD.
  assert.equal(mapDetectionFocus({ ...detection, bbox: [100, 900, 400, 1000] }, view)!.x, .0625);
  assert.equal(mapDetectionFocus({ ...detection, bbox: [0, 900, 200, 1000] }, view), null);
  const landscape = mapDetectionFocus({ width: 1600, height: 1200,
    bbox: [1000, 500, 1100, 900], confidence: .9 }, { width: 800, height: 400 })!;
  assert.equal(landscape.x, .65625);
  assert.equal(landscape.y, .625);
  assert.equal(mapDetectionFocus(detection, { width: 0, height: 0 }), null);
  assert.equal(mapDetectionFocus({ ...detection, bbox: [NaN, 0, 10, 10] }, view), null);
  assert.equal(mapDetectionFocus({ ...detection, bbox: [100, 100, 0, 0] }, view), null);
});

test('autofocus ignores jitter and leaves an unchanged point to continuous native focus', () => {
  const focus = new DetectionAutofocus();
  assert.ok(focus.next(detection, view, 1000));
  const moved = { ...detection, bbox: [600, 1000, 1000, 1100] as const };
  assert.equal(focus.next(moved, view, 2499), null);
  assert.ok(focus.next(moved, view, 2500));
  assert.equal(focus.next({ ...moved, bbox: [605, 1003, 1005, 1103] }, view, 4500), null);
  assert.equal(focus.next(moved, view, 8499), null);
  assert.equal(focus.next(moved, view, 8500), null);
  assert.equal(focus.next(moved, view, 60000), null);
});

test('approaching the camera refocuses even when the center does not move', () => {
  const focus = new DetectionAutofocus();
  assert.ok(focus.next(detection, view, 1000));
  assert.ok(focus.next({ ...detection, bbox: [400, 1000, 1000, 1100] }, view, 2500));
});

test('uncertain detections require stable framing; manual focus wins across tracking resets', () => {
  const focus = new DetectionAutofocus();
  const uncertain = { ...detection, confidence: .6 };
  assert.equal(focus.next(uncertain, view, 1000), null);
  assert.equal(focus.next({ ...detection, confidence: NaN }, view, 1000, true), null);
  assert.ok(focus.next(uncertain, view, 1000, true));
  focus.manualFocus(1100);
  focus.reset();
  assert.equal(focus.next(detection, view, 6099), null);
  assert.ok(focus.next(detection, view, 6100));
  focus.reset();
  assert.ok(focus.next(detection, view, 6200));
});
