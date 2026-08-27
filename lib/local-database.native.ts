import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';

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
import type {
  AnonymousTelemetryEvent,
  PendingTelemetryEvent,
} from './telemetry-types';
import { createEmptySnapshot } from './health-types';
import { createChatTombstones } from './chat-deletion';
import { sanitizeCloudRecord, utf8ByteLength } from './cloud-sync';
import {
  isAllowedAgentTriggerMutation,
  isAllowedCarePlanMutation,
  validateAgentTrigger,
  validateCarePlanItem,
  validateRecommendationEvent,
} from './care-plan';
import type {
  AgentTrigger,
  CarePlanItem,
  RecommendationEvent,
} from './health-types';

const DATABASE_NAME = 'artificiallabs.db';
const DATABASE_KEY_NAME = 'artificiallabs.database-key.v1';
const AGENT_SEARCH_INDEX_VERSION = '1';
const AGENT_AUTOMATION_LEASE_SETTING = 'agentAutomationLease.v1';
let databasePromise: Promise<SQLite.SQLiteDatabase> | undefined;
let writeQueue = Promise.resolve();

type OutboxRow = {
  id: number;
  entity: HealthEntityName;
  payload: string;
};

export type AgentSearchHit = {
  entity: HealthEntityName;
  localId: string;
  occurredAt: number;
};

const searchableEntities = new Set<HealthEntityName>([
  'journalEntries',
  'labResults',
  'scanResults',
  'documents',
  'chatMessages',
  'carePlanItems',
]);

function searchTextFor(
  entity: HealthEntityName,
  item: HealthEntityMap[HealthEntityName],
) {
  if (item.deletedAt || !searchableEntities.has(entity)) return undefined;
  if (entity === 'journalEntries') {
    const entry = item as HealthEntityMap['journalEntries'];
    return [entry.label, entry.textValue, entry.numericValue, entry.unit]
      .filter((value) => value !== undefined)
      .join(' ');
  }
  if (entity === 'labResults') {
    const result = item as HealthEntityMap['labResults'];
    return [
      result.title,
      ...result.analytes.flatMap((analyte) => [
        analyte.name,
        analyte.value,
        analyte.unit,
        analyte.reference,
      ]),
    ]
      .filter(Boolean)
      .join(' ');
  }
  if (entity === 'scanResults') {
    const result = item as HealthEntityMap['scanResults'];
    return [
      result.testSystemKey,
      result.confirmedValue,
      ...result.qualityFlags,
    ].join(' ');
  }
  if (entity === 'documents') {
    const document = item as HealthEntityMap['documents'];
    return [document.title, document.category].join(' ');
  }
  if (entity === 'chatMessages') {
    return (item as HealthEntityMap['chatMessages']).text;
  }
  const plan = item as HealthEntityMap['carePlanItems'];
  return [plan.title, plan.category, plan.description, plan.rationale].join(
    ' ',
  );
}

function occurredAtForSearch(
  entity: HealthEntityName,
  item: HealthEntityMap[HealthEntityName],
) {
  if (entity === 'journalEntries')
    return (item as HealthEntityMap['journalEntries']).occurredAt;
  if (entity === 'labResults')
    return (item as HealthEntityMap['labResults']).collectedAt;
  if (entity === 'scanResults')
    return (item as HealthEntityMap['scanResults']).capturedAt;
  if (entity === 'documents')
    return (item as HealthEntityMap['documents']).documentDate;
  if (entity === 'chatMessages')
    return (item as HealthEntityMap['chatMessages']).sentAt;
  if (entity === 'carePlanItems') {
    const plan = item as HealthEntityMap['carePlanItems'];
    return plan.dueAt ?? plan.updatedAt;
  }
  return item.updatedAt;
}

async function updateAgentSearchIndex(
  db: SQLite.SQLiteDatabase,
  entity: HealthEntityName,
  item: HealthEntityMap[HealthEntityName],
) {
  if (!searchableEntities.has(entity)) return;
  await db.runAsync(
    'DELETE FROM agent_search_fts WHERE entity = ? AND local_id = ?',
    entity,
    item.localId,
  );
  const text = searchTextFor(entity, item);
  if (!text?.trim()) return;
  await db.runAsync(
    `INSERT INTO agent_search_fts(entity, local_id, occurred_at, text)
     VALUES (?, ?, ?, ?)`,
    entity,
    item.localId,
    occurredAtForSearch(entity, item),
    text.slice(0, 16_000),
  );
}

type RemoteSnapshot = {
  [K in HealthEntityName]: Array<
    HealthEntityMap[K] & {
      _id?: unknown;
      _creationTime?: number;
      profileId?: unknown;
    }
  >;
};

async function databaseKey() {
  const existing = await SecureStore.getItemAsync(DATABASE_KEY_NAME);
  if (existing) return existing;
  const bytes = await Crypto.getRandomBytesAsync(32);
  const key = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  await SecureStore.setItemAsync(DATABASE_KEY_NAME, key, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return key;
}

async function openDatabase() {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  const key = await databaseKey();
  await db.execAsync(`PRAGMA key = "x'${key}'"`);
  await db.getFirstAsync('SELECT count(*) AS count FROM sqlite_master');
  await db.execAsync(`
    PRAGMA cipher_memory_security = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS records (
      entity TEXT NOT NULL,
      local_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      occurred_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (entity, local_id)
    );
    CREATE INDEX IF NOT EXISTS records_entity_time
      ON records(entity, occurred_at DESC);
    CREATE TABLE IF NOT EXISTS outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity TEXT NOT NULL,
      local_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS outbox_entity_local
      ON outbox(entity, local_id);
    CREATE TABLE IF NOT EXISTS telemetry_outbox (
      event_id TEXT PRIMARY KEY NOT NULL,
      payload TEXT NOT NULL,
      occurred_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS telemetry_outbox_time
      ON telemetry_outbox(occurred_at ASC);
    CREATE VIRTUAL TABLE IF NOT EXISTS agent_search_fts USING fts5(
      entity UNINDEXED,
      local_id UNINDEXED,
      occurred_at UNINDEXED,
      text,
      tokenize = 'unicode61'
    );
  `);
  const searchVersion = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'agentSearchIndexVersion'",
  );
  if (searchVersion?.value !== AGENT_SEARCH_INDEX_VERSION) {
    await db.runAsync('DELETE FROM agent_search_fts');
    const rows = await db.getAllAsync<{
      entity: HealthEntityName;
      payload: string;
    }>('SELECT entity, payload FROM records');
    for (const row of rows) {
      await updateAgentSearchIndex(
        db,
        row.entity,
        JSON.parse(row.payload) as HealthEntityMap[HealthEntityName],
      );
    }
    await db.runAsync(
      `INSERT INTO settings(key, value) VALUES ('agentSearchIndexVersion', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      AGENT_SEARCH_INDEX_VERSION,
    );
  }
  return db;
}

function database() {
  databasePromise ??= openDatabase();
  return databasePromise;
}

async function withWriteTransaction(
  task: (db: SQLite.SQLiteDatabase) => Promise<void>,
) {
  const previousWrite = writeQueue;
  let releaseWrite: () => void = () => undefined;
  writeQueue = new Promise<void>((resolve) => {
    releaseWrite = resolve;
  });
  await previousWrite;
  try {
    const db = await database();
    await db.execAsync('BEGIN IMMEDIATE');
    try {
      await task(db);
      await db.execAsync('COMMIT');
    } catch (error) {
      await db.execAsync('ROLLBACK');
      throw error;
    }
  } finally {
    releaseWrite();
  }
}

export async function initializeLocalDatabase() {
  await database();
}

export async function claimLocalDatabaseOwner(userId: string) {
  const db = await database();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'ownerId'",
  );
  if (row?.value === userId) return false;
  await withWriteTransaction(async (transaction) => {
    await transaction.execAsync(
      'DELETE FROM records; DELETE FROM outbox; DELETE FROM telemetry_outbox; DELETE FROM agent_search_fts; DELETE FROM settings;',
    );
    await transaction.runAsync(
      `INSERT INTO settings (key, value) VALUES ('ownerId', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      userId,
    );
  });
  return true;
}

export async function loadLocalSnapshot(): Promise<HealthSnapshot> {
  const db = await database();
  const profileRow = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'profile'",
  );
  const rows = await db.getAllAsync<{
    entity: HealthEntityName;
    payload: string;
  }>('SELECT entity, payload FROM records ORDER BY occurred_at DESC');
  const snapshot = createEmptySnapshot();
  snapshot.profile = profileRow
    ? (JSON.parse(profileRow.value) as LocalProfile)
    : null;
  for (const row of rows) {
    (snapshot[row.entity] as unknown[]).push(JSON.parse(row.payload));
  }
  return snapshot;
}

export async function saveLocalProfile(profile: LocalProfile) {
  await withWriteTransaction(async (db) => {
    await db.runAsync(
      `INSERT INTO settings (key, value) VALUES ('profile', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      JSON.stringify(profile),
    );
  });
}

export async function loadLocalSetting<T>(key: string) {
  const db = await database();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    key,
  );
  return row ? (JSON.parse(row.value) as T) : undefined;
}

export async function saveLocalSetting(key: string, value: unknown) {
  await withWriteTransaction(async (db) => {
    await db.runAsync(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      key,
      JSON.stringify(value),
    );
  });
}

export async function deleteLocalSetting(key: string) {
  await withWriteTransaction(async (db) => {
    await db.runAsync('DELETE FROM settings WHERE key = ?', key);
  });
}

export async function tryAcquireLocalAgentRunLease(
  runId: string,
  now = Date.now(),
  ttlMs = 10 * 60_000,
) {
  let acquired = false;
  await withWriteTransaction(async (db) => {
    const row = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?',
      AGENT_AUTOMATION_LEASE_SETTING,
    );
    let active: { runId?: unknown; expiresAt?: unknown } | undefined;
    try {
      active = row ? JSON.parse(row.value) : undefined;
    } catch {
      active = undefined;
    }
    if (
      active &&
      active.runId !== runId &&
      typeof active.expiresAt === 'number' &&
      active.expiresAt > now
    )
      return;
    await db.runAsync(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      AGENT_AUTOMATION_LEASE_SETTING,
      JSON.stringify({ runId, expiresAt: now + Math.max(60_000, ttlMs) }),
    );
    acquired = true;
  });
  return acquired;
}

export async function releaseLocalAgentRunLease(runId: string) {
  await withWriteTransaction(async (db) => {
    const row = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?',
      AGENT_AUTOMATION_LEASE_SETTING,
    );
    if (!row) return;
    try {
      const active = JSON.parse(row.value) as { runId?: unknown };
      if (active.runId !== runId) return;
    } catch {
      return;
    }
    await db.runAsync(
      'DELETE FROM settings WHERE key = ?',
      AGENT_AUTOMATION_LEASE_SETTING,
    );
  });
}

async function writeLocalRecord<K extends HealthEntityName>(
  transaction: SQLite.SQLiteDatabase,
  entity: K,
  item: HealthEntityMap[K],
  enqueue = true,
) {
  const existingAgentRow =
    entity === 'carePlanItems' ||
    entity === 'agentTriggers' ||
    entity === 'recommendationEvents'
      ? await transaction.getFirstAsync<{ payload: string }>(
          'SELECT payload FROM records WHERE entity = ? AND local_id = ?',
          entity,
          item.localId,
        )
      : null;
  if (entity === 'carePlanItems') {
    const candidate = item as HealthEntityMap['carePlanItems'];
    if (!candidate.deletedAt && !validateCarePlanItem(candidate))
      throw new Error('INVALID_AGENT_PLAN_RECORD');
    if (
      existingAgentRow &&
      !isAllowedCarePlanMutation(
        JSON.parse(existingAgentRow.payload) as CarePlanItem,
        candidate,
      )
    )
      throw new Error('CURRENT_PLAN_IMMUTABLE');
  } else if (entity === 'agentTriggers') {
    const candidate = item as HealthEntityMap['agentTriggers'];
    if (!candidate.deletedAt && !validateAgentTrigger(candidate))
      throw new Error('INVALID_AGENT_TRIGGER_RECORD');
    if (
      existingAgentRow &&
      !isAllowedAgentTriggerMutation(
        JSON.parse(existingAgentRow.payload) as AgentTrigger,
        candidate,
      )
    )
      throw new Error('AGENT_TRIGGER_IMMUTABLE');
  } else if (entity === 'recommendationEvents') {
    const candidate = item as HealthEntityMap['recommendationEvents'];
    if (candidate.deletedAt || !validateRecommendationEvent(candidate))
      throw new Error('INVALID_RECOMMENDATION_EVENT');
    if (existingAgentRow) return;
  }
  const payload = JSON.stringify(item);
  const occurredAt =
    'occurredAt' in item
      ? item.occurredAt
      : 'capturedAt' in item
        ? item.capturedAt
        : 'collectedAt' in item
          ? item.collectedAt
          : 'dueAt' in item
            ? (item.dueAt ?? item.updatedAt)
            : 'documentDate' in item
              ? item.documentDate
              : 'sentAt' in item
                ? item.sentAt
                : 'lastMessageAt' in item
                  ? item.lastMessageAt
                  : 'diagnosedAt' in item && item.diagnosedAt
                    ? item.diagnosedAt
                    : 'startedAt' in item && item.startedAt
                      ? item.startedAt
                      : item.updatedAt;
  const writeResult = await transaction.runAsync(
    `INSERT INTO records (entity, local_id, payload, occurred_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(entity, local_id) DO UPDATE SET
         payload = excluded.payload,
         occurred_at = excluded.occurred_at,
         updated_at = excluded.updated_at
       WHERE excluded.updated_at >= records.updated_at`,
    entity,
    item.localId,
    payload,
    occurredAt,
    item.updatedAt,
  );
  if (writeResult.changes > 0)
    await updateAgentSearchIndex(
      transaction,
      entity,
      item as HealthEntityMap[HealthEntityName],
    );
  if (enqueue) {
    await transaction.runAsync(
      `INSERT INTO outbox (entity, local_id, payload, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(entity, local_id) DO UPDATE SET
           payload = excluded.payload,
           updated_at = excluded.updated_at`,
      entity,
      item.localId,
      payload,
      item.updatedAt,
    );
  }
}

export async function saveLocalRecord<K extends HealthEntityName>(
  entity: K,
  item: HealthEntityMap[K],
  enqueue = true,
) {
  await withWriteTransaction(async (transaction) => {
    await writeLocalRecord(transaction, entity, item, enqueue);
  });
}

export async function saveScanResultWithJournal(
  result: ScanResult,
  journalEntry: JournalEntry,
) {
  await withWriteTransaction(async (transaction) => {
    await writeLocalRecord(transaction, 'scanResults', result);
    await writeLocalRecord(transaction, 'journalEntries', journalEntry);
  });
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
  await withWriteTransaction(async (transaction) => {
    await writeLocalRecord(transaction, 'labResults', result);
    if (document) await writeLocalRecord(transaction, 'documents', document);
    if (plan) await writeLocalRecord(transaction, 'carePlanItems', plan);
    if (event)
      await writeLocalRecord(transaction, 'recommendationEvents', event);
    if (journalEntry)
      await writeLocalRecord(transaction, 'journalEntries', journalEntry);
  });
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
  await withWriteTransaction(async (transaction) => {
    for (const item of items)
      await writeLocalRecord(transaction, 'carePlanItems', item);
    for (const event of events)
      await writeLocalRecord(transaction, 'recommendationEvents', event);
    for (const trigger of triggers)
      await writeLocalRecord(transaction, 'agentTriggers', trigger);
    for (const reminder of reminders)
      await writeLocalRecord(transaction, 'reminders', reminder);
  });
}

export async function tombstoneLocalDocumentBundle(
  document: HealthEntityMap['documents'],
  labResults: HealthEntityMap['labResults'][],
  enqueue = true,
  removeLocalFile?: () => Promise<void>,
) {
  const now = Date.now();
  await withWriteTransaction(async (transaction) => {
    await writeLocalRecord(
      transaction,
      'documents',
      { ...document, deletedAt: now, updatedAt: now },
      enqueue,
    );
    for (const result of labResults.filter(
      (item) =>
        !item.deletedAt &&
        (item.sourceDocumentLocalId === document.localId ||
          document.linkedLabResultLocalId === item.localId),
    )) {
      await writeLocalRecord(
        transaction,
        'labResults',
        {
          ...result,
          hasLocalSourceDocument: false,
          sourceDocumentLocalId: undefined,
          localDocumentUri: undefined,
          updatedAt: now,
        },
        enqueue,
      );
    }
    // Keep the SQL transaction open until the owned file has been removed.
    // A filesystem failure rolls the tombstones and association updates back
    // instead of leaving an undeclared medical file behind.
    if (removeLocalFile) await removeLocalFile();
  });
}

export async function tombstoneLocalChatConversation(
  conversation: ChatConversation,
  messages: ChatMessage[],
  enqueue: boolean,
) {
  const tombstones = createChatTombstones(conversation, messages);
  await withWriteTransaction(async (transaction) => {
    await writeLocalRecord(
      transaction,
      'chatConversations',
      tombstones.conversation,
      enqueue,
    );
    for (const message of tombstones.messages) {
      await writeLocalRecord(transaction, 'chatMessages', message, enqueue);
    }
  });
}

export async function enqueueLocalChatSnapshot(
  conversations: ChatConversation[],
  messages: ChatMessage[],
) {
  await withWriteTransaction(async (transaction) => {
    for (const conversation of conversations) {
      await writeLocalRecord(
        transaction,
        'chatConversations',
        conversation,
        true,
      );
    }
    for (const message of messages) {
      await writeLocalRecord(transaction, 'chatMessages', message, true);
    }
  });
}

export async function clearPendingChatOutbox() {
  await withWriteTransaction(async (transaction) => {
    await transaction.runAsync(
      "DELETE FROM outbox WHERE entity IN ('chatConversations', 'chatMessages')",
    );
  });
}

export async function clearLocalAgentData() {
  await withWriteTransaction(async (transaction) => {
    await transaction.execAsync(
      "DELETE FROM records WHERE entity IN ('carePlanItems', 'agentTriggers', 'recommendationEvents') OR (entity = 'reminders' AND local_id LIKE 'agent-prep\\_%' ESCAPE '\\'); DELETE FROM outbox WHERE entity IN ('carePlanItems', 'agentTriggers', 'recommendationEvents') OR (entity = 'reminders' AND local_id LIKE 'agent-prep\\_%' ESCAPE '\\'); DELETE FROM agent_search_fts WHERE entity = 'carePlanItems'; DELETE FROM settings WHERE key IN ('agentPlanNotification.v1', 'agentAutomationLease.v1', 'agentBackgroundAuthorization.v1');",
    );
  });
}

export async function pendingOutbox() {
  const db = await database();
  const rows = await db.getAllAsync<OutboxRow>(
    'SELECT id, entity, payload FROM outbox ORDER BY id LIMIT 100',
  );
  return rows.map((row) => ({
    id: row.id,
    entity: row.entity,
    payload: JSON.parse(row.payload) as HealthEntityMap[HealthEntityName],
  }));
}

function ftsQuery(query: string) {
  return query
    .normalize('NFKC')
    .toLowerCase()
    .match(/[\p{L}\p{N}]{2,}/gu)
    ?.slice(0, 8)
    .map((token) => `"${token.replaceAll('"', '""')}"*`)
    .join(' OR ');
}

export async function searchLocalAgentIndex({
  entities,
  limit = 12,
  query,
}: {
  entities: HealthEntityName[];
  limit?: number;
  query: string;
}): Promise<AgentSearchHit[]> {
  const match = ftsQuery(query);
  if (!match || !entities.length) return [];
  const allowed = entities.filter((entity) => searchableEntities.has(entity));
  if (!allowed.length) return [];
  const placeholders = allowed.map(() => '?').join(',');
  const db = await database();
  return await db.getAllAsync<AgentSearchHit>(
    `SELECT entity, local_id AS localId, occurred_at AS occurredAt
     FROM agent_search_fts
     WHERE agent_search_fts MATCH ? AND entity IN (${placeholders})
     ORDER BY bm25(agent_search_fts), occurred_at DESC
     LIMIT ?`,
    match,
    ...allowed,
    Math.max(1, Math.min(limit, 24)),
  );
}

export async function acknowledgeOutbox(ids: number[]) {
  if (!ids.length) return;
  const placeholders = ids.map(() => '?').join(',');
  await withWriteTransaction(async (db) => {
    await db.runAsync(`DELETE FROM outbox WHERE id IN (${placeholders})`, ids);
  });
}

export async function mergeRemoteSnapshot(remote: RemoteSnapshot) {
  const local = await loadLocalSnapshot();
  for (const entity of Object.keys(remote) as HealthEntityName[]) {
    for (const remoteItem of remote[entity]) {
      const localItem = local[entity].find(
        (item) => item.localId === remoteItem.localId,
      );
      const {
        _id: _remoteId,
        _creationTime: _remoteCreationTime,
        profileId: _remoteProfileId,
        ...portableItem
      } = remoteItem;
      let merged: Record<string, unknown> =
        entity === 'scanResults' && localItem && 'localImageUri' in localItem
          ? { ...portableItem, localImageUri: localItem.localImageUri }
          : entity === 'labResults' &&
              localItem &&
              'localDocumentUri' in localItem
            ? { ...portableItem, localDocumentUri: localItem.localDocumentUri }
            : entity === 'documents' && localItem && 'localFileUri' in localItem
              ? { ...portableItem, localFileUri: localItem.localFileUri }
              : portableItem;
      if (entity === 'scanResults') {
        const portableScan = portableItem as Record<string, unknown>;
        merged = {
          ...merged,
          resultSource:
            portableScan.resultSource ??
            (portableScan.confidence === 'manual' ? 'manual' : 'stripcv'),
          confidence:
            typeof portableScan.confidence === 'number'
              ? portableScan.confidence
              : undefined,
          confirmedByUser: portableScan.confirmedByUser ?? true,
        };
      }
      if (
        entity === 'chatMessages' &&
        localItem &&
        'attachments' in localItem
      ) {
        const localAttachments = new Map(
          localItem.attachments.map((attachment) => [
            attachment.localId,
            attachment,
          ]),
        );
        merged = {
          ...merged,
          attachments: (
            ((portableItem as Record<string, unknown>).attachments ??
              []) as Array<{
              localId: string;
              [key: string]: unknown;
            }>
          ).map((attachment) => {
            const localAttachment = localAttachments.get(attachment.localId);
            return localAttachment?.localUri
              ? { ...attachment, ...localAttachment, availableLocally: true }
              : { ...attachment, availableLocally: false };
          }),
        };
      }
      await saveLocalRecord(entity, merged as never, false);
    }
  }
}

export async function clearLocalHealthData() {
  await withWriteTransaction(async (db) => {
    await db.execAsync(
      "DELETE FROM records; DELETE FROM outbox; DELETE FROM telemetry_outbox; DELETE FROM agent_search_fts; DELETE FROM settings WHERE key = 'profile';",
    );
  });
}

export async function enqueueTelemetryEvent(event: AnonymousTelemetryEvent) {
  await withWriteTransaction(async (db) => {
    await db.runAsync(
      `INSERT INTO telemetry_outbox(event_id, payload, occurred_at, attempts)
       VALUES (?, ?, ?, 0)
       ON CONFLICT(event_id) DO NOTHING`,
      event.eventId,
      JSON.stringify(event),
      event.occurredAt,
    );
  });
}

export async function loadPendingTelemetryEvents(limit = 50) {
  const db = await database();
  const rows = await db.getAllAsync<{
    payload: string;
    attempts: number;
  }>(
    `SELECT payload, attempts FROM telemetry_outbox
     ORDER BY occurred_at ASC LIMIT ?`,
    Math.max(1, Math.min(limit, 50)),
  );
  return rows.map(
    (row) =>
      ({
        ...(JSON.parse(row.payload) as AnonymousTelemetryEvent),
        attempts: row.attempts,
      }) satisfies PendingTelemetryEvent,
  );
}

export async function acknowledgeTelemetryEvents(eventIds: string[]) {
  if (eventIds.length === 0) return;
  await withWriteTransaction(async (db) => {
    for (const eventId of eventIds) {
      await db.runAsync('DELETE FROM telemetry_outbox WHERE event_id = ?', eventId);
    }
  });
}

export async function markTelemetryAttempt(eventIds: string[]) {
  if (eventIds.length === 0) return;
  await withWriteTransaction(async (db) => {
    for (const eventId of eventIds) {
      await db.runAsync(
        'UPDATE telemetry_outbox SET attempts = attempts + 1 WHERE event_id = ?',
        eventId,
      );
    }
  });
}

export async function clearPendingTelemetryEvents() {
  await withWriteTransaction(async (db) => {
    await db.runAsync('DELETE FROM telemetry_outbox');
  });
}

export type LocalStorageDiagnostics = {
  databaseBytes: number;
  walBytes: number;
  shmBytes: number;
  pageCount: number;
  freelistCount: number;
  recordCounts: Record<string, number>;
  outboxCount: number;
  nextBatchCount: number;
  remainingBatches: number;
  uploadEstimateBytes: number;
  telemetryCount: number;
  telemetryBytes: number;
  telemetryMaxAttempts: number;
  lastSuccessfulSyncAt?: number;
};

export async function loadLocalStorageDiagnostics(): Promise<LocalStorageDiagnostics> {
  const db = await database();
  const [page, freelist, outbox, telemetry, sync, recordRows] = await Promise.all([
    db.getFirstAsync<{ page_count: number }>('PRAGMA page_count'),
    db.getFirstAsync<{ freelist_count: number }>('PRAGMA freelist_count'),
    db.getAllAsync<{ entity: HealthEntityName; payload: string }>(
      'SELECT entity, payload FROM outbox ORDER BY id',
    ),
    db.getFirstAsync<{ count: number; bytes: number; maxAttempts: number }>(
      'SELECT COUNT(*) count, COALESCE(SUM(length(CAST(payload AS BLOB))), 0) bytes, COALESCE(MAX(attempts), 0) maxAttempts FROM telemetry_outbox',
    ),
    db.getFirstAsync<{ value: string }>(
      "SELECT value FROM settings WHERE key = 'lastSuccessfulSyncAt.v1'",
    ),
    db.getAllAsync<{ entity: string; count: number }>(
      'SELECT entity, COUNT(*) count FROM records GROUP BY entity',
    ),
  ]);
  let uploadEstimateBytes = 0;
  for (const row of outbox) {
    const sanitized = sanitizeCloudRecord(
      row.entity,
      JSON.parse(row.payload) as Record<string, unknown>,
    );
    uploadEstimateBytes += utf8ByteLength(JSON.stringify(sanitized));
  }
  const fileSize = async (uri: string) => {
    const result = await FileSystem.getInfoAsync(uri);
    return result.exists && !result.isDirectory ? result.size ?? 0 : 0;
  };
  const databaseUri = `${FileSystem.documentDirectory}SQLite/${DATABASE_NAME}`;
  return {
    databaseBytes: await fileSize(databaseUri),
    walBytes: await fileSize(`${databaseUri}-wal`),
    shmBytes: await fileSize(`${databaseUri}-shm`),
    pageCount: page?.page_count ?? 0,
    freelistCount: freelist?.freelist_count ?? 0,
    recordCounts: Object.fromEntries(
      recordRows.map((row) => [row.entity, row.count]),
    ),
    outboxCount: outbox.length,
    nextBatchCount: Math.min(outbox.length, 100),
    remainingBatches: Math.ceil(outbox.length / 100),
    uploadEstimateBytes,
    telemetryCount: telemetry?.count ?? 0,
    telemetryBytes: telemetry?.bytes ?? 0,
    telemetryMaxAttempts: telemetry?.maxAttempts ?? 0,
    lastSuccessfulSyncAt: sync ? Number(JSON.parse(sync.value)) : undefined,
  };
}

export async function quickCheckLocalDatabase() {
  const db = await database();
  const rows = await db.getAllAsync<Record<string, string>>('PRAGMA quick_check');
  const values = rows.flatMap((row) => Object.values(row));
  return values.length === 1 && values[0] === 'ok' ? 'ok' : 'failed';
}
