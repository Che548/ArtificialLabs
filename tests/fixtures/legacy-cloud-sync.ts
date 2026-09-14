// Frozen pre-protocol coordinator from 9b00049204b662bfc1e561ef3f17350ad3b172a9.
// Only the type import path differs. Do not modernize: this is compatibility evidence,
// not a claim that the App Store build was installed or tested.
import type {
  HealthEntityMap,
  HealthEntityName,
  LocalProfile,
} from '../../lib/health-types';

export type CloudProfileInput = LocalProfile & {
  consentToCloudSyncAt?: number;
};

export type CloudOutboxRow = {
  id: number;
  entity: HealthEntityName;
  payload: HealthEntityMap[HealthEntityName];
};

export type CloudSyncBatch = Record<HealthEntityName, unknown[]>;

export function utf8ByteLength(value: string) {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
}

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
  'carePlanItems',
  'agentTriggers',
  'recommendationEvents',
  'preferences',
];

export function sanitizeCloudRecord(
  entity: HealthEntityName,
  item: Record<string, unknown>,
) {
  if (entity === 'documents') {
    const allowed = ['localId', 'title', 'category', 'documentDate', 'hasLocalFile', 'mimeType', 'size',
      'linkedLabResultLocalId', 'linkedCarePlanLocalId', 'contentIndexStatus', 'updatedAt', 'deletedAt'];
    return Object.fromEntries(allowed.filter(key => Object.hasOwn(item, key)).map(key => [key, item[key]]));
  }
  const {
    localImageUri: _image,
    localDocumentUri: _document,
    localFileUri: _file,
    // Defense in depth: OCR lives outside records; never transport accidental draft fields.
    ocrDraft: _ocrDraft,
    extractedText: _extractedText,
    documentExtraction: _documentExtraction,
    editedText: _editedText,
    pages: _ocrPages,
    ...syncable
  } = item;
  if (Array.isArray(syncable.attachments)) {
    syncable.attachments = syncable.attachments.map((raw) => {
      const { localUri: _uri, ...attachment } = raw as Record<string, unknown>;
      return { ...attachment, availableLocally: false };
    });
  }
  if (
    (entity === 'carePlanItems' ||
      entity === 'agentTriggers' ||
      entity === 'recommendationEvents') &&
    Array.isArray(syncable.evidenceRefs)
  ) {
    syncable.evidenceRefs = syncable.evidenceRefs.map((raw) => {
      const ref = raw as Record<string, unknown>;
      return { ...ref, label: ref.source };
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
  acknowledge: (ids: number[], sentRows: CloudOutboxRow[]) => Promise<void>;
}) {
  await saveProfile({
    ...profile,
    consentToCloudSyncAt: consentedAt,
  });

  let pushed = 0;
  for (;;) {
    const rows = await loadPendingOutbox();
    if (!rows.length) return pushed;
    const agentEntities = new Set(['carePlanItems', 'agentTriggers', 'recommendationEvents']);
    // A rejected agent rule must not roll back unrelated local-first records.
    // Keep plan items and their evidence events together in the agent batch.
    const groups = [
      rows.filter((row) => !agentEntities.has(row.entity)),
      rows.filter((row) => agentEntities.has(row.entity)),
    ];
    for (const group of groups) {
      if (!group.length) continue;
      const batch = emptyBatch();
      for (const row of group) {
        batch[row.entity].push(
          sanitizeCloudRecord(row.entity, row.payload as unknown as Record<string, unknown>),
        );
      }
      await pushBatch(batch);
      await acknowledge(group.map((row) => row.id), group);
      pushed += group.length;
    }
  }
}
