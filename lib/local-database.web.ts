import type {
  HealthEntityMap,
  HealthEntityName,
  HealthSnapshot,
  JournalEntry,
  LocalProfile,
  ScanResult,
} from './health-types';
import { emptySnapshot } from './health-types';

let snapshot: HealthSnapshot = {
  ...emptySnapshot,
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

export async function initializeLocalDatabase() {}
export async function claimLocalDatabaseOwner(_userId: string) {}
export async function loadLocalSnapshot() {
  return snapshot;
}
export async function saveLocalProfile(profile: LocalProfile) {
  snapshot = { ...snapshot, profile };
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
