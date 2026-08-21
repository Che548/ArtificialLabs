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
  clearPendingChatOutbox,
  clearLocalAgentData,
  clearLocalHealthData,
  deleteLocalSetting,
  enqueueLocalChatSnapshot,
  initializeLocalDatabase,
  loadLocalSetting,
  loadLocalSnapshot,
  mergeRemoteSnapshot,
  pendingOutbox,
  saveLocalProfile,
  saveLocalRecord,
  saveLocalSetting,
  saveAgentPlanChanges,
  saveLabResultBundle,
  saveScanResultWithJournal,
  tombstoneLocalChatConversation,
  tombstoneLocalDocumentBundle,
} from './local-database';
import type {
  AllergyRisk,
  AppPreferences,
  CarePlanItem,
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
  RecommendationEvent,
  SyncStatus,
} from './health-types';
import { createEmptySnapshot, newLocalId } from './health-types';
import { mayUseMedicalCloud } from './sync-policy';
import {
  clearLocalHealthFiles,
  discardPersistedChatAttachment,
  discardPersistedLabDocument,
} from './local-files';
import {
  applyAgentPlanProposal,
  applyConfirmedCarePlanSchedule,
  applyCarePlanUserAction,
  markAgentTriggersRun,
  reconcileCarePlan,
  type AgentPlanProposal,
} from './care-plan';
import {
  createSingleFlightRunner,
  synchronizeMedicalCloud,
} from './cloud-sync';
import { useConnectivity } from './connectivity';
import { classifyServiceIssue, retryDelayMs } from './service-errors';
import type { ServiceIssue } from './service-errors';
import { reconcileAgentBackgroundRegistration } from './agent-background';

const backendApi = api;
const CLOUD_SYNC_SETTING = 'cloudSyncPreference.v1';
const AGENT_DATA_CLEARED_AT_SETTING = 'agentDataClearedAt.v1';
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
  cloudProfileReady: boolean;
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
  applyCarePlanAction: (
    item: CarePlanItem,
    action: 'complete' | 'decline',
  ) => Promise<void>;
  reconcileAgentPlan: () => Promise<boolean>;
  applyAgentPlanProposal: (proposal: AgentPlanProposal) => Promise<boolean>;
  recordAgentPlanRun: (triggerLocalIds: string[], at?: number) => Promise<void>;
  confirmCarePlanSchedule: (
    item: CarePlanItem,
    input: Parameters<typeof applyConfirmedCarePlanSchedule>[1],
  ) => Promise<void>;
  deleteChatConversation: (conversation: ChatConversation) => Promise<void>;
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
  clearAgentData: () => Promise<void>;
  importData: (preview: ImportPreview) => Promise<void>;
  syncNow: () => Promise<boolean>;
};

const HealthStoreContext = createContext<HealthStoreValue | null>(null);

async function persistCarePlanReconciliation(sourceSnapshot?: HealthSnapshot) {
  const currentSnapshot = sourceSnapshot ?? (await loadLocalSnapshot());
  const reconciliation = reconcileCarePlan(currentSnapshot);
  await saveAgentPlanChanges(reconciliation);
  return Boolean(
    reconciliation.items.length ||
    reconciliation.events.length ||
    reconciliation.triggers.length ||
    reconciliation.reminders.length,
  );
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
  const chatCloudPrepared = useRef(false);
  const chatCloudPreparation = useRef<Promise<void> | undefined>(undefined);
  const agentReconciliation = useRef<Promise<boolean> | undefined>(undefined);
  const applyingRemoteAgentClear = useRef<number | undefined>(undefined);
  const saveRemoteProfile = useMutation(backendApi.profile.save);
  const revokeRemoteCloudSync = useMutation(backendApi.profile.revokeCloudSync);
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
    if (!preference?.enabled) {
      chatCloudPrepared.current = false;
      await clearPendingChatOutbox();
    }
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
      timezoneOffsetMinutes: remoteProfile.timezoneOffsetMinutes,
      updatedAt: remoteProfile.updatedAt,
    };
    void saveLocalProfile(profile).then(refresh);
  }, [canUseCloud, refresh, remoteProfile, snapshot.profile?.updatedAt]);

  useEffect(() => {
    if (!remoteSnapshot || !canUseCloud) return;
    const { profile: _profile, ...records } = remoteSnapshot;
    void mergeRemoteSnapshot(records as never).then(refresh);
  }, [canUseCloud, refresh, remoteSnapshot]);

  useEffect(() => {
    const clearedAt = remoteProfile?.agentDataClearedAt;
    if (!ready || !clearedAt || applyingRemoteAgentClear.current === clearedAt)
      return;
    applyingRemoteAgentClear.current = clearedAt;
    void (async () => {
      const appliedAt =
        (await loadLocalSetting<number>(AGENT_DATA_CLEARED_AT_SETTING)) ?? 0;
      if (appliedAt >= clearedAt) return;
      await clearLocalAgentData();
      const local = await loadLocalSnapshot();
      const current = local.preferences.find((item) => !item.deletedAt);
      if (current) {
        await saveLocalRecord(
          'preferences',
          {
            ...current,
            medicalRecommendations: false,
            agentNotifications: false,
            agentLastSuccessfulRunAt: undefined,
            updatedAt: Math.max(Date.now(), clearedAt),
          },
          false,
        );
      }
      await saveLocalSetting(AGENT_DATA_CLEARED_AT_SETTING, clearedAt);
      await refresh();
    })()
      .catch(() => undefined)
      .finally(() => {
        if (applyingRemoteAgentClear.current === clearedAt)
          applyingRemoteAgentClear.current = undefined;
      });
  }, [ready, refresh, remoteProfile?.agentDataClearedAt]);

  const prepareChatCloud = useCallback(async () => {
    if (chatCloudPrepared.current && !chatCloudPreparation.current) return;
    if (!chatCloudPreparation.current) {
      chatCloudPrepared.current = true;
      const preparation = enqueueLocalChatSnapshot(
        snapshot.chatConversations,
        snapshot.chatMessages,
      )
        .catch((error) => {
          chatCloudPrepared.current = false;
          throw error;
        })
        .finally(() => {
          if (chatCloudPreparation.current === preparation) {
            chatCloudPreparation.current = undefined;
          }
        });
      chatCloudPreparation.current = preparation;
    }
    await chatCloudPreparation.current;
  }, [snapshot.chatConversations, snapshot.chatMessages]);

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
      await prepareChatCloud();
      return synchronize(snapshot.profile, preference.consentedAt);
    } catch (error) {
      console.error('Failed to read cloud sync consent', error);
      setServiceIssue(classifyServiceIssue(error, offlineRef.current));
      setSyncStatus('error');
      return false;
    }
  }, [canUseCloud, prepareChatCloud, readOnly, snapshot.profile, synchronize]);

  const flushCloudSyncRevocation = useCallback(async () => {
    if (!remoteEnabled || offlineRef.current || !viewer) return false;
    const preference =
      await loadLocalSetting<CloudSyncPreference>(CLOUD_SYNC_SETTING);
    if (preference?.enabled || !preference?.revocationPending) return true;
    try {
      await revokeRemoteCloudSync({});
      await saveLocalSetting(CLOUD_SYNC_SETTING, {
        ...preference,
        revocationPending: false,
        updatedAt: Date.now(),
      } satisfies CloudSyncPreference);
      return true;
    } catch {
      return false;
    }
  }, [remoteEnabled, revokeRemoteCloudSync, viewer]);

  useEffect(() => {
    if (!ready || isOffline || !viewer) return;
    void flushCloudSyncRevocation();
  }, [flushCloudSyncRevocation, isOffline, ready, viewer]);

  useEffect(() => {
    if (!canUseCloud) chatCloudPrepared.current = false;
  }, [canUseCloud]);

  useEffect(() => {
    if (canUseCloud && snapshot.profile) void syncNow();
  }, [canUseCloud, localRevision, snapshot.profile?.updatedAt, syncNow]);

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
        timezoneOffsetMinutes: new Date().getTimezoneOffset(),
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
      const nextProfile = {
        ...snapshot.profile,
        ...input,
        timezoneOffsetMinutes: new Date().getTimezoneOffset(),
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
      await persistCarePlanReconciliation();
      await refresh();
    },
    [readOnly, refresh, snapshot.profile, snapshot.programs],
  );

  const addJournalEntry = useCallback(
    async (input: Omit<JournalEntry, 'localId' | 'updatedAt' | 'source'>) => {
      if (readOnly) return;
      await writeRecord('journalEntries', {
        ...input,
        localId: newLocalId('journal'),
        source: 'manual',
        updatedAt: Date.now(),
      });
      await persistCarePlanReconciliation();
      await refresh();
    },
    [readOnly, refresh, writeRecord],
  );

  const addLabResult = useCallback(
    async (input: Omit<LabResult, 'localId' | 'updatedAt'>) => {
      if (readOnly) return;
      const result = {
        ...input,
        localId: newLocalId('lab'),
        updatedAt: Date.now(),
      };
      const linkedPlan = snapshot.carePlanItems.find(
        (item) =>
          !item.deletedAt &&
          (item.status === 'current' || item.status === 'upcoming') &&
          item.catalogKey === result.catalogKey,
      );
      const documentLocalId = result.localDocumentUri
        ? newLocalId('document')
        : undefined;
      const document = result.localDocumentUri
        ? ({
            localId: documentLocalId!,
            title: result.title,
            category: 'lab',
            documentDate: result.collectedAt,
            hasLocalFile: true,
            localFileUri: result.localDocumentUri,
            linkedLabResultLocalId: result.localId,
            linkedCarePlanLocalId: linkedPlan?.localId,
            contentIndexStatus: 'metadata-only',
            updatedAt: result.updatedAt,
          } as HealthDocument)
        : undefined;
      const storedResult: LabResult = {
        ...result,
        hasLocalSourceDocument: Boolean(documentLocalId),
        sourceDocumentLocalId: documentLocalId,
        localDocumentUri: undefined,
      };
      const completed =
        linkedPlan && result.status !== 'unreviewed'
          ? applyCarePlanUserAction(linkedPlan, 'complete', result.collectedAt)
          : undefined;
      await saveLabResultBundle({
        result: storedResult,
        document,
        plan: completed?.item,
        event: completed?.event,
        journalEntry:
          result.status === 'unreviewed'
            ? undefined
            : {
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
              },
      });
      await persistCarePlanReconciliation();
      await refresh();
    },
    [readOnly, refresh, snapshot.carePlanItems],
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
      await persistCarePlanReconciliation();
      await refresh();
    },
    [readOnly, refresh],
  );

  const saveTyped = useCallback(
    async <
      K extends
        'medicalConditions' | 'medications' | 'allergyRisks' | 'documents',
    >(
      entity: K,
      prefix: string,
      input: SavedInput<HealthEntityMap[K]>,
    ) => {
      const localId = input.localId ?? newLocalId(prefix);
      if (readOnly) return localId;
      await writeRecord(entity, {
        ...input,
        localId,
        updatedAt: Date.now(),
      } as HealthEntityMap[K]);
      if (entity !== 'documents') {
        await persistCarePlanReconciliation();
        await refresh();
      }
      return localId;
    },
    [readOnly, refresh, writeRecord],
  );

  const saveConversation = useCallback(
    async (input: SavedInput<ChatConversation>) => {
      const localId = input.localId ?? newLocalId('conversation');
      if (readOnly) return localId;
      await saveLocalRecord(
        'chatConversations',
        { ...input, localId, updatedAt: Date.now() },
        canUseCloud,
      );
      await refresh();
      return localId;
    },
    [canUseCloud, readOnly, refresh],
  );

  const saveChatMessage = useCallback(
    async (input: SavedInput<ChatMessage>) => {
      if (readOnly) return;
      await saveLocalRecord(
        'chatMessages',
        {
          ...input,
          localId: input.localId ?? newLocalId('message'),
          updatedAt: Date.now(),
        },
        canUseCloud,
      );
      await refresh();
    },
    [canUseCloud, readOnly, refresh],
  );

  const runCarePlanReconciliation = useCallback(
    async (sourceSnapshot?: HealthSnapshot) => {
      if (readOnly) return false;
      if (agentReconciliation.current) {
        return agentReconciliation.current;
      }
      const task = (async () => {
        const changed = await persistCarePlanReconciliation(sourceSnapshot);
        if (changed) await refresh();
        return changed;
      })().finally(() => {
        agentReconciliation.current = undefined;
      });
      agentReconciliation.current = task;
      return task;
    },
    [readOnly, refresh],
  );

  const applyValidatedAgentPlanProposal = useCallback(
    async (proposal: AgentPlanProposal) => {
      if (readOnly) return false;
      const currentSnapshot = await loadLocalSnapshot();
      const result = applyAgentPlanProposal(currentSnapshot, proposal);
      await saveAgentPlanChanges(result);
      if (result.items.length || result.events.length) await refresh();
      return Boolean(result.items.length || result.events.length);
    },
    [readOnly, refresh],
  );

  const applyCarePlanAction = useCallback(
    async (item: CarePlanItem, action: 'complete' | 'decline') => {
      if (readOnly) return;
      const result = applyCarePlanUserAction(item, action);
      await saveAgentPlanChanges({
        items: [result.item],
        events: [result.event],
      });
      const currentSnapshot = await loadLocalSnapshot();
      await runCarePlanReconciliation(currentSnapshot);
      await refresh();
    },
    [readOnly, refresh, runCarePlanReconciliation],
  );

  const recordAgentPlanRun = useCallback(
    async (triggerLocalIds: string[], at = Date.now()) => {
      if (readOnly || !triggerLocalIds.length) return;
      const currentSnapshot = await loadLocalSnapshot();
      const triggers = markAgentTriggersRun(
        currentSnapshot.agentTriggers,
        triggerLocalIds,
        at,
      );
      await saveAgentPlanChanges({ triggers });
      await refresh();
    },
    [readOnly, refresh],
  );

  const confirmCarePlanSchedule = useCallback(
    async (
      item: CarePlanItem,
      input: Parameters<typeof applyConfirmedCarePlanSchedule>[1],
    ) => {
      if (readOnly || item.status === 'current') return;
      const result = applyConfirmedCarePlanSchedule(item, input);
      await saveAgentPlanChanges({
        items: [result.item],
        events: [result.event],
      });
      await persistCarePlanReconciliation();
      await refresh();
    },
    [readOnly, refresh],
  );

  const savePreferences = useCallback(
    async (input: Partial<Omit<AppPreferences, 'localId' | 'updatedAt'>>) => {
      if (readOnly) return;
      if (input.medicalRecommendations === false) {
        // Revoke the cached background-task authorization before persisting
        // the preference or waiting on any server round trip. Even if the OS
        // registration API fails, the adapter writes the local authorization
        // bit first, so a later background launch exits without reading data.
        await reconcileAgentBackgroundRegistration(false).catch(
          () => undefined,
        );
      }
      const current = snapshot.preferences.find((item) => !item.deletedAt);
      await writeRecord('preferences', {
        localId: 'preferences',
        notificationsEnabled: false,
        journalNotifications: true,
        resultNotifications: true,
        notificationTone: 'formal',
        anonymousAnalytics: false,
        medicalRecommendations: false,
        agentNotifications: false,
        agentLastSuccessfulRunAt: undefined,
        language: 'ru',
        region: 'RU',
        ...current,
        ...input,
        updatedAt: Date.now(),
      });
      if (input.medicalRecommendations !== undefined) {
        await persistCarePlanReconciliation();
        await refresh();
      }
    },
    [readOnly, refresh, snapshot.preferences, writeRecord],
  );

  const deleteRecord = useCallback(
    async <K extends HealthEntityName>(entity: K, item: HealthEntityMap[K]) => {
      if (readOnly) return;
      if (entity === 'documents') {
        await tombstoneLocalDocumentBundle(
          item as HealthDocument,
          snapshot.labResults,
          true,
          'localFileUri' in item && typeof item.localFileUri === 'string'
            ? () => discardPersistedLabDocument(item.localFileUri as string)
            : undefined,
        );
        await refresh();
        return;
      }
      await writeRecord(entity, {
        ...item,
        deletedAt: Date.now(),
        updatedAt: Date.now(),
      });
      if (
        entity === 'medicalConditions' ||
        entity === 'medications' ||
        entity === 'allergyRisks' ||
        entity === 'labResults' ||
        entity === 'scanResults'
      ) {
        await persistCarePlanReconciliation();
        await refresh();
      }
    },
    [readOnly, refresh, snapshot.labResults, writeRecord],
  );

  useEffect(() => {
    if (!ready || readOnly) return;
    void runCarePlanReconciliation(snapshot);
  }, [
    readOnly,
    ready,
    runCarePlanReconciliation,
    snapshot.agentTriggers,
    snapshot.carePlanItems,
    snapshot.preferences,
    snapshot.profile,
  ]);

  const deleteChatConversation = useCallback(
    async (conversation: ChatConversation) => {
      if (readOnly) return;
      const messages = snapshot.chatMessages.filter(
        (message) => message.conversationLocalId === conversation.localId,
      );
      await tombstoneLocalChatConversation(conversation, messages, canUseCloud);
      const attachmentUris = messages.flatMap((message) =>
        message.attachments.flatMap((attachment) =>
          attachment.localUri ? [attachment.localUri] : [],
        ),
      );
      await Promise.allSettled(
        attachmentUris.map((uri) => discardPersistedChatAttachment(uri)),
      );
      await refresh();
    },
    [canUseCloud, readOnly, refresh, snapshot.chatMessages],
  );

  const setCloudSyncEnabled = useCallback(
    async (enabled: boolean) => {
      if (readOnly) return;
      const preference: CloudSyncPreference = {
        enabled,
        consentedAt: enabled ? Date.now() : undefined,
        revocationPending: !enabled && remoteEnabled,
        updatedAt: Date.now(),
      };
      await saveLocalSetting(CLOUD_SYNC_SETTING, preference);
      setCloudSyncEnabledState(enabled);
      setSyncStatus('idle');
      setServiceIssue(undefined);
      if (enabled) {
        await prepareChatCloud();
      } else {
        chatCloudPrepared.current = false;
        await clearPendingChatOutbox();
      }
      if (enabled && snapshot.profile && remoteEnabled) {
        await synchronize(snapshot.profile, preference.consentedAt);
      } else if (!enabled && remoteEnabled) {
        await flushCloudSyncRevocation();
      }
    },
    [
      readOnly,
      remoteEnabled,
      prepareChatCloud,
      flushCloudSyncRevocation,
      snapshot.chatConversations,
      snapshot.chatMessages,
      snapshot.profile,
      synchronize,
    ],
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
      chatCloudPrepared.current = false;
      await clearPendingChatOutbox();
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

  const clearAgentData = useCallback(async () => {
    if (readOnly) return;
    await reconcileAgentBackgroundRegistration(false).catch(() => undefined);
    await clearLocalAgentData();
    const current = snapshot.preferences.find((item) => !item.deletedAt);
    if (current) {
      await saveLocalRecord('preferences', {
        ...current,
        medicalRecommendations: false,
        agentNotifications: false,
        agentLastSuccessfulRunAt: undefined,
        updatedAt: Date.now(),
      });
    }
    await refresh();
  }, [readOnly, refresh, snapshot.preferences]);

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
          const syncChatRecord =
            entity === 'chatConversations' || entity === 'chatMessages';
          await saveLocalRecord(
            entity as HealthEntityName,
            record as never,
            syncChatRecord ? canUseCloud : true,
          );
        }
      }
      await refresh();
    },
    [canUseCloud, readOnly, refresh, snapshot.profile?.updatedAt],
  );

  const value = useMemo<HealthStoreValue>(
    () => ({
      ...snapshot,
      ready,
      readOnly,
      syncStatus,
      serviceIssue,
      cloudSyncEnabled,
      cloudProfileReady: Boolean(remoteProfile),
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
      saveConversation,
      saveChatMessage,
      applyCarePlanAction,
      reconcileAgentPlan: runCarePlanReconciliation,
      applyAgentPlanProposal: applyValidatedAgentPlanProposal,
      recordAgentPlanRun,
      confirmCarePlanSchedule,
      deleteChatConversation,
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
      clearAgentData,
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
      remoteProfile,
      viewer?.email,
      accountDeletion,
      completeOnboarding,
      updateProfile,
      addJournalEntry,
      addLabResult,
      addScanResult,
      saveTyped,
      saveConversation,
      saveChatMessage,
      applyCarePlanAction,
      applyValidatedAgentPlanProposal,
      recordAgentPlanRun,
      confirmCarePlanSchedule,
      runCarePlanReconciliation,
      savePreferences,
      deleteChatConversation,
      deleteRecord,
      writeRecord,
      setCloudSyncEnabled,
      requestAccountDeletion,
      restoreAccount,
      clearAllLocalData,
      clearAgentData,
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
