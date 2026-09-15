import type { AnalysisResult } from '../../modules/strip-cv/src/StripCv.types';
import { deriveDetectedInterpretation, getAnalysisConfidence, getAnalysisDecision } from './result-interpretation';

export const CAPTURE_BUFFER_SIZE = 30;
// Temporarily disabled while investigating live-camera stutter. Keep the
// reversible burst implementation, but never retain preview files in this mode.
export const ENABLE_CAPTURE_BUFFERING = false;
export const CAPTURE_DETECTION_CONFIDENCE = 0.8;
// Video samples need no still-photo processing; leave room for preview/UI work.
export const CAPTURE_LOOP_DELAY_MS = 200;
export const CAPTURE_PHOTO_FALLBACK_DELAY_MS = 800;
export const CAPTURE_TRACKING_INTERVAL_MS = 800;
export const CAPTURE_ANALYSIS_INTERVAL_MS = 1500;
export const CAPTURE_TRACKING_LOSS_GRACE_MS = 2000;
const MAX_FRAME_AGE_MS = 30_000;

export function getCaptureSampleDelay(trackingAvailable: boolean, previewAvailable: boolean,
  buffering: boolean = ENABLE_CAPTURE_BUFFERING): number {
  if (!buffering || !trackingAvailable) return CAPTURE_ANALYSIS_INTERVAL_MS;
  return previewAvailable ? CAPTURE_LOOP_DELAY_MS : CAPTURE_PHOTO_FALLBACK_DELAY_MS;
}

export type CaptureFrame = { uri: string; capturedAt: number; source?: 'preview' | 'photo' };
export type AnalyzedFrame = CaptureFrame & { result: AnalysisResult };

/** Check every candidate until lock, then leave the camera free between tracking checks. */
export function shouldRefreshCaptureDetection(armed: boolean, checkedAt: number, now: number): boolean {
  return !armed || now < checkedAt || now - checkedAt >= CAPTURE_TRACKING_INTERVAL_MS;
}

/** Cool down from completion, including failures; reacquiring a test does not bypass it. */
export function shouldRefreshCaptureAnalysis(checkedAt: number | null, now: number): boolean {
  return checkedAt === null || now < checkedAt || now - checkedAt >= CAPTURE_ANALYSIS_INTERVAL_MS;
}

/** Only completed, reportable full-CV results can make the live camera ready. */
export class CaptureReadiness {
  private validChecks = 0;

  observe(result: AnalysisResult): boolean {
    this.validChecks = getAnalysisDecision(result) === 'reportable' ? this.validChecks + 1 : 0;
    return this.validChecks >= 2;
  }

  reset() { this.validChecks = 0; }
}

/** Brief detector/camera misses preserve an established session, never create one. */
export class CaptureTracking {
  private found = false;
  private missingSince: number | null = null;
  private misses = 0;

  get recovering() { return this.missingSince !== null; }

  observe(found: boolean, now: number): 'found' | 'recovering' | 'lost' {
    if (found) {
      this.found = true;
      this.missingSince = null;
      this.misses = 0;
      return 'found';
    }
    if (!this.found) return 'lost';
    this.missingSince = this.missingSince === null || now < this.missingSince ? now : this.missingSince;
    this.misses += 1;
    if (this.misses >= 3 && now - this.missingSince >= CAPTURE_TRACKING_LOSS_GRACE_MS) {
      this.found = false;
      this.missingSince = null;
      this.misses = 0;
      return 'lost';
    }
    return 'recovering';
  }
}

// Temporal stability from the existing framing gate can arm capture even when
// the detector's box score is moderate. This never relaxes result/reporting gates.
export function shouldStartCaptureBuffer(confidence: number, stableFrames: number): boolean {
  return Number.isFinite(confidence) && confidence > 0 && confidence <= 1 &&
    (confidence >= CAPTURE_DETECTION_CONFIDENCE || stableFrames >= 2);
}

/** Owns only temporary camera files, never gallery originals. Freeze transfers ownership. */
export class CaptureBuffer {
  private frames: CaptureFrame[] = [];
  private frozen = false;

  constructor(private readonly discard: (uri: string) => void,
    private readonly enabled: boolean = ENABLE_CAPTURE_BUFFERING) {}

  get size() { return this.frames.length; }

  add(frame: CaptureFrame) {
    if (!this.enabled || this.frozen) { this.discard(frame.uri); return; }
    this.expire(frame.capturedAt);
    this.frames.push(frame);
    while (this.frames.length > CAPTURE_BUFFER_SIZE) this.discard(this.frames.shift()!.uri);
  }

  private expire(now: number) {
    while (this.frames.length && now - this.frames[0].capturedAt > MAX_FRAME_AGE_MS) {
      this.discard(this.frames.shift()!.uri);
    }
  }

  clear() {
    for (const frame of this.frames) this.discard(frame.uri);
    this.frames = [];
  }

  freeze(now = Date.now()): CaptureFrame[] {
    this.frozen = true;
    this.expire(now);
    const frames = this.frames;
    this.frames = [];
    return frames;
  }
}

/** Reserve room for one full-quality shutter photo without exceeding the ring limit. */
export function appendShutterFrame(frames: CaptureFrame[], photo: CaptureFrame, discard: (uri: string) => void) {
  while (frames.length >= CAPTURE_BUFFER_SIZE) discard(frames.shift()!.uri);
  frames.push({ ...photo, source: 'photo' });
}

/** Confidence already includes the reader's quality gates. Never turn abstentions into votes. */
export function combineCaptureResults(frames: AnalyzedFrame[], totalFrames: number): AnalyzedFrame {
  if (!frames.length) throw new Error('Не удалось обработать снимки. Попробуйте ещё раз.');
  if (frames.length === 1 && totalFrames === 1) return frames[0];
  const usable = frames.filter(frame => getAnalysisDecision(frame.result) === 'reportable');
  const weight = (frame: AnalyzedFrame) => getAnalysisConfidence(frame.result) ** 2;
  const votes = { positive: 0, negative: 0 };
  for (const frame of usable) votes[deriveDetectedInterpretation(frame.result)!] += weight(frame);
  const winner = votes.positive > votes.negative ? 'positive' : 'negative';
  const winners = usable.filter(frame => deriveDetectedInterpretation(frame.result) === winner);
  const sum = votes.positive + votes.negative;
  const agreement = sum > 0 ? votes[winner] / sum : 0;
  const strongConflict = usable.some(frame => deriveDetectedInterpretation(frame.result) !== winner && getAnalysisConfidence(frame.result) >= 0.9);
  const enough = usable.length >= Math.ceil(totalFrames / 2) && winners.length >= Math.min(3, totalFrames);
  const accepted = enough && agreement >= 0.8 && !strongConflict;
  const candidates = winners.length ? winners : frames;
  const representative = (accepted ? winners.find(frame => frame.source === 'photo') : undefined) ?? [...candidates].sort((a, b) =>
    Number(getAnalysisDecision(b.result) === 'review') - Number(getAnalysisDecision(a.result) === 'review') ||
    getAnalysisConfidence(b.result) - getAnalysisConfidence(a.result))[0];
  const meanConfidence = winners.length
    ? winners.reduce((sum, frame) => sum + weight(frame) * getAnalysisConfidence(frame.result), 0) / votes[winner]
    : 0;
  const result = representative.result;
  return {
    ...representative,
    result: {
      ...result,
      status: accepted ? 'valid' : result.status === 'invalid' && !usable.length ? 'invalid' : 'review',
      observed_line_count: accepted ? result.observed_line_count : null,
      requires_user_confirmation: true,
      reason_codes: [...result.reason_codes, accepted ? 'burst_consensus' : strongConflict || agreement < 0.8 ? 'burst_disagreement' : 'burst_insufficient_evidence'],
      signal: { ...result.signal, classification: accepted ? result.signal.classification : null },
      quality: {
        ...result.quality,
        peak_pair_confidence: accepted ? Math.min(getAnalysisConfidence(result), meanConfidence, agreement) : 0,
        // Prevent the legacy locator fallback from presenting disagreement as
        // a high-confidence aggregate merely because the strip was easy to find.
        locator_confidence: accepted ? result.quality.locator_confidence ?? 0 : 0,
        burst_aggregation_version: 1,
        burst_frame_count: totalFrames,
        burst_processed_count: frames.length,
        burst_usable_count: usable.length,
        burst_weighted_agreement: agreement,
      },
    },
  };
}

/** Serial decoding/inference bounds memory. A cancelled run cleans even its in-flight file. */
export async function analyzeCaptureBurst(
  frames: CaptureFrame[],
  options: {
    analyze: (uri: string) => Promise<AnalysisResult>;
    discard: (uri: string) => Promise<void>;
    cancelled: () => boolean;
    progress?: (completed: number, total: number) => void;
  },
): Promise<AnalyzedFrame | null> {
  let retained: string | null = null;
  const analyzed: AnalyzedFrame[] = [];
  try {
    for (const [index, frame] of frames.entries()) {
      if (options.cancelled()) return null;
      try { analyzed.push({ ...frame, result: await options.analyze(frame.uri) }); }
      catch { /* A failed frame abstains; it still counts toward the quorum. */ }
      if (options.cancelled()) return null;
      options.progress?.(index + 1, frames.length);
    }
    const selected = combineCaptureResults(analyzed, frames.length);
    if (options.cancelled()) return null;
    retained = selected.uri;
    return selected;
  } finally {
    for (const frame of frames) {
      if (frame.uri !== retained) await options.discard(frame.uri).catch(() => undefined);
    }
  }
}
