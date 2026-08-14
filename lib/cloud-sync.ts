import type {
  HealthEntityMap,
  HealthEntityName,
  LocalProfile,
} from './health-types';

export type CloudProfileInput = LocalProfile & {
  consentToCloudSyncAt?: number;
};

export type CloudOutboxRow = {
  id: number;
  entity: HealthEntityName;
  payload: HealthEntityMap[HealthEntityName];
};

export type CloudSyncBatch = Record<HealthEntityName, unknown[]>;

const entityNames: HealthEntityName[] = [
  'programs',
  'journalEntries',
  'labResults',
  'scanResults',
  'reminders',
  'medicalConditions',
  'medications',
  'allergyRisks',
  'documents',
  'chatConversations',
  'chatMessages',
  'preferences',
];

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

function emptyBatch(): CloudSyncBatch {
  return Object.fromEntries(
    entityNames.map((entity) => [entity, []]),
  ) as unknown as CloudSyncBatch;
}

export function createSingleFlightRunner() {
  let active: Promise<number> | undefined;
  return (task: () => Promise<number>) => {
    if (active) return active;
    active = task().finally(() => {
      active = undefined;
    });
    return active;
  };
}

export async function synchronizeMedicalCloud({
  profile,
  consentedAt,
  saveProfile,
  loadPendingOutbox,
  pushBatch,
  acknowledge,
}: {
  profile: LocalProfile;
  consentedAt?: number;
  saveProfile: (profile: CloudProfileInput) => Promise<unknown>;
  loadPendingOutbox: () => Promise<CloudOutboxRow[]>;
  pushBatch: (batch: CloudSyncBatch) => Promise<unknown>;
  acknowledge: (ids: number[]) => Promise<void>;
}) {
  await saveProfile({
    ...profile,
    consentToCloudSyncAt: consentedAt,
  });

  let pushed = 0;
  for (;;) {
    const rows = await loadPendingOutbox();
    if (!rows.length) return pushed;
    const batch = emptyBatch();
    for (const row of rows) {
      batch[row.entity].push(
        withoutLocalFiles(row.payload as unknown as Record<string, unknown>),
      );
    }
    await pushBatch(batch);
    await acknowledge(rows.map((row) => row.id));
    pushed += rows.length;
  }
}
