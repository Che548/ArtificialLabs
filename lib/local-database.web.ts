import type {
  HealthEntityMap,
  HealthEntityName,
  HealthSnapshot,
  JournalEntry,
  LocalProfile,
  ScanResult,
} from './health-types';
import { createEmptySnapshot } from './health-types';

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
    localStorage.setItem(`${LOCAL_SETTING_PREFIX}${key}`, JSON.stringify(value));
  }
  localSettings.set(key, value);
}
export async function deleteLocalSetting(key: string) {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(`${LOCAL_SETTING_PREFIX}${key}`);
  }
  localSettings.delete(key);
}
export async function saveLocalRecord<K extends HealthEntityName>(
  entity: K,
  item: HealthEntityMap[K],
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
export async function pendingOutbox() {
  return [] as Array<{
    id: number;
    entity: HealthEntityName;
    payload: HealthEntityMap[HealthEntityName];
  }>;
}
export async function acknowledgeOutbox(_ids: number[]) {}
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
