import type {
  ChatConversation,
  ChatMessage,
  HealthEntityMap,
  HealthEntityName,
  HealthSnapshot,
  JournalEntry,
  LocalProfile,
  ScanResult,
} from './health-types';
import { createEmptySnapshot } from './health-types';
import { createChatTombstones } from './chat-deletion';
import type { AnonymousTelemetryEvent } from './telemetry-types';

let snapshot: HealthSnapshot = {
  ...createEmptySnapshot(),
  profile: {
    displayName: 'Демо-профиль',
    goal: 'pregnancy',
    onboardingCompleted: true,
    pregnancyStartAt: Date.now() - 7 * 7 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now(),
  },
  programs: [],
  journalEntries: [],
  labResults: [],
  scanResults: [],
  reminders: [],
};
const localSettings = new Map<string, unknown>();
const LOCAL_SETTING_PREFIX = 'artificiallabs.setting.';

export async function initializeLocalDatabase() {}
export async function claimLocalDatabaseOwner(_userId: string) {
  return false;
}
export async function loadLocalSnapshot() {
  return snapshot;
}
export async function saveLocalProfile(profile: LocalProfile) {
  snapshot = { ...snapshot, profile };
}
export async function loadLocalSetting<T>(key: string) {
  if (typeof localStorage !== 'undefined') {
    const storedValue = localStorage.getItem(`${LOCAL_SETTING_PREFIX}${key}`);
    if (storedValue !== null) return JSON.parse(storedValue) as T;
  }
  return localSettings.get(key) as T | undefined;
}
export async function saveLocalSetting(key: string, value: unknown) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(
      `${LOCAL_SETTING_PREFIX}${key}`,
      JSON.stringify(value),
    );
  }
  localSettings.set(key, value);
}
export async function deleteLocalSetting(key: string) {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(`${LOCAL_SETTING_PREFIX}${key}`);
  }
  localSettings.delete(key);
}
export async function tryAcquireLocalAgentRunLease(_runId: string) {
  return true;
}
export async function releaseLocalAgentRunLease(_runId: string) {}
export async function saveLocalRecord<K extends HealthEntityName>(
  entity: K,
  item: HealthEntityMap[K],
  _enqueue = true,
) {
  snapshot = {
    ...snapshot,
    [entity]: [
      item,
      ...snapshot[entity].filter((row) => row.localId !== item.localId),
    ],
  } as HealthSnapshot;
}
export async function saveScanResultWithJournal(
  result: ScanResult,
  journalEntry: JournalEntry,
) {
  snapshot = {
    ...snapshot,
    scanResults: [
      result,
      ...snapshot.scanResults.filter((row) => row.localId !== result.localId),
    ],
    journalEntries: [
      journalEntry,
      ...snapshot.journalEntries.filter(
        (row) => row.localId !== journalEntry.localId,
      ),
    ],
  };
}
export async function saveLabResultBundle({
  document,
  event,
  journalEntry,
  plan,
  result,
}: {
  document?: HealthEntityMap['documents'];
  event?: HealthEntityMap['recommendationEvents'];
  journalEntry?: HealthEntityMap['journalEntries'];
  plan?: HealthEntityMap['carePlanItems'];
  result: HealthEntityMap['labResults'];
}) {
  await saveLocalRecord('labResults', result);
  if (document) await saveLocalRecord('documents', document);
  if (plan) await saveLocalRecord('carePlanItems', plan);
  if (event) await saveLocalRecord('recommendationEvents', event);
  if (journalEntry) await saveLocalRecord('journalEntries', journalEntry);
}
export async function saveAgentPlanChanges({
  events = [],
  items = [],
  reminders = [],
  triggers = [],
}: {
  events?: HealthEntityMap['recommendationEvents'][];
  items?: HealthEntityMap['carePlanItems'][];
  reminders?: HealthEntityMap['reminders'][];
  triggers?: HealthEntityMap['agentTriggers'][];
}) {
  for (const item of items) await saveLocalRecord('carePlanItems', item);
  for (const event of events)
    await saveLocalRecord('recommendationEvents', event);
  for (const trigger of triggers)
    await saveLocalRecord('agentTriggers', trigger);
  for (const reminder of reminders)
    await saveLocalRecord('reminders', reminder);
}
export async function tombstoneLocalDocumentBundle(
  document: HealthEntityMap['documents'],
  labResults: HealthEntityMap['labResults'][],
  _enqueue = true,
  removeLocalFile?: () => Promise<void>,
) {
  const now = Date.now();
  await saveLocalRecord('documents', {
    ...document,
    deletedAt: now,
    updatedAt: now,
  });
  for (const result of labResults.filter(
    (item) =>
      !item.deletedAt &&
      (item.sourceDocumentLocalId === document.localId ||
        document.linkedLabResultLocalId === item.localId),
  ))
    await saveLocalRecord('labResults', {
      ...result,
      hasLocalSourceDocument: false,
      sourceDocumentLocalId: undefined,
      localDocumentUri: undefined,
      updatedAt: now,
    });
  if (removeLocalFile) await removeLocalFile();
}
export async function tombstoneLocalChatConversation(
  conversation: ChatConversation,
  messages: ChatMessage[],
  _enqueue: boolean,
) {
  const tombstones = createChatTombstones(conversation, messages);
  const messageTombstones = new Map(
    tombstones.messages.map((message) => [message.localId, message]),
  );
  snapshot = {
    ...snapshot,
    chatConversations: snapshot.chatConversations.map((item) =>
      item.localId === conversation.localId ? tombstones.conversation : item,
    ),
    chatMessages: snapshot.chatMessages.map(
      (item) => messageTombstones.get(item.localId) ?? item,
    ),
  };
}
export async function enqueueLocalChatSnapshot(
  _conversations: ChatConversation[],
  _messages: ChatMessage[],
) {}
export async function clearPendingChatOutbox() {}
export async function clearLocalAgentData() {
  snapshot = {
    ...snapshot,
    carePlanItems: [],
    agentTriggers: [],
    recommendationEvents: [],
    reminders: snapshot.reminders.filter(
      (item) => !item.localId.startsWith('agent-prep_'),
    ),
  };
  await deleteLocalSetting('agentPlanNotification.v1');
  await deleteLocalSetting('agentAutomationLease.v1');
  await deleteLocalSetting('agentBackgroundAuthorization.v1');
}
export async function pendingOutbox() {
  return [] as Array<{
    id: number;
    entity: HealthEntityName;
    payload: HealthEntityMap[HealthEntityName];
  }>;
}
export async function acknowledgeOutbox(_ids: number[]) {}
export async function searchLocalAgentIndex({
  entities,
  limit = 12,
  query,
}: {
  entities: HealthEntityName[];
  limit?: number;
  query: string;
}) {
  const needle = query.trim().toLocaleLowerCase('ru-RU');
  if (!needle) return [];
  const hits: Array<{
    entity: HealthEntityName;
    localId: string;
    occurredAt: number;
  }> = [];
  for (const entity of entities) {
    for (const item of snapshot[entity]) {
      if (item.deletedAt) continue;
      const text = JSON.stringify(item).toLocaleLowerCase('ru-RU');
      if (!text.includes(needle)) continue;
      hits.push({
        entity,
        localId: item.localId,
        occurredAt:
          'occurredAt' in item
            ? item.occurredAt
            : 'collectedAt' in item
              ? item.collectedAt
              : 'documentDate' in item
                ? item.documentDate
                : 'sentAt' in item
                  ? item.sentAt
                  : 'dueAt' in item && item.dueAt
                    ? item.dueAt
                    : item.updatedAt,
      });
    }
  }
  return hits
    .sort((left, right) => right.occurredAt - left.occurredAt)
    .slice(0, Math.max(1, Math.min(limit, 24)));
}
export async function mergeRemoteSnapshot(
  _remote: Omit<HealthSnapshot, 'profile'>,
) {}
export async function clearLocalHealthData() {
  snapshot = createEmptySnapshot();
  localSettings.clear();
  if (typeof localStorage !== 'undefined') {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(LOCAL_SETTING_PREFIX)) localStorage.removeItem(key);
    }
  }
}
export async function enqueueTelemetryEvent(_event: AnonymousTelemetryEvent) {}
export async function loadPendingTelemetryEvents(_limit = 50) {
  return [];
}
export async function acknowledgeTelemetryEvents(_eventIds: string[]) {}
export async function markTelemetryAttempt(_eventIds: string[]) {}
export async function clearPendingTelemetryEvents() {}
export async function loadLocalStorageDiagnostics() {
  return {
    databaseBytes: 0,
    walBytes: 0,
    shmBytes: 0,
    pageCount: 0,
    freelistCount: 0,
    recordCounts: {},
    outboxCount: 0,
    nextBatchCount: 0,
    remainingBatches: 0,
    uploadEstimateBytes: 0,
    telemetryCount: 0,
    telemetryBytes: 0,
    telemetryMaxAttempts: 0,
  };
}
export async function quickCheckLocalDatabase() {
  return 'unavailable';
}
