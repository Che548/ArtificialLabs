import assert from 'node:assert/strict';
import test from 'node:test';
import { CaptureBuffer, CaptureReadiness, CaptureTracking, analyzeCaptureBurst, combineCaptureResults, shouldStartCaptureBuffer, shouldRefreshCaptureDetection, shouldRefreshCaptureAnalysis, CAPTURE_TRACKING_INTERVAL_MS, type AnalyzedFrame } from './capture-burst';
import type { AnalysisResult } from '../../modules/strip-cv/src/StripCv.types';
import type { StripDetection } from '../../modules/strip-cv/src/StripDetection';
import { getStripCaptureAdvice } from './strip-tracking';
import { INITIAL_CAPTURE_HINT, LiveCaptureFeedback, type LiveCaptureHint } from './live-capture-feedback';
import { getAnalysisDecision } from './result-interpretation';
import { didPhotoFlashFire, getCaptureLighting } from './capture-lighting';
import { appendShutterFrame, CAPTURE_BUFFER_SIZE, ENABLE_CAPTURE_BUFFERING, getCaptureSampleDelay } from './capture-burst';

test('buffer lighting uses a steady torch, auto meters once, and background turns it off', () => {
  const steady = { probe: false, flash: 'off', enableTorch: true };
  assert.deepEqual(getCaptureLighting('on', null, true), steady);
  assert.deepEqual(getCaptureLighting('auto', null, true), { probe: true, flash: 'auto', enableTorch: false });
  // Repeated preview/shutter work must not re-arm per-photo flash after metering.
  for (let i = 0; i < 30; i++) assert.deepEqual(getCaptureLighting('auto', true, true), steady);
  const dark = { probe: false, flash: 'off', enableTorch: false };
  assert.deepEqual(getCaptureLighting('auto', false, true), dark);
  assert.deepEqual(getCaptureLighting('off', true, true), dark);
  for (const mode of ['off', 'on', 'auto'] as const) {
    assert.deepEqual(getCaptureLighting(mode, true, false), dark);
    assert.deepEqual(getCaptureLighting(mode, null, false), dark);
  }
});

test('auto light reads the fired bit, including native EXIF strings and missing metadata', () => {
  for (const Flash of [1, 25, 31, '25', ' 31 ']) assert.equal(didPhotoFlashFire({ Flash }), true);
  for (const Flash of [0, 16, 24, 32, '24', '', null, -1, 1.5, NaN, 65537, 'unknown']) {
    assert.equal(didPhotoFlashFire({ Flash }), false);
  }
  assert.equal(didPhotoFlashFire(undefined), false);
});

function frame(i: number, count: 1 | 2 = 1, confidence = 0.95, status = 'valid'): AnalyzedFrame {
  return { uri: `file:///camera/${i}.jpg`, capturedAt: i * 100, result: {
    schema_version: '1.0', algorithm_version: 'test-reader', status,
    observed_line_count: count, reason_codes: [],
    peaks: { control: { detected: true }, test: { detected: count === 2 } },
    quality: { peak_pair_confidence: confidence },
    signal: { classification: null, value: null },
  } as AnalysisResult };
}

test('buffering is paused: preview files are discarded and only the shutter photo is analyzed', async () => {
  assert.equal(ENABLE_CAPTURE_BUFFERING, false);
  const deleted: string[] = [];
  const ring = new CaptureBuffer(uri => deleted.push(uri));
  for (let i = 0; i < 35; i++) ring.add(frame(i));
  assert.equal(ring.size, 0);
  assert.equal(deleted.length, 35);
  const photos = ring.freeze(3500);
  assert.deepEqual(photos, []);
  const shutter = frame(36, 1, .1, 'review');
  appendShutterFrame(photos, shutter, uri => deleted.push(uri));
  const calls: string[] = [];
  const selected = await analyzeCaptureBurst(photos, {
    analyze: async uri => { calls.push(uri); return shutter.result; },
    discard: async uri => { deleted.push(uri); },
    cancelled: () => false,
  });
  assert.deepEqual(calls, [shutter.uri]);
  assert.equal(selected?.result, shutter.result);
  assert.equal(getAnalysisDecision(selected!.result), 'review');
  assert.equal(deleted.includes(shutter.uri), false);
});

test('without a buffer, every live-check cycle gets a 1.5-second cooldown', () => {
  for (const tracking of [true, false]) for (const preview of [true, false]) {
    assert.equal(getCaptureSampleDelay(tracking, preview), 1500);
  }
  assert.equal(getCaptureSampleDelay(true, true, true), 200);
  assert.equal(getCaptureSampleDelay(true, false, true), 800);
  assert.equal(getCaptureSampleDelay(false, false, true), 1500);
});

test('ring keeps the newest 30, freezes at the tap, and deletes late arrivals', () => {
  const deleted: string[] = [];
  const ring = new CaptureBuffer(uri => deleted.push(uri), true);
  for (let i = 0; i < 35; i++) ring.add(frame(i));
  assert.equal(ring.size, 30);
  const frozen = ring.freeze(3500);
  assert.equal(frozen[0].uri, frame(5).uri);
  ring.add(frame(35)); ring.clear();
  assert.equal(deleted.length, 6);
  assert.equal(frozen.length, 30);
  assert.equal(ring.size, 0);
});

test('shutter photo replaces the oldest sample and is preferred only when agreeing', () => {
  const deleted: string[] = [];
  const frames = Array.from({ length: CAPTURE_BUFFER_SIZE }, (_, i) => frame(i));
  appendShutterFrame(frames, frame(31), uri => deleted.push(uri));
  assert.equal(frames.length, 30);
  assert.deepEqual(deleted, [frame(0).uri]);
  assert.equal(frames[29].source, 'photo');
  assert.equal(combineCaptureResults(frames, 30).uri, frame(31).uri);
  const conflicting = [...frames.slice(0, -1), { ...frame(31, 2), source: 'photo' as const }];
  assert.equal(getAnalysisDecision(combineCaptureResults(conflicting, 30).result), 'review');
  const unclear = [...frames.slice(0, -1), { ...frame(31, 1, .1, 'review'), source: 'photo' as const }];
  assert.notEqual(combineCaptureResults(unclear, 30).uri, frame(31).uri);
});

test('stable framing can arm a moderate detector proposal, but one uncertain observation cannot', () => {
  assert.equal(shouldStartCaptureBuffer(.6, 0), false);
  assert.equal(shouldStartCaptureBuffer(.6, 1), false);
  assert.equal(shouldStartCaptureBuffer(.6, 2), true);
  assert.equal(shouldStartCaptureBuffer(.9, 0), true);
  assert.equal(shouldStartCaptureBuffer(Number.NaN, 5), false);
  assert.equal(shouldStartCaptureBuffer(0, 5), false);
});

test('unlocked camera checks every frame; locked camera captures between bounded tracking checks', () => {
  assert.equal(shouldRefreshCaptureDetection(false, 1000, 1001), true);
  assert.equal(shouldRefreshCaptureDetection(true, 1000, 1001), false);
  assert.equal(shouldRefreshCaptureDetection(true, 1000, 1000 + CAPTURE_TRACKING_INTERVAL_MS - 1), false);
  assert.equal(shouldRefreshCaptureDetection(true, 1000, 1000 + CAPTURE_TRACKING_INTERVAL_MS), true);
  assert.equal(shouldRefreshCaptureDetection(true, 1000, 999), true);
});

test('full preview CV starts immediately, then waits 1.5 seconds after completion', () => {
  assert.equal(shouldRefreshCaptureAnalysis(null, 1000), true);
  // A slow call started at 1000 and completed at 4000. Its start time must not
  // cause an immediate second call, even if tracking has been reacquired.
  assert.equal(shouldRefreshCaptureAnalysis(4000, 4000), false);
  assert.equal(shouldRefreshCaptureAnalysis(4000, 5499), false);
  assert.equal(shouldRefreshCaptureAnalysis(4000, 5500), true);
  assert.equal(shouldRefreshCaptureAnalysis(4000, 3999), true);
});

test('readiness needs two successful full checks and resets after review, loss or a new session', () => {
  const readiness = new CaptureReadiness();
  assert.equal(readiness.observe(frame(0).result), false);
  assert.equal(readiness.observe(frame(1).result), true);
  assert.equal(readiness.observe(frame(2, 1, .99, 'review').result), false);
  assert.equal(readiness.observe(frame(3).result), false);
  assert.equal(readiness.observe(frame(4).result), true);
  readiness.reset();
  assert.equal(readiness.observe(frame(5).result), false);
  assert.equal(new CaptureReadiness().observe(frame(6).result), false);
});

test('old frames expire and leaving the camera discards only owned files', () => {
  const deleted: string[] = [];
  const ring = new CaptureBuffer(uri => deleted.push(uri), true);
  ring.add(frame(0)); ring.add({ ...frame(1), capturedAt: 31_000 });
  assert.deepEqual(deleted, [frame(0).uri]);
  ring.clear(); assert.deepEqual(deleted, [frame(0).uri, frame(1).uri]);
});

test('brief detection misses preserve completed photos and CV checks; sustained loss resets both', () => {
  const deleted: string[] = [];
  const ring = new CaptureBuffer(uri => deleted.push(uri), true);
  const tracking = new CaptureTracking();
  const readiness = new CaptureReadiness();
  const observe = (found: boolean, now: number) => {
    const state = tracking.observe(found, now);
    if (state === 'lost') { ring.clear(); readiness.reset(); }
    return state;
  };
  assert.equal(observe(false, 0), 'lost');
  assert.equal(observe(true, 100), 'found');
  assert.equal(readiness.observe(frame(0).result), false);
  ring.add(frame(1)); ring.add(frame(2));
  assert.equal(observe(false, 900), 'recovering');
  assert.equal(tracking.recovering, true);
  assert.equal(observe(false, 1100), 'recovering');
  assert.equal(observe(true, 1300), 'found');
  assert.equal(tracking.recovering, false);
  assert.equal(readiness.observe(frame(1).result), true);
  assert.equal(ring.size, 2); assert.equal(deleted.length, 0);
  assert.equal(observe(false, 2100), 'recovering');
  assert.equal(observe(false, 2500), 'recovering');
  assert.equal(observe(false, 4099), 'recovering');
  assert.equal(observe(false, 4100), 'lost');
  assert.equal(ring.size, 0); assert.equal(deleted.length, 2);
  assert.equal(readiness.observe(frame(2).result), false);
});

test('loss requires repeated misses as well as time, and a clock change cannot strand recovery', () => {
  const tracking = new CaptureTracking();
  tracking.observe(true, 0);
  assert.equal(tracking.observe(false, 100), 'recovering');
  assert.equal(tracking.observe(false, 3100), 'recovering');
  assert.equal(tracking.observe(false, 3101), 'lost');
  tracking.observe(true, 4000);
  assert.equal(tracking.observe(false, 4500), 'recovering');
  assert.equal(tracking.observe(false, 50), 'recovering');
  assert.equal(tracking.observe(false, 2050), 'lost');
});

test('locked tracking tolerates small thin-strip shifts without relaxing initial or framing gates', () => {
  const previous: StripDetection = { width: 1000, height: 1000, bbox: [100, 490, 900, 510], confidence: .9 };
  const moved: StripDetection = { ...previous, bbox: [100, 500, 900, 520] };
  assert.notEqual(getStripCaptureAdvice(moved, previous), null);
  assert.equal(getStripCaptureAdvice(moved, previous, true), null);
  assert.notEqual(getStripCaptureAdvice({ ...moved, bbox: [100, 590, 900, 610] }, previous, true), null);
  assert.notEqual(getStripCaptureAdvice({ ...moved, bbox: [200, 490, 800, 510] }, previous, true), null);
  assert.notEqual(getStripCaptureAdvice({ ...moved, bbox: [0, 490, 800, 510] }, previous, true), null);
  assert.notEqual(getStripCaptureAdvice({ ...moved, bbox: [400, 490, 600, 510] }, previous, true), null);
});

const blurHint: LiveCaptureHint = { kind: 'test', text: 'Изображение размыто', tone: 'warning' };
const lightHint: LiveCaptureHint = { kind: 'lowLight', text: 'Уберите блики', tone: 'warning' };
const readyHint: LiveCaptureHint = { kind: 'locked', text: 'Готово к съёмке', tone: 'success' };
const checkingHint: LiveCaptureHint = { kind: 'test', text: 'Проверяем стабильность кадра', tone: 'neutral' };

test('detector prompts, confirmed loss and reacquisition cannot erase a full CV warning', () => {
  const feedback = new LiveCaptureFeedback();
  assert.strictEqual(feedback.trackingLost(), INITIAL_CAPTURE_HINT);
  feedback.observeTracking(null);
  assert.strictEqual(feedback.observeAnalysis(blurHint), blurHint);
  for (const advice of ['Держите камеру неподвижно', null, 'Приблизьте камеру к тесту']) {
    assert.strictEqual(feedback.observeTracking(advice), blurHint);
  }
  assert.strictEqual(feedback.trackingLost(), blurHint);
  assert.strictEqual(feedback.observeTracking(null), blurHint);
  assert.strictEqual(feedback.analysisFailed(), blurHint);
  assert.strictEqual(feedback.observeAnalysis(checkingHint), blurHint);
  assert.strictEqual(feedback.observeAnalysis(readyHint), readyHint);
});

test('a different CV warning must repeat in two full checks, ignoring intermediate detector updates', () => {
  const feedback = new LiveCaptureFeedback();
  feedback.observeAnalysis(blurHint);
  assert.strictEqual(feedback.observeAnalysis(lightHint), blurHint);
  feedback.observeTracking('Держите камеру неподвижно');
  assert.strictEqual(feedback.observeAnalysis(lightHint), lightHint);
  assert.strictEqual(feedback.observeAnalysis(blurHint), lightHint);
  assert.strictEqual(feedback.observeAnalysis(checkingHint), lightHint);
  assert.strictEqual(feedback.observeAnalysis(blurHint), lightHint);
  assert.strictEqual(feedback.observeAnalysis(blurHint), blurHint);
});

test('ready status survives detector advice but is revoked immediately by loss or failed full CV', () => {
  const feedback = new LiveCaptureFeedback();
  feedback.observeAnalysis(readyHint);
  assert.strictEqual(feedback.observeTracking('Зафиксируйте камеру'), readyHint);
  const lostHint = feedback.trackingLost();
  assert.equal(lostHint.tone, 'neutral');
  assert.notEqual(lostHint.text, INITIAL_CAPTURE_HINT.text);
  assert.strictEqual(feedback.observeTracking(null), lostHint);
  feedback.observeAnalysis(readyHint);
  assert.strictEqual(feedback.observeAnalysis(blurHint), blurHint);
  feedback.observeAnalysis(readyHint);
  assert.equal(feedback.analysisFailed().tone, 'neutral');
});

test('quality weighted agreement retains the strongest actual photo without inflating confidence', () => {
  const frames = [frame(0, 2, .98), frame(1, 2, .97), frame(2, 2, .96), frame(3, 2, .95), frame(4, 1, .7)];
  const selected = combineCaptureResults(frames, 5);
  assert.equal(selected.uri, frames[0].uri);
  assert.equal(getAnalysisDecision(selected.result), 'reportable');
  assert.equal(selected.result.observed_line_count, 2);
  assert.ok(selected.result.quality.peak_pair_confidence < .9);
  assert.equal(selected.result.requires_user_confirmation, true);
});

test('one strong contrary frame is not outvoted by 29 correlated frames', () => {
  const frames = Array.from({ length: 29 }, (_, i) => frame(i));
  frames.push(frame(29, 2, .97));
  const selected = combineCaptureResults(frames, 30);
  assert.equal(getAnalysisDecision(selected.result), 'review');
  assert.equal(selected.result.observed_line_count, null);
  assert.ok(selected.result.reason_codes.includes('burst_disagreement'));
});

test('abstentions and failed frames cannot manufacture consensus', () => {
  const valid = Array.from({ length: 3 }, (_, i) => frame(i));
  assert.equal(getAnalysisDecision(combineCaptureResults(valid, 30).result), 'review');
  const reviews = Array.from({ length: 30 }, (_, i) => frame(i, 1, .99, 'review'));
  assert.notEqual(getAnalysisDecision(combineCaptureResults(reviews, 30).result), 'reportable');
  const balanced = [frame(1, 1, .8), frame(2, 2, .8)];
  assert.equal(getAnalysisDecision(combineCaptureResults(balanced, 2).result), 'review');
});

test('single capture preserves the existing decision', () => {
  const single = frame(0);
  assert.equal(combineCaptureResults([single], 1), single);
});

test('quorum and weighted agreement boundaries are inclusive without relaxing single-frame gates', () => {
  const half = [frame(0, 1, .8), frame(1, 1, .8), frame(2, 1, .8)];
  assert.equal(getAnalysisDecision(combineCaptureResults(half, 6).result), 'reportable');
  assert.equal(getAnalysisDecision(combineCaptureResults(half, 7).result), 'review');
  const eighty = [...half, frame(3, 1, .8), frame(4, 2, .8)];
  assert.equal(getAnalysisDecision(combineCaptureResults(eighty, 5).result), 'reportable');
  const below = [...half, frame(3, 1, .79), frame(4, 2, .8)];
  assert.equal(getAnalysisDecision(combineCaptureResults(below, 5).result), 'review');
  assert.equal(getAnalysisDecision(combineCaptureResults([frame(0, 1, .64), frame(1, 1, .64)], 2).result), 'review');
});

test('all frames run serially; cleanup keeps just the selected original', async () => {
  const frames = Array.from({ length: 5 }, (_, i) => frame(i));
  const processed: string[] = [], deleted: string[] = [], progress: number[] = [];
  let active = 0;
  const result = await analyzeCaptureBurst(frames, {
    analyze: async uri => {
      assert.equal(++active, 1);
      await Promise.resolve();
      processed.push(uri); active--;
      return frames.find(frame => frame.uri === uri)!.result;
    },
    discard: async uri => { deleted.push(uri); }, cancelled: () => false,
    progress: completed => progress.push(completed),
  });
  assert.equal(processed.length, 5);
  assert.deepEqual(progress, [1, 2, 3, 4, 5]);
  assert.equal(deleted.length, 4);
  assert.ok(!deleted.includes(result!.uri));
});

test('cancellation cleans the in-flight frame and all pending frames', async () => {
  const frames = [frame(1), frame(2), frame(3)];
  const deleted: string[] = []; let cancelled = false, calls = 0;
  const result = await analyzeCaptureBurst(frames, {
    analyze: async () => { calls++; cancelled = true; return frames[0].result; },
    discard: async uri => { deleted.push(uri); }, cancelled: () => cancelled,
  });
  assert.equal(result, null); assert.equal(calls, 1);
  assert.equal(deleted.length, 3);
});

test('individual inference failures abstain and every file is cleaned on total failure', async () => {
  const deleted: string[] = [];
  await assert.rejects(analyzeCaptureBurst([frame(0), frame(1)], {
    analyze: async () => { throw Error('native failure'); },
    discard: async uri => { deleted.push(uri); }, cancelled: () => false,
  }));
  assert.equal(deleted.length, 2);
});
