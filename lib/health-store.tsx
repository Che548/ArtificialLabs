import { useMutation, useQuery } from 'convex/react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { PropsWithChildren } from 'react';

import { api } from '../convex/_generated/api';
import {
  acknowledgeOutbox,
  claimLocalDatabaseOwner,
  initializeLocalDatabase,
  loadLocalSnapshot,
  mergeRemoteSnapshot,
  pendingOutbox,
  saveLocalProfile,
  saveLocalRecord,
  saveScanResultWithJournal,
} from './local-database';
import type {
  HealthGoal,
  HealthSnapshot,
  JournalEntry,
  LabResult,
  LocalProfile,
  MonitoringProgram,
  Reminder,
  ScanResult,
  SyncStatus,
} from './health-types';
import { emptySnapshot, newLocalId } from './health-types';

const backendApi = api;

function programTitleForGoal(goal: HealthGoal) {
  if (goal === 'pregnancy') return 'Сопровождение беременности';
  if (goal === 'planning') return 'Планирование беременности';
  return 'Отслеживание цикла';
}

type OnboardingInput = {
  displayName: string;
  goal: HealthGoal;
  pregnancyStartAt?: number;
  lastPeriodStartAt?: number;
  cycleLengthDays?: number;
};

type HealthStoreValue = HealthSnapshot & {
  ready: boolean;
  readOnly: boolean;
  syncStatus: SyncStatus;
  completeOnboarding: (input: OnboardingInput) => Promise<void>;
  updateProfile: (
    input: Partial<
      Pick<
        LocalProfile,
        | 'displayName'
        | 'goal'
        | 'pregnancyStartAt'
        | 'lastPeriodStartAt'
        | 'cycleLengthDays'
      >
    >,
  ) => Promise<void>;
  addJournalEntry: (
    input: Omit<JournalEntry, 'localId' | 'updatedAt' | 'source'>,
  ) => Promise<void>;
  addLabResult: (
    input: Omit<LabResult, 'localId' | 'updatedAt'>,
  ) => Promise<void>;
  addScanResult: (
    input: Omit<ScanResult, 'localId' | 'updatedAt'>,
  ) => Promise<void>;
  setProgramStatus: (
    program: MonitoringProgram,
    status: MonitoringProgram['status'],
  ) => Promise<void>;
  markReminderRead: (reminder: Reminder) => Promise<void>;
  syncNow: () => Promise<void>;
};

const HealthStoreContext = createContext<HealthStoreValue | null>(null);

function withoutLocalFiles<T extends Record<string, unknown>>(item: T) {
  const {
    localImageUri: _image,
    localDocumentUri: _document,
    ...syncable
  } = item;
  return syncable;
}

export function HealthStoreProvider({
  children,
  mode = 'authenticated',
}: PropsWithChildren<{ mode?: 'authenticated' | 'demo' | 'local' }>) {
  const [snapshot, setSnapshot] = useState<HealthSnapshot>(emptySnapshot);
  const [ready, setReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const saveRemoteProfile = useMutation(backendApi.profile.save);
  const syncRemoteBatch = useMutation(backendApi.health.syncBatch);
  const remoteEnabled = mode === 'authenticated';
  const viewer = useQuery(
    backendApi.profile.viewer,
    remoteEnabled ? {} : 'skip',
  );
  const remoteProfile = viewer?.profile;
  const remoteSnapshot = useQuery(
    backendApi.health.snapshot,
    remoteEnabled && remoteProfile ? {} : 'skip',
  );
  const readOnly = mode === 'demo';
  const localRevision = Math.max(
    0,
    ...snapshot.programs.map((item) => item.updatedAt),
    ...snapshot.journalEntries.map((item) => item.updatedAt),
    ...snapshot.labResults.map((item) => item.updatedAt),
    ...snapshot.scanResults.map((item) => item.updatedAt),
    ...snapshot.reminders.map((item) => item.updatedAt),
  );

  const refresh = useCallback(async () => {
    setSnapshot(await loadLocalSnapshot());
    setReady(true);
  }, []);

  useEffect(() => {
    void initializeLocalDatabase().then(() => {
      if (!remoteEnabled) void refresh();
    });
  }, [refresh, remoteEnabled]);

  useEffect(() => {
    if (!viewer) return;
    void claimLocalDatabaseOwner(viewer.userId).then(refresh);
  }, [refresh, viewer]);

  useEffect(() => {
    if (!remoteProfile) return;
    const profile: LocalProfile = {
      displayName: remoteProfile.displayName,
      goal: remoteProfile.goal,
      onboardingCompleted: remoteProfile.onboardingCompleted,
      pregnancyStartAt: remoteProfile.pregnancyStartAt,
      lastPeriodStartAt: remoteProfile.lastPeriodStartAt,
      cycleLengthDays: remoteProfile.cycleLengthDays,
      consentToCloudSyncAt: remoteProfile.consentToCloudSyncAt,
      updatedAt: remoteProfile.updatedAt,
    };
    void saveLocalProfile(profile).then(refresh);
  }, [refresh, remoteProfile]);

  useEffect(() => {
    if (!remoteSnapshot) return;
    void mergeRemoteSnapshot({
      programs: remoteSnapshot.programs,
      journalEntries: remoteSnapshot.journalEntries,
      labResults: remoteSnapshot.labResults,
      scanResults: remoteSnapshot.scanResults,
      reminders: remoteSnapshot.reminders,
    }).then(refresh);
  }, [refresh, remoteSnapshot]);

  const syncNow = useCallback(async () => {
    if (readOnly || !remoteEnabled || !remoteProfile) return;
    setSyncStatus('syncing');
    try {
      const rows = await pendingOutbox();
      if (!rows.length) {
        setSyncStatus('idle');
        return;
      }
      const batch = {
        programs: [] as MonitoringProgram[],
        journalEntries: [] as JournalEntry[],
        labResults: [] as Array<Omit<LabResult, 'localDocumentUri'>>,
        scanResults: [] as Array<Omit<ScanResult, 'localImageUri'>>,
        reminders: [] as Reminder[],
      };
      for (const row of rows) {
        (batch[row.entity] as unknown[]).push(
          withoutLocalFiles(row.payload as unknown as Record<string, unknown>),
        );
      }
      await syncRemoteBatch(batch);
      await acknowledgeOutbox(rows.map((row: { id: number }) => row.id));
      setSyncStatus('idle');
    } catch (error) {
      console.error('Health sync failed', error);
      setSyncStatus('error');
    }
  }, [readOnly, remoteEnabled, remoteProfile, syncRemoteBatch]);

  useEffect(() => {
    if (remoteProfile) void syncNow();
  }, [localRevision, remoteProfile, syncNow]);

  const completeOnboarding = useCallback(
    async (input: OnboardingInput) => {
      if (readOnly) return;
      const now = Date.now();
      const profile: LocalProfile = {
        ...input,
        onboardingCompleted: true,
        consentToCloudSyncAt: now,
        updatedAt: now,
      };
      await saveLocalProfile(profile);
      if (remoteEnabled) await saveRemoteProfile(profile);
      const program: MonitoringProgram = {
        localId: newLocalId('program'),
        type: input.goal,
        title: programTitleForGoal(input.goal),
        status: 'active',
        startedAt: now,
        updatedAt: now,
      };
      const reminder: Reminder = {
        localId: newLocalId('reminder'),
        type: 'journal',
        title: 'Заполните дневник',
        body: 'Отметьте самочувствие, симптомы и важные показатели за сегодня.',
        dueAt: now,
        updatedAt: now,
      };
      await saveLocalRecord('programs', program);
      await saveLocalRecord('reminders', reminder);
      await refresh();
    },
    [readOnly, refresh, remoteEnabled, saveRemoteProfile],
  );

  const addJournalEntry = useCallback(
    async (input: Omit<JournalEntry, 'localId' | 'updatedAt' | 'source'>) => {
      if (readOnly) return;
      const entry: JournalEntry = {
        ...input,
        localId: newLocalId('journal'),
        source: 'manual',
        updatedAt: Date.now(),
      };
      await saveLocalRecord('journalEntries', entry);
      await refresh();
    },
    [readOnly, refresh],
  );

  const updateProfile = useCallback(
    async (
      input: Partial<
        Pick<
          LocalProfile,
          | 'displayName'
          | 'goal'
          | 'pregnancyStartAt'
          | 'lastPeriodStartAt'
          | 'cycleLengthDays'
        >
      >,
    ) => {
      if (readOnly || !snapshot.profile) return;
      const updatedAt = Date.now();
      const nextProfile: LocalProfile = {
        ...snapshot.profile,
        ...input,
        updatedAt,
      };
      await saveLocalProfile(nextProfile);
      if (input.goal && input.goal !== snapshot.profile.goal) {
        const activeProgram = snapshot.programs.find(
          (program) => !program.deletedAt && program.status === 'active',
        );
        if (activeProgram) {
          await saveLocalRecord('programs', {
            ...activeProgram,
            type: input.goal,
            title: programTitleForGoal(input.goal),
            updatedAt,
          });
        }
      }
      if (remoteEnabled) await saveRemoteProfile(nextProfile);
      await refresh();
    },
    [
      readOnly,
      refresh,
      remoteEnabled,
      saveRemoteProfile,
      snapshot.profile,
      snapshot.programs,
    ],
  );

  const addLabResult = useCallback(
    async (input: Omit<LabResult, 'localId' | 'updatedAt'>) => {
      if (readOnly) return;
      const result: LabResult = {
        ...input,
        localId: newLocalId('lab'),
        updatedAt: Date.now(),
      };
      await saveLocalRecord('labResults', result);
      await saveLocalRecord('journalEntries', {
        localId: newLocalId('journal'),
        occurredAt: result.collectedAt,
        kind: 'measurement',
        label: result.title,
        textValue: result.analytes
          .map((item) => `${item.name}: ${item.value}`)
          .join(', '),
        source: 'lab',
        sourceLocalId: result.localId,
        updatedAt: result.updatedAt,
      });
      await refresh();
    },
    [readOnly, refresh],
  );

  const addScanResult = useCallback(
    async (input: Omit<ScanResult, 'localId' | 'updatedAt'>) => {
      if (readOnly) return;
      const result: ScanResult = {
        ...input,
        localId: newLocalId('scan'),
        updatedAt: Date.now(),
      };
      const journalEntry: JournalEntry = {
        localId: newLocalId('journal'),
        occurredAt: result.capturedAt,
        kind: 'measurement',
        label:
          result.testSystemKey === 'ovulation-strip'
            ? 'Тест на овуляцию'
            : 'Тест на беременность',
        textValue: result.confirmedValue,
        source: 'scan',
        sourceLocalId: result.localId,
        updatedAt: result.updatedAt,
      };
      await saveScanResultWithJournal(result, journalEntry);
      await refresh().catch((cause: unknown) => {
        console.error('Refreshing health data after scan save failed', cause);
      });
    },
    [readOnly, refresh],
  );

  const setProgramStatus = useCallback(
    async (program: MonitoringProgram, status: MonitoringProgram['status']) => {
      if (readOnly) return;
      await saveLocalRecord('programs', {
        ...program,
        status,
        updatedAt: Date.now(),
      });
      await refresh();
    },
    [readOnly, refresh],
  );

  const markReminderRead = useCallback(
    async (reminder: Reminder) => {
      if (readOnly) return;
      await saveLocalRecord('reminders', {
        ...reminder,
        readAt: Date.now(),
        updatedAt: Date.now(),
      });
      await refresh();
    },
    [readOnly, refresh],
  );

  const value = useMemo<HealthStoreValue>(
    () => ({
      ...snapshot,
      ready,
      readOnly,
      syncStatus,
      completeOnboarding,
      updateProfile,
      addJournalEntry,
      addLabResult,
      addScanResult,
      setProgramStatus,
      markReminderRead,
      syncNow,
    }),
    [
      snapshot,
      ready,
      readOnly,
      syncStatus,
      completeOnboarding,
      updateProfile,
      addJournalEntry,
      addLabResult,
      addScanResult,
      setProgramStatus,
      markReminderRead,
      syncNow,
    ],
  );

  return (
    <HealthStoreContext.Provider value={value}>
      {children}
    </HealthStoreContext.Provider>
  );
}

export function useHealthStore() {
  const value = useContext(HealthStoreContext);
  if (!value)
    throw new Error('useHealthStore must be used within HealthStoreProvider');
  return value;
}
