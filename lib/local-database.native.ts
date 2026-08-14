import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';

import type {
  HealthEntityMap,
  HealthEntityName,
  HealthSnapshot,
  JournalEntry,
  LocalProfile,
  ScanResult,
} from './health-types';
import { createEmptySnapshot } from './health-types';

const DATABASE_NAME = 'artificiallabs.db';
const DATABASE_KEY_NAME = 'artificiallabs.database-key.v1';
let databasePromise: Promise<SQLite.SQLiteDatabase> | undefined;
let writeQueue = Promise.resolve();

type OutboxRow = {
  id: number;
  entity: HealthEntityName;
  payload: string;
};

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
  `);
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
    await transaction.execAsync('DELETE FROM records; DELETE FROM outbox; DELETE FROM settings;');
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

async function writeLocalRecord<K extends HealthEntityName>(
  transaction: SQLite.SQLiteDatabase,
  entity: K,
  item: HealthEntityMap[K],
  enqueue = true,
) {
  const payload = JSON.stringify(item);
  const occurredAt =
    'occurredAt' in item
      ? item.occurredAt
      : 'capturedAt' in item
        ? item.capturedAt
        : 'collectedAt' in item
          ? item.collectedAt
          : 'dueAt' in item
            ? item.dueAt
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
  await transaction.runAsync(
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
            : entity === 'documents' &&
                localItem &&
                'localFileUri' in localItem
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
      if (entity === 'chatMessages' && localItem && 'attachments' in localItem) {
        const localAttachments = new Map(
          localItem.attachments.map((attachment) => [
            attachment.localId,
            attachment,
          ]),
        );
        merged = {
          ...merged,
          attachments: (
            ((portableItem as Record<string, unknown>).attachments ?? []) as Array<{
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
      "DELETE FROM records; DELETE FROM outbox; DELETE FROM settings WHERE key = 'profile';",
    );
  });
}
