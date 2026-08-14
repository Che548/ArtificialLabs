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
import type { ImportPreview } from './data-transfer';
import {
  acknowledgeOutbox,
  claimLocalDatabaseOwner,
  clearLocalHealthData,
  deleteLocalSetting,
  initializeLocalDatabase,
  loadLocalSetting,
  loadLocalSnapshot,
  mergeRemoteSnapshot,
  pendingOutbox,
  saveLocalProfile,
  saveLocalRecord,
  saveLocalSetting,
  saveScanResultWithJournal,
} from './local-database';
import type {
  AllergyRisk,
  AppPreferences,
  ChatAttachment,
  ChatConversation,
  ChatMessage,
  CloudSyncPreference,
  HealthDocument,
  HealthEntityMap,
  HealthEntityName,
  HealthGoal,
  HealthSnapshot,
  JournalEntry,
  LabResult,
  LocalProfile,
  MedicalCondition,
  Medication,
  MonitoringProgram,
  Reminder,
  ScanResult,
  SyncStatus,
} from './health-types';
import { createEmptySnapshot, newLocalId } from './health-types';
import { mayUseMedicalCloud } from './sync-policy';
import { clearLocalHealthFiles } from './local-files';

const backendApi = api;
const CLOUD_SYNC_SETTING = 'cloudSyncPreference.v1';
const DELETION_DEADLINE_SETTING = 'accountDeletionDeadline.v1';

function programTitleForGoal(goal: HealthGoal) {
  if (goal === 'pregnancy') return 'Сопровождение беременности';
  if (goal === 'planning') return 'Планирование беременности';
  return 'Отслеживание цикла';
}

type OnboardingInput = Omit<
  LocalProfile,
  'onboardingCompleted' | 'updatedAt'
>;
type SavedInput<T extends { localId: string; updatedAt: number }> = Omit<
  T,
  'localId' | 'updatedAt'
> & { localId?: string };
type AccountDeletion = {
  pendingDeletion: boolean;
  deletionRequestedAt?: number;
  scheduledDeletionAt?: number;
};

type HealthStoreValue = HealthSnapshot & {
  ready: boolean;
  readOnly: boolean;
  syncStatus: SyncStatus;
  cloudSyncEnabled: boolean;
  viewerEmail?: string;
  accountDeletion: AccountDeletion;
  completeOnboarding: (input: OnboardingInput) => Promise<void>;
  updateProfile: (input: Partial<Omit<LocalProfile, 'updatedAt'>>) => Promise<void>;
  addJournalEntry: (
    input: Omit<JournalEntry, 'localId' | 'updatedAt' | 'source'>,
  ) => Promise<void>;
  addLabResult: (input: Omit<LabResult, 'localId' | 'updatedAt'>) => Promise<void>;
  addScanResult: (input: Omit<ScanResult, 'localId' | 'updatedAt'>) => Promise<void>;
  saveMedicalCondition: (input: SavedInput<MedicalCondition>) => Promise<void>;
  saveMedication: (input: SavedInput<Medication>) => Promise<void>;
  saveAllergyRisk: (input: SavedInput<AllergyRisk>) => Promise<void>;
  saveDocument: (input: SavedInput<HealthDocument>) => Promise<void>;
  saveConversation: (input: SavedInput<ChatConversation>) => Promise<string>;
  saveChatMessage: (input: SavedInput<ChatMessage>) => Promise<void>;
  savePreferences: (input: Partial<Omit<AppPreferences, 'localId' | 'updatedAt'>>) => Promise<void>;
  deleteRecord: <K extends HealthEntityName>(entity: K, item: HealthEntityMap[K]) => Promise<void>;
  setProgramStatus: (program: MonitoringProgram, status: MonitoringProgram['status']) => Promise<void>;
  markReminderRead: (reminder: Reminder) => Promise<void>;
  setCloudSyncEnabled: (enabled: boolean) => Promise<void>;
  requestAccountDeletion: () => Promise<void>;
  restoreAccount: () => Promise<void>;
  clearAllLocalData: () => Promise<void>;
  importData: (preview: ImportPreview) => Promise<void>;
  syncNow: () => Promise<void>;
};

const HealthStoreContext = createContext<HealthStoreValue | null>(null);

function withoutLocalFiles(item: Record<string, unknown>) {
  const {
    localImageUri: _image,
    localDocumentUri: _document,
    localFileUri: _file,
    ...syncable
  } = item;
  if (Array.isArray(syncable.attachments)) {
    syncable.attachments = syncable.attachments.map((raw) => {
      const { localUri: _uri, ...attachment } = raw as Record<string, unknown>;
      return { ...attachment, availableLocally: false };
    });
  }
  return syncable;
}

function revisionFor(snapshot: HealthSnapshot) {
  return (Object.keys(snapshot) as Array<keyof HealthSnapshot>).reduce(
    (revision, key) => {
      const value = snapshot[key];
      if (!Array.isArray(value)) return revision;
      return value.reduce(
        (current, item) =>
          Math.max(current, (item as { updatedAt?: number }).updatedAt ?? 0),
        revision,
      );
    },
    snapshot.profile?.updatedAt ?? 0,
  );
}

export function HealthStoreProvider({
  children,
  mode = 'authenticated',
}: PropsWithChildren<{ mode?: 'authenticated' | 'demo' | 'local' }>) {
  const [snapshot, setSnapshot] = useState<HealthSnapshot>(createEmptySnapshot);
  const [ready, setReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [cloudSyncEnabled, setCloudSyncEnabledState] = useState(false);
  const saveRemoteProfile = useMutation(backendApi.profile.save);
  const syncRemoteBatch = useMutation(backendApi.health.syncBatch);
  const requestRemoteDeletion = useMutation(backendApi.account.requestDeletion);
  const restoreRemoteAccount = useMutation(backendApi.account.restore);
  const remoteEnabled = mode === 'authenticated';
  const readOnly = mode === 'demo';
  const viewer = useQuery(backendApi.profile.viewer, remoteEnabled ? {} : 'skip');
  const remoteProfile = viewer?.profile;
  const accountDeletion: AccountDeletion = viewer?.accountState?.scheduledDeletionAt
    ? {
        pendingDeletion: true,
        deletionRequestedAt: viewer.accountState.deletionRequestedAt,
        scheduledDeletionAt: viewer.accountState.scheduledDeletionAt,
      }
    : { pendingDeletion: false };
  const canUseCloud = mayUseMedicalCloud({
    authenticated: remoteEnabled,
    consentedOnDevice: cloudSyncEnabled,
    accountPendingDeletion: accountDeletion.pendingDeletion,
  });
  const remoteSnapshot = useQuery(
    backendApi.health.snapshot,
    canUseCloud && remoteProfile ? {} : 'skip',
  );
  const localRevision = revisionFor(snapshot);

  const refresh = useCallback(async () => {
    setSnapshot(await loadLocalSnapshot());
    setReady(true);
  }, []);

  const reloadDevicePreferences = useCallback(async () => {
    const preference = await loadLocalSetting<CloudSyncPreference>(
      CLOUD_SYNC_SETTING,
    );
    setCloudSyncEnabledState(preference?.enabled === true);
    const deadline = await loadLocalSetting<number>(DELETION_DEADLINE_SETTING);
    if (deadline && deadline <= Date.now()) {
      await clearLocalHealthData();
      await clearLocalHealthFiles();
      await deleteLocalSetting(DELETION_DEADLINE_SETTING);
      setCloudSyncEnabledState(false);
    }
  }, []);

  useEffect(() => {
    void initializeLocalDatabase().then(async () => {
      await reloadDevicePreferences();
      if (!remoteEnabled) await refresh();
    });
  }, [refresh, reloadDevicePreferences, remoteEnabled]);

  useEffect(() => {
    if (!viewer) return;
    void claimLocalDatabaseOwner(viewer.userId).then(async () => {
      await reloadDevicePreferences();
      await refresh();
    });
  }, [refresh, reloadDevicePreferences, viewer]);

  useEffect(() => {
    if (!canUseCloud || !remoteProfile) return;
    if ((snapshot.profile?.updatedAt ?? 0) >= remoteProfile.updatedAt) return;
    const profile: LocalProfile = {
      displayName: remoteProfile.displayName,
      goal: remoteProfile.goal,
      onboardingCompleted: remoteProfile.onboardingCompleted,
      phone: remoteProfile.phone,
      birthDate: remoteProfile.birthDate,
      heightCm: remoteProfile.heightCm,
      weightKg: remoteProfile.weightKg,
      postpartum: remoteProfile.postpartum,
      postContraception: remoteProfile.postContraception,
      pregnancyStartAt: remoteProfile.pregnancyStartAt,
      lastPeriodStartAt: remoteProfile.lastPeriodStartAt,
      cycleLengthDays: remoteProfile.cycleLengthDays,
      updatedAt: remoteProfile.updatedAt,
    };
    void saveLocalProfile(profile).then(refresh);
  }, [canUseCloud, refresh, remoteProfile, snapshot.profile?.updatedAt]);

  useEffect(() => {
    if (!remoteSnapshot || !canUseCloud) return;
    const { profile: _profile, ...records } = remoteSnapshot;
    void mergeRemoteSnapshot(records as never).then(refresh);
  }, [canUseCloud, refresh, remoteSnapshot]);

  const syncNow = useCallback(async () => {
    if (readOnly || !canUseCloud || !remoteProfile) return;
    setSyncStatus('syncing');
    try {
      for (;;) {
        const rows = await pendingOutbox();
        if (!rows.length) break;
        const batch = {
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
          preferences: [],
        } as Record<HealthEntityName, unknown[]>;
        for (const row of rows) {
          batch[row.entity].push(
            withoutLocalFiles(row.payload as unknown as Record<string, unknown>),
          );
        }
        await syncRemoteBatch(batch as never);
        await acknowledgeOutbox(rows.map((row) => row.id));
      }
      setSyncStatus('idle');
    } catch (error) {
      console.error('Health sync failed', error);
      setSyncStatus('error');
    }
  }, [canUseCloud, readOnly, remoteProfile, syncRemoteBatch]);

  useEffect(() => {
    if (canUseCloud && remoteProfile) void syncNow();
  }, [canUseCloud, localRevision, remoteProfile, syncNow]);

  const writeRecord = useCallback(
    async <K extends HealthEntityName>(entity: K, item: HealthEntityMap[K]) => {
      if (readOnly) return;
      await saveLocalRecord(entity, item);
      await refresh();
    },
    [readOnly, refresh],
  );

  const completeOnboarding = useCallback(
    async (input: OnboardingInput) => {
      if (readOnly) return;
      const now = Date.now();
      const profile: LocalProfile = {
        ...input,
        onboardingCompleted: true,
        updatedAt: now,
      };
      await saveLocalProfile(profile);
      if (canUseCloud) await saveRemoteProfile(profile);
      await saveLocalRecord('programs', {
        localId: newLocalId('program'),
        type: input.goal,
        title: programTitleForGoal(input.goal),
        status: 'active',
        startedAt: now,
        updatedAt: now,
      });
      await saveLocalRecord('reminders', {
        localId: newLocalId('reminder'),
        type: 'journal',
        title: 'Заполните дневник',
        body: 'Отметьте самочувствие, симптомы и важные показатели за сегодня.',
        dueAt: now,
        updatedAt: now,
      });
      await refresh();
    },
    [canUseCloud, readOnly, refresh, saveRemoteProfile],
  );

  const updateProfile = useCallback(
    async (input: Partial<Omit<LocalProfile, 'updatedAt'>>) => {
      if (readOnly || !snapshot.profile) return;
      const updatedAt = Date.now();
      const nextProfile = { ...snapshot.profile, ...input, updatedAt };
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
      if (canUseCloud) await saveRemoteProfile(nextProfile);
      await refresh();
    },
    [canUseCloud, readOnly, refresh, saveRemoteProfile, snapshot.profile, snapshot.programs],
  );

  const addJournalEntry = useCallback(
    async (input: Omit<JournalEntry, 'localId' | 'updatedAt' | 'source'>) => {
      await writeRecord('journalEntries', {
        ...input,
        localId: newLocalId('journal'),
        source: 'manual',
        updatedAt: Date.now(),
      });
    },
    [writeRecord],
  );

  const addLabResult = useCallback(
    async (input: Omit<LabResult, 'localId' | 'updatedAt'>) => {
      if (readOnly) return;
      const result = { ...input, localId: newLocalId('lab'), updatedAt: Date.now() };
      await saveLocalRecord('labResults', result);
      if (result.localDocumentUri) {
        await saveLocalRecord('documents', {
          localId: newLocalId('document'),
          title: result.title,
          category: 'lab',
          documentDate: result.collectedAt,
          hasLocalFile: true,
          localFileUri: result.localDocumentUri,
          updatedAt: result.updatedAt,
        });
      }
      await saveLocalRecord('journalEntries', {
        localId: newLocalId('journal'),
        occurredAt: result.collectedAt,
        kind: 'measurement',
        label: result.title,
        textValue: result.analytes.map((item) => `${item.name}: ${item.value}`).join(', '),
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
      const result = { ...input, localId: newLocalId('scan'), updatedAt: Date.now() };
      await saveScanResultWithJournal(result, {
        localId: newLocalId('journal'),
        occurredAt: result.capturedAt,
        kind: 'measurement',
        label: result.testSystemKey === 'ovulation-strip' ? 'Тест на овуляцию' : 'Тест на беременность',
        textValue: result.confirmedValue,
        source: 'scan',
        sourceLocalId: result.localId,
        updatedAt: result.updatedAt,
      });
      await refresh();
    },
    [readOnly, refresh],
  );

  const saveTyped = useCallback(
    async <K extends 'medicalConditions' | 'medications' | 'allergyRisks' | 'documents' | 'chatConversations' | 'chatMessages'>(
      entity: K,
      prefix: string,
      input: SavedInput<HealthEntityMap[K]>,
    ) => {
      const localId = input.localId ?? newLocalId(prefix);
      await writeRecord(entity, { ...input, localId, updatedAt: Date.now() } as HealthEntityMap[K]);
      return localId;
    },
    [writeRecord],
  );

  const savePreferences = useCallback(
    async (input: Partial<Omit<AppPreferences, 'localId' | 'updatedAt'>>) => {
      const current = snapshot.preferences.find((item) => !item.deletedAt);
      await writeRecord('preferences', {
        localId: 'preferences',
        notificationsEnabled: true,
        journalNotifications: true,
        resultNotifications: true,
        anonymousAnalytics: false,
        medicalRecommendations: false,
        language: 'ru',
        region: 'RU',
        ...current,
        ...input,
        updatedAt: Date.now(),
      });
    },
    [snapshot.preferences, writeRecord],
  );

  const deleteRecord = useCallback(
    async <K extends HealthEntityName>(entity: K, item: HealthEntityMap[K]) => {
      await writeRecord(entity, { ...item, deletedAt: Date.now(), updatedAt: Date.now() });
    },
    [writeRecord],
  );

  const setCloudSyncEnabled = useCallback(
    async (enabled: boolean) => {
      if (readOnly) return;
      const preference: CloudSyncPreference = {
        enabled,
        consentedAt: enabled ? Date.now() : undefined,
        updatedAt: Date.now(),
      };
      await saveLocalSetting(CLOUD_SYNC_SETTING, preference);
      if (enabled && snapshot.profile && remoteEnabled) {
        await saveRemoteProfile(snapshot.profile);
      }
      setCloudSyncEnabledState(enabled);
      setSyncStatus('idle');
    },
    [readOnly, remoteEnabled, saveRemoteProfile, snapshot.profile],
  );

  const requestAccountDeletion = useCallback(async () => {
    if (readOnly || !remoteEnabled) return;
    const state = await requestRemoteDeletion({});
    await saveLocalSetting(DELETION_DEADLINE_SETTING, state.scheduledDeletionAt);
    setCloudSyncEnabledState(false);
  }, [readOnly, remoteEnabled, requestRemoteDeletion]);

  const restoreAccount = useCallback(async () => {
    if (!remoteEnabled) return;
    await restoreRemoteAccount({});
    await deleteLocalSetting(DELETION_DEADLINE_SETTING);
    await refresh();
  }, [refresh, remoteEnabled, restoreRemoteAccount]);

  const clearAllLocalData = useCallback(async () => {
    if (readOnly) return;
    await clearLocalHealthData();
    await clearLocalHealthFiles();
    setCloudSyncEnabledState(false);
    await refresh();
  }, [readOnly, refresh]);

  const importData = useCallback(
    async (preview: ImportPreview) => {
      if (readOnly) return;
      if (
        preview.profile &&
        preview.profile.updatedAt >= (snapshot.profile?.updatedAt ?? 0)
      ) {
        await saveLocalProfile(preview.profile);
      }
      for (const [entity, records] of Object.entries(preview.records)) {
        for (const record of records ?? []) {
          await saveLocalRecord(entity as HealthEntityName, record as never);
        }
      }
      await refresh();
    },
    [readOnly, refresh, snapshot.profile?.updatedAt],
  );

  const value = useMemo<HealthStoreValue>(
    () => ({
      ...snapshot,
      ready,
      readOnly,
      syncStatus,
      cloudSyncEnabled,
      viewerEmail: viewer?.email,
      accountDeletion,
      completeOnboarding,
      updateProfile,
      addJournalEntry,
      addLabResult,
      addScanResult,
      saveMedicalCondition: (input) => saveTyped('medicalConditions', 'condition', input).then(() => undefined),
      saveMedication: (input) => saveTyped('medications', 'medication', input).then(() => undefined),
      saveAllergyRisk: (input) => saveTyped('allergyRisks', 'allergy', input).then(() => undefined),
      saveDocument: (input) => saveTyped('documents', 'document', input).then(() => undefined),
      saveConversation: (input) => saveTyped('chatConversations', 'conversation', input),
      saveChatMessage: (input) => saveTyped('chatMessages', 'message', input).then(() => undefined),
      savePreferences,
      deleteRecord,
      setProgramStatus: async (program, status) =>
        writeRecord('programs', { ...program, status, updatedAt: Date.now() }),
      markReminderRead: async (reminder) =>
        writeRecord('reminders', { ...reminder, readAt: Date.now(), updatedAt: Date.now() }),
      setCloudSyncEnabled,
      requestAccountDeletion,
      restoreAccount,
      clearAllLocalData,
      importData,
      syncNow,
    }),
    [
      snapshot,
      ready,
      readOnly,
      syncStatus,
      cloudSyncEnabled,
      viewer?.email,
      accountDeletion,
      completeOnboarding,
      updateProfile,
      addJournalEntry,
      addLabResult,
      addScanResult,
      saveTyped,
      savePreferences,
      deleteRecord,
      writeRecord,
      setCloudSyncEnabled,
      requestAccountDeletion,
      restoreAccount,
      clearAllLocalData,
      importData,
      syncNow,
    ],
  );

  return <HealthStoreContext.Provider value={value}>{children}</HealthStoreContext.Provider>;
}

export function useHealthStore() {
  const value = useContext(HealthStoreContext);
  if (!value) throw new Error('useHealthStore must be used within HealthStoreProvider');
  return value;
}
