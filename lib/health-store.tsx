import { useAuthToken } from '@convex-dev/auth/react';
import { useMutation, useQuery } from 'convex/react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PropsWithChildren } from 'react';

import { api } from '../convex/_generated/api';
import { userIdFromAuthToken } from './auth-session';
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
import {
  createSingleFlightRunner,
  synchronizeMedicalCloud,
} from './cloud-sync';
import { useConnectivity } from './connectivity';
import { classifyServiceIssue, retryDelayMs } from './service-errors';
import type { ServiceIssue } from './service-errors';

const backendApi = api;
const CLOUD_SYNC_SETTING = 'cloudSyncPreference.v1';
const DELETION_DEADLINE_SETTING = 'accountDeletionDeadline.v1';

function programTitleForGoal(goal: HealthGoal) {
  if (goal === 'pregnancy') return 'Сопровождение беременности';
  if (goal === 'planning') return 'Планирование беременности';
  return 'Отслеживание цикла';
}

type OnboardingInput = Omit<LocalProfile, 'onboardingCompleted' | 'updatedAt'>;
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
  serviceIssue?: ServiceIssue;
  cloudSyncEnabled: boolean;
  viewerEmail?: string;
  accountDeletion: AccountDeletion;
  completeOnboarding: (input: OnboardingInput) => Promise<void>;
  updateProfile: (
    input: Partial<Omit<LocalProfile, 'updatedAt'>>,
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
  saveMedicalCondition: (input: SavedInput<MedicalCondition>) => Promise<void>;
  saveMedication: (input: SavedInput<Medication>) => Promise<void>;
  saveAllergyRisk: (input: SavedInput<AllergyRisk>) => Promise<void>;
  saveDocument: (input: SavedInput<HealthDocument>) => Promise<void>;
  saveConversation: (input: SavedInput<ChatConversation>) => Promise<string>;
  saveChatMessage: (input: SavedInput<ChatMessage>) => Promise<void>;
  savePreferences: (
    input: Partial<Omit<AppPreferences, 'localId' | 'updatedAt'>>,
  ) => Promise<void>;
  deleteRecord: <K extends HealthEntityName>(
    entity: K,
    item: HealthEntityMap[K],
  ) => Promise<void>;
  setProgramStatus: (
    program: MonitoringProgram,
    status: MonitoringProgram['status'],
  ) => Promise<void>;
  markReminderRead: (reminder: Reminder) => Promise<void>;
  setCloudSyncEnabled: (enabled: boolean) => Promise<void>;
  requestAccountDeletion: () => Promise<boolean>;
  restoreAccount: () => Promise<boolean>;
  clearAllLocalData: () => Promise<void>;
  importData: (preview: ImportPreview) => Promise<void>;
  syncNow: () => Promise<boolean>;
};

const HealthStoreContext = createContext<HealthStoreValue | null>(null);

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
  const [serviceIssue, setServiceIssue] = useState<ServiceIssue>();
  const [cloudSyncEnabled, setCloudSyncEnabledState] = useState(false);
  const syncSingleFlight = useRef(createSingleFlightRunner());
  const retryAttempt = useRef(0);
  const wasOffline = useRef(false);
  const { isOffline } = useConnectivity();
  const authToken = useAuthToken();
  const cachedUserId = useMemo(
    () => userIdFromAuthToken(authToken),
    [authToken],
  );
  const offlineRef = useRef(isOffline);
  const saveRemoteProfile = useMutation(backendApi.profile.save);
  const syncRemoteBatch = useMutation(backendApi.health.syncBatch);
  const requestRemoteDeletion = useMutation(backendApi.account.requestDeletion);
  const restoreRemoteAccount = useMutation(backendApi.account.restore);
  const remoteEnabled = mode === 'authenticated';
  const readOnly = mode === 'demo';
  const viewer = useQuery(
    backendApi.profile.viewer,
    remoteEnabled ? {} : 'skip',
  );
  const remoteProfile = viewer?.profile;
  const accountDeletion: AccountDeletion = viewer?.accountState
    ?.scheduledDeletionAt
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

  useEffect(() => {
    offlineRef.current = isOffline;
  }, [isOffline]);

  const refresh = useCallback(async () => {
    setSnapshot(await loadLocalSnapshot());
    setReady(true);
  }, []);

  const reloadDevicePreferences = useCallback(async () => {
    const preference =
      await loadLocalSetting<CloudSyncPreference>(CLOUD_SYNC_SETTING);
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
      // The cached, SecureStore-backed JWT lets the same account open its
      // encrypted local database even when Convex cannot answer. A different
      // account has a different subject, so ownership is cleared before load.
      if (remoteEnabled && cachedUserId) {
        await claimLocalDatabaseOwner(cachedUserId);
      }
      if (!remoteEnabled || cachedUserId) await refresh();
    });
  }, [cachedUserId, refresh, reloadDevicePreferences, remoteEnabled]);

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

  const synchronize = useCallback(
    async (profile: LocalProfile, consentedAt?: number) => {
      if (offlineRef.current) {
        const issue = classifyServiceIssue(undefined, true);
        setServiceIssue(issue);
        setSyncStatus('offline');
        return false;
      }
      setSyncStatus('syncing');
      setServiceIssue(undefined);
      try {
        await syncSingleFlight.current(() =>
          synchronizeMedicalCloud({
            profile,
            consentedAt,
            saveProfile: (input) => saveRemoteProfile(input),
            loadPendingOutbox: pendingOutbox,
            pushBatch: (batch) => syncRemoteBatch(batch as never),
            acknowledge: acknowledgeOutbox,
          }),
        );
        retryAttempt.current = 0;
        setSyncStatus('idle');
        return true;
      } catch (error) {
        console.error('Health sync failed', error);
        const issue = classifyServiceIssue(error, offlineRef.current);
        if (issue.retryable) retryAttempt.current += 1;
        setServiceIssue(issue);
        setSyncStatus(issue.kind === 'offline' ? 'offline' : 'error');
        return false;
      }
    },
    [saveRemoteProfile, syncRemoteBatch],
  );

  const syncNow = useCallback(async () => {
    if (readOnly || !canUseCloud || !snapshot.profile) return false;
    try {
      const preference =
        await loadLocalSetting<CloudSyncPreference>(CLOUD_SYNC_SETTING);
      if (!preference?.enabled) return false;
      return synchronize(snapshot.profile, preference.consentedAt);
    } catch (error) {
      console.error('Failed to read cloud sync consent', error);
      setServiceIssue(classifyServiceIssue(error, offlineRef.current));
      setSyncStatus('error');
      return false;
    }
  }, [canUseCloud, readOnly, snapshot.profile, synchronize]);

  useEffect(() => {
    if (canUseCloud && snapshot.profile) void syncNow();
  }, [canUseCloud, localRevision, snapshot.profile?.updatedAt]);

  useEffect(() => {
    const reconnected = wasOffline.current && !isOffline;
    wasOffline.current = isOffline;
    if (!canUseCloud || !snapshot.profile) return;
    if (isOffline) {
      setSyncStatus('offline');
      setServiceIssue(classifyServiceIssue(undefined, true));
      return;
    }
    if (reconnected) void syncNow();
  }, [canUseCloud, isOffline, snapshot.profile, syncNow]);

  useEffect(() => {
    if (
      !serviceIssue?.retryable ||
      serviceIssue.kind === 'offline' ||
      isOffline ||
      !canUseCloud ||
      !snapshot.profile
    ) {
      return undefined;
    }
    const timeout = setTimeout(
      () => void syncNow(),
      retryDelayMs(Math.max(retryAttempt.current - 1, 0)),
    );
    return () => clearTimeout(timeout);
  }, [canUseCloud, isOffline, serviceIssue, snapshot.profile, syncNow]);

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
    [readOnly, refresh],
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
      await refresh();
    },
    [readOnly, refresh, snapshot.profile, snapshot.programs],
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
      const result = {
        ...input,
        localId: newLocalId('lab'),
        updatedAt: Date.now(),
      };
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
      const result = {
        ...input,
        localId: newLocalId('scan'),
        updatedAt: Date.now(),
      };
      await saveScanResultWithJournal(result, {
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
      });
      await refresh();
    },
    [readOnly, refresh],
  );

  const saveTyped = useCallback(
    async <
      K extends
        | 'medicalConditions'
        | 'medications'
        | 'allergyRisks'
        | 'documents'
        | 'chatConversations'
        | 'chatMessages',
    >(
      entity: K,
      prefix: string,
      input: SavedInput<HealthEntityMap[K]>,
    ) => {
      const localId = input.localId ?? newLocalId(prefix);
      await writeRecord(entity, {
        ...input,
        localId,
        updatedAt: Date.now(),
      } as HealthEntityMap[K]);
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
      await writeRecord(entity, {
        ...item,
        deletedAt: Date.now(),
        updatedAt: Date.now(),
      });
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
      setCloudSyncEnabledState(enabled);
      setSyncStatus('idle');
      setServiceIssue(undefined);
      if (enabled && snapshot.profile && remoteEnabled) {
        await synchronize(snapshot.profile, preference.consentedAt);
      }
    },
    [readOnly, remoteEnabled, snapshot.profile, synchronize],
  );

  const requestAccountDeletion = useCallback(async () => {
    if (readOnly || !remoteEnabled) return false;
    if (offlineRef.current) {
      setServiceIssue(classifyServiceIssue(undefined, true));
      return false;
    }
    try {
      const state = await requestRemoteDeletion({});
      await saveLocalSetting(
        DELETION_DEADLINE_SETTING,
        state.scheduledDeletionAt,
      );
      setCloudSyncEnabledState(false);
      setServiceIssue(undefined);
      return true;
    } catch (error) {
      setServiceIssue(classifyServiceIssue(error, offlineRef.current));
      return false;
    }
  }, [readOnly, remoteEnabled, requestRemoteDeletion]);

  const restoreAccount = useCallback(async () => {
    if (!remoteEnabled) return false;
    if (offlineRef.current) {
      setServiceIssue(classifyServiceIssue(undefined, true));
      return false;
    }
    try {
      await restoreRemoteAccount({});
      await deleteLocalSetting(DELETION_DEADLINE_SETTING);
      setServiceIssue(undefined);
      await refresh();
      return true;
    } catch (error) {
      setServiceIssue(classifyServiceIssue(error, offlineRef.current));
      return false;
    }
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
      serviceIssue,
      cloudSyncEnabled,
      viewerEmail: viewer?.email,
      accountDeletion,
      completeOnboarding,
      updateProfile,
      addJournalEntry,
      addLabResult,
      addScanResult,
      saveMedicalCondition: (input) =>
        saveTyped('medicalConditions', 'condition', input).then(
          () => undefined,
        ),
      saveMedication: (input) =>
        saveTyped('medications', 'medication', input).then(() => undefined),
      saveAllergyRisk: (input) =>
        saveTyped('allergyRisks', 'allergy', input).then(() => undefined),
      saveDocument: (input) =>
        saveTyped('documents', 'document', input).then(() => undefined),
      saveConversation: (input) =>
        saveTyped('chatConversations', 'conversation', input),
      saveChatMessage: (input) =>
        saveTyped('chatMessages', 'message', input).then(() => undefined),
      savePreferences,
      deleteRecord,
      setProgramStatus: async (program, status) =>
        writeRecord('programs', { ...program, status, updatedAt: Date.now() }),
      markReminderRead: async (reminder) =>
        writeRecord('reminders', {
          ...reminder,
          readAt: Date.now(),
          updatedAt: Date.now(),
        }),
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
      serviceIssue,
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
