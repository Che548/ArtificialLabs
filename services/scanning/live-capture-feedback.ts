export type LiveCaptureHint = {
  kind: 'test' | 'lowLight' | 'background' | 'locked';
  text: string;
  tone: 'neutral' | 'warning' | 'success';
};

export const INITIAL_CAPTURE_HINT: LiveCaptureHint = {
  kind: 'test', text: 'Наведите камеру на тест', tone: 'neutral',
};

const CHECKING_HINT: LiveCaptureHint = {
  kind: 'test', text: 'Тест найден — проверяем качество', tone: 'neutral',
};

const RECOVERING_HINT: LiveCaptureHint = {
  kind: 'test', text: 'Удерживайте камеру — проверяем положение теста', tone: 'neutral',
};

const sameHint = (a: LiveCaptureHint, b: LiveCaptureHint) =>
  a.kind === b.kind && a.text === b.text && a.tone === b.tone;

/** Owns tooltip priority. Tracking cannot erase feedback from a full CV check. */
export class LiveCaptureFeedback {
  private current = INITIAL_CAPTURE_HINT;
  private detected = false;
  private analyzed = false;
  private pendingWarning: LiveCaptureHint | null = null;

  private show(hint: LiveCaptureHint): LiveCaptureHint {
    if (!sameHint(this.current, hint)) this.current = hint;
    return this.current;
  }

  observeTracking(advice: string | null): LiveCaptureHint {
    this.detected = true;
    if (this.analyzed) return this.current;
    return this.show(advice ? { kind: 'test', text: advice, tone: 'neutral' } : CHECKING_HINT);
  }

  observeAnalysis(hint: LiveCaptureHint): LiveCaptureHint {
    this.analyzed = true;
    this.detected = true;
    if (hint.tone === 'warning' && this.current.tone === 'warning' && !sameHint(hint, this.current)) {
      // A different warning must recur in two consecutive full checks. Detector
      // updates between those checks do not participate in this decision.
      if (!this.pendingWarning || !sameHint(hint, this.pendingWarning)) {
        this.pendingWarning = hint;
        return this.current;
      }
    } else if (hint.tone === 'neutral' && this.current.tone === 'warning') {
      // One good frame is still being confirmed. Keep useful guidance until the
      // existing two-success gate supplies the ready hint.
      this.pendingWarning = null;
      return this.current;
    }
    this.pendingWarning = null;
    return this.show(hint);
  }

  trackingLost(): LiveCaptureHint {
    this.pendingWarning = null;
    if (!this.detected) return this.current;
    // Never return to the initial instruction in an acquired session, or erase
    // a concrete CV warning. A ready indication is revoked on confirmed loss.
    return this.current.tone === 'warning' ? this.current : this.show(RECOVERING_HINT);
  }

  analysisFailed(): LiveCaptureHint {
    this.pendingWarning = null;
    return this.current.tone === 'warning' ? this.current : this.show(RECOVERING_HINT);
  }
}
