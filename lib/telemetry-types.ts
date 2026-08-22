export type AnonymousTelemetryEvent = {
  eventId: string;
  kind: 'cv_processed' | 'calibration_fetch' | 'client_error';
  occurredAt: number;
  platform: 'ios' | 'android';
  osMajor: string;
  appVersion: string;
  algorithmVersion?: string;
  calibrationVersion?: string;
  testSystemKey?: string;
  lotNumber?: string;
  durationMs?: number;
  outcome?: 'success' | 'review' | 'invalid' | 'error';
  errorCode?: string;
  qualityFlags: string[];
};

export type PendingTelemetryEvent = AnonymousTelemetryEvent & {
  attempts: number;
};
