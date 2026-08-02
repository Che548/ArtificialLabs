export type HealthGoal = 'planning' | 'pregnancy';
export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

export type LocalProfile = {
  displayName: string;
  goal: HealthGoal;
  onboardingCompleted: boolean;
  pregnancyStartAt?: number;
  lastPeriodStartAt?: number;
  cycleLengthDays?: number;
  consentToCloudSyncAt?: number;
  updatedAt: number;
};

export type MonitoringProgram = {
  localId: string;
  type: HealthGoal;
  title: string;
  status: 'active' | 'paused' | 'completed';
  startedAt: number;
  updatedAt: number;
  deletedAt?: number;
};

export type JournalKind =
  | 'cycle'
  | 'mood'
  | 'energy'
  | 'symptom'
  | 'nutrition'
  | 'activity'
  | 'measurement'
  | 'note';

export type JournalEntry = {
  localId: string;
  occurredAt: number;
  kind: JournalKind;
  label: string;
  textValue?: string;
  numericValue?: number;
  unit?: string;
  source: 'manual' | 'scan' | 'lab';
  sourceLocalId?: string;
  updatedAt: number;
  deletedAt?: number;
};

export type LabResult = {
  localId: string;
  catalogKey: string;
  title: string;
  collectedAt: number;
  status: 'normal' | 'attention' | 'unreviewed';
  analytes: Array<{
    name: string;
    value: string;
    unit?: string;
    reference?: string;
  }>;
  hasLocalSourceDocument: boolean;
  localDocumentUri?: string;
  updatedAt: number;
  deletedAt?: number;
};

export type ScanResult = {
  localId: string;
  testSystemKey: string;
  capturedAt: number;
  confirmedValue: 'positive' | 'negative' | 'invalid';
  confidence: 'manual';
  qualityFlags: string[];
  calibrationVersion?: string;
  algorithmVersion: 'manual-v1';
  hasLocalImage: boolean;
  localImageUri?: string;
  updatedAt: number;
  deletedAt?: number;
};

export type Reminder = {
  localId: string;
  type: 'journal' | 'checkup' | 'result' | 'system';
  title: string;
  body: string;
  dueAt: number;
  readAt?: number;
  updatedAt: number;
  deletedAt?: number;
};

export type HealthEntityMap = {
  programs: MonitoringProgram;
  journalEntries: JournalEntry;
  labResults: LabResult;
  scanResults: ScanResult;
  reminders: Reminder;
};

export type HealthEntityName = keyof HealthEntityMap;

export type HealthSnapshot = {
  profile: LocalProfile | null;
  programs: MonitoringProgram[];
  journalEntries: JournalEntry[];
  labResults: LabResult[];
  scanResults: ScanResult[];
  reminders: Reminder[];
};

export const emptySnapshot: HealthSnapshot = {
  profile: null,
  programs: [],
  journalEntries: [],
  labResults: [],
  scanResults: [],
  reminders: [],
};

export function newLocalId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
