export type HealthGoal = 'cycle' | 'planning' | 'pregnancy';
export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

export type LocalProfile = {
  displayName: string;
  goal: HealthGoal;
  onboardingCompleted: boolean;
  phone?: string;
  birthDate?: number;
  heightCm?: number;
  weightKg?: number;
  postpartum?: boolean;
  postContraception?: boolean;
  pregnancyStartAt?: number;
  lastPeriodStartAt?: number;
  cycleLengthDays?: number;
  timezoneOffsetMinutes?: number;
  updatedAt: number;
};

export type CloudSyncPreference = {
  enabled: boolean;
  consentedAt?: number;
  revocationPending?: boolean;
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
  sourceDocumentLocalId?: string;
  localDocumentUri?: string;
  updatedAt: number;
  deletedAt?: number;
};

export type ScanResult = {
  localId: string;
  testSystemKey: string;
  capturedAt: number;
  confirmedValue: 'positive' | 'negative' | 'invalid';
  resultSource: 'manual' | 'stripcv';
  confidence?: number;
  qualityFlags: string[];
  calibrationVersion?: string;
  algorithmVersion: string;
  analysisStatus?: 'valid' | 'review' | 'invalid';
  signalRatio?: number;
  confirmedByUser: boolean;
  hasLocalImage: boolean;
  localImageUri?: string;
  updatedAt: number;
  deletedAt?: number;
};

export type MedicalCondition = {
  localId: string;
  title: string;
  status: 'active' | 'resolved';
  diagnosedAt?: number;
  notes?: string;
  updatedAt: number;
  deletedAt?: number;
};

export type Medication = {
  localId: string;
  name: string;
  dosage?: string;
  frequency?: string;
  startedAt?: number;
  endedAt?: number;
  active: boolean;
  notes?: string;
  updatedAt: number;
  deletedAt?: number;
};

export type AllergyRisk = {
  localId: string;
  allergen: string;
  reaction?: string;
  severity: 'mild' | 'moderate' | 'severe' | 'unknown';
  notes?: string;
  updatedAt: number;
  deletedAt?: number;
};

export type HealthDocument = {
  localId: string;
  title: string;
  category: 'lab' | 'scan' | 'medical' | 'other';
  documentDate: number;
  hasLocalFile: boolean;
  localFileUri?: string;
  mimeType?: string;
  size?: number;
  linkedLabResultLocalId?: string;
  linkedCarePlanLocalId?: string;
  contentIndexStatus?: 'metadata-only' | 'not-supported';
  updatedAt: number;
  deletedAt?: number;
};

export type ChatConversation = {
  localId: string;
  title: string;
  createdAt: number;
  lastMessageAt: number;
  mode?: 'chat' | 'assistant';
  updatedAt: number;
  deletedAt?: number;
};

export type AgentSourceRef = {
  source: 'journal' | 'test' | 'document' | 'chat' | 'care-plan';
  localId: string;
  label: string;
  occurredAt?: number;
  ageDays?: number;
  stale?: boolean;
  unverified?: boolean;
};

export type ChatAttachment = {
  localId: string;
  kind: 'image' | 'document';
  name: string;
  mimeType?: string;
  size?: number;
  localUri?: string;
  availableLocally: boolean;
};

export type ChatMessage = {
  localId: string;
  conversationLocalId: string;
  role: 'user' | 'assistant';
  source: 'user' | 'demo' | 'model';
  text: string;
  sentAt: number;
  generation?: {
    provider: string;
    model: string;
    responseId?: string;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    durationMs: number;
    truncated: boolean;
  };
  attachments: ChatAttachment[];
  sourceRefs?: AgentSourceRef[];
  updatedAt: number;
  deletedAt?: number;
};

export type CarePlanStatus =
  'current' | 'upcoming' | 'completed' | 'declined' | 'superseded';

export type CarePlanRiskTier = 'low' | 'clinician' | 'high';

export type CarePlanScheduleBasis =
  'clinician' | 'user' | 'confirmed_data' | 'model_inference';

export type CarePlanItem = {
  localId: string;
  catalogKey: string;
  title: string;
  category: string;
  description: string;
  status: CarePlanStatus;
  riskTier: CarePlanRiskTier;
  dueAt?: number;
  dueWindowStart?: number;
  dueWindowEnd?: number;
  performedAt?: number;
  validUntil?: number;
  nextDueAt?: number;
  scheduleBasis: CarePlanScheduleBasis;
  confidence: number;
  provisional: boolean;
  requiresClinician: boolean;
  safetyHoldAt?: number;
  safetyHoldReason?: string;
  declinedAt?: number;
  supersededAt?: number;
  lastModelReplacementAt?: number;
  evidenceRefs: AgentSourceRef[];
  rationale: string;
  policyVersion: string;
  catalogVersion: string;
  model?: string;
  illustrationKey?: string;
  updatedAt: number;
  deletedAt?: number;
};

export type AgentRuleField =
  | 'profile.goal'
  | 'profile.ageYears'
  | 'profile.postpartum'
  | 'profile.pregnancy'
  | 'preferences.medicalRecommendations'
  | 'plan.status'
  | 'plan.safetyHold'
  | 'daysSince.healthEvidence'
  | 'daysSince.labResult'
  | 'daysSince.planUpdate';

export type AgentRuleCondition = {
  field: AgentRuleField;
  operator:
    'eq' | 'neq' | 'in' | 'gt' | 'gte' | 'lt' | 'lte' | 'exists' | 'daysSince';
  value?: string | number | boolean | Array<string | number>;
  negate?: boolean;
};

export type AgentTrigger = {
  localId: string;
  templateKey: 'monthly-plan-review' | 'data-change-review' | 'due-window';
  templateVersion: string;
  status: 'active' | 'suspended' | 'completed' | 'expired';
  combine: 'all' | 'any';
  disengagementCombine?: 'all' | 'any';
  conditions: AgentRuleCondition[];
  disengagementConditions: AgentRuleCondition[];
  targetCarePlanLocalId?: string;
  nextEvaluationAt: number;
  cooldownUntil?: number;
  expiresAt: number;
  maxRuns: number;
  runCount: number;
  lastRunAt?: number;
  evidenceRefs: AgentSourceRef[];
  policyVersion: string;
  updatedAt: number;
  deletedAt?: number;
};

export type RecommendationEvent = {
  localId: string;
  carePlanLocalId?: string;
  triggerLocalId?: string;
  type:
    | 'created'
    | 'promoted'
    | 'completed'
    | 'declined'
    | 'safety_hold'
    | 'replaced'
    | 'reviewed';
  reasonCode: string;
  beforeStatus?: CarePlanStatus;
  afterStatus?: CarePlanStatus;
  evidenceRefs: AgentSourceRef[];
  policyVersion: string;
  model?: string;
  occurredAt: number;
  updatedAt: number;
  deletedAt?: number;
};

export type AppPreferences = {
  localId: 'preferences';
  notificationsEnabled: boolean;
  journalNotifications: boolean;
  resultNotifications: boolean;
  notificationTone: 'formal' | 'cute';
  anonymousAnalytics: boolean;
  medicalRecommendations: boolean;
  agentNotifications?: boolean;
  agentLastSuccessfulRunAt?: number;
  language: 'ru';
  region: string;
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
  medicalConditions: MedicalCondition;
  medications: Medication;
  allergyRisks: AllergyRisk;
  documents: HealthDocument;
  chatConversations: ChatConversation;
  chatMessages: ChatMessage;
  carePlanItems: CarePlanItem;
  agentTriggers: AgentTrigger;
  recommendationEvents: RecommendationEvent;
  preferences: AppPreferences;
};

export type HealthEntityName = keyof HealthEntityMap;

export type HealthSnapshot = {
  profile: LocalProfile | null;
  programs: MonitoringProgram[];
  journalEntries: JournalEntry[];
  labResults: LabResult[];
  scanResults: ScanResult[];
  reminders: Reminder[];
  medicalConditions: MedicalCondition[];
  medications: Medication[];
  allergyRisks: AllergyRisk[];
  documents: HealthDocument[];
  chatConversations: ChatConversation[];
  chatMessages: ChatMessage[];
  carePlanItems: CarePlanItem[];
  agentTriggers: AgentTrigger[];
  recommendationEvents: RecommendationEvent[];
  preferences: AppPreferences[];
};

export function createEmptySnapshot(): HealthSnapshot {
  return {
    profile: null,
    programs: [],
    journalEntries: [],
    labResults: [],
    scanResults: [],
    reminders: [],
    medicalConditions: [],
    medications: [],
    allergyRisks: [],
    documents: [],
    chatConversations: [],
    chatMessages: [],
    carePlanItems: [],
    agentTriggers: [],
    recommendationEvents: [],
    preferences: [],
  };
}

export const emptySnapshot = createEmptySnapshot();

export function newLocalId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
