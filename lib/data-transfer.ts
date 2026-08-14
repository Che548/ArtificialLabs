import type {
  HealthEntityMap,
  HealthEntityName,
  HealthSnapshot,
  LocalProfile,
} from './health-types';

export const DATA_ARCHIVE_VERSION = 1 as const;

export type ImportPreview = {
  profile: LocalProfile | null;
  records: Partial<{ [K in HealthEntityName]: HealthEntityMap[K][] }>;
  counts: Partial<Record<HealthEntityName | 'profile', number>>;
  total: number;
};

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

function portableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(portableValue);
  if (!value || typeof value !== 'object') return value;
  const portable: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (
      key === 'localImageUri' ||
      key === 'localDocumentUri' ||
      key === 'localFileUri' ||
      key === 'localUri'
    )
      continue;
    portable[key] = key === 'availableLocally' ? false : portableValue(nested);
  }
  return portable;
}

export function createJsonArchive(snapshot: HealthSnapshot) {
  const entities = Object.fromEntries(
    entityNames.map((entity) => [entity, portableValue(snapshot[entity])]),
  );
  return JSON.stringify(
    {
      schema: 'artificiallabs-health-archive',
      version: DATA_ARCHIVE_VERSION,
      exportedAt: Date.now(),
      profile: snapshot.profile,
      entities,
    },
    null,
    2,
  );
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

export function createEntityCsv<K extends HealthEntityName>(
  entity: K,
  records: HealthEntityMap[K][],
) {
  const lines = ['entity,localId,updatedAt,deletedAt,payload'];
  for (const record of records) {
    const { localId, updatedAt, deletedAt, ...payload } = portableValue(
      record,
    ) as HealthEntityMap[K];
    lines.push(
      [entity, localId, updatedAt, deletedAt ?? '', JSON.stringify(payload)]
        .map(csvCell)
        .join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

function parseCsvRows(input: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted && character === '"' && input[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && input[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  if (quoted) throw new Error('CSV_UNTERMINATED_QUOTE');
  return rows;
}

function assertPortableRecord(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('INVALID_RECORD');
  const record = value as Record<string, unknown>;
  if (typeof record.localId !== 'string' || !record.localId)
    throw new Error('INVALID_LOCAL_ID');
  if (typeof record.updatedAt !== 'number' || !Number.isFinite(record.updatedAt))
    throw new Error('INVALID_UPDATED_AT');
  const serialized = JSON.stringify(record);
  if (/local(Image|Document|File)?Uri/i.test(serialized))
    throw new Error('LOCAL_URI_NOT_IMPORTABLE');
  return record;
}

export function parseImportPayload(text: string): ImportPreview {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('EMPTY_IMPORT');
  if (trimmed.startsWith('{')) {
    const archive = JSON.parse(trimmed) as Record<string, unknown>;
    if (
      archive.schema !== 'artificiallabs-health-archive' ||
      archive.version !== DATA_ARCHIVE_VERSION ||
      !archive.entities ||
      typeof archive.entities !== 'object'
    )
      throw new Error('UNSUPPORTED_ARCHIVE');
    const records: ImportPreview['records'] = {};
    const counts: ImportPreview['counts'] = {};
    let total = 0;
    for (const entity of entityNames) {
      const raw = (archive.entities as Record<string, unknown>)[entity];
      if (raw === undefined) continue;
      if (!Array.isArray(raw)) throw new Error(`INVALID_${entity}`);
      const rows = raw.map(assertPortableRecord) as never;
      records[entity] = rows;
      counts[entity] = raw.length;
      total += raw.length;
    }
    const profile = archive.profile
      ? (archive.profile as LocalProfile)
      : null;
    if (profile) {
      if (
        typeof profile.displayName !== 'string' ||
        typeof profile.updatedAt !== 'number'
      )
        throw new Error('INVALID_PROFILE');
      counts.profile = 1;
      total += 1;
    }
    return { profile, records, counts, total };
  }

  const rows = parseCsvRows(trimmed);
  const header = rows.shift()?.join(',');
  if (header !== 'entity,localId,updatedAt,deletedAt,payload')
    throw new Error('UNSUPPORTED_CSV');
  const records: ImportPreview['records'] = {};
  const counts: ImportPreview['counts'] = {};
  for (const row of rows) {
    if (row.length !== 5) throw new Error('INVALID_CSV_ROW');
    const [entityValue, localId, updatedAtValue, deletedAtValue, payload] = row;
    if (!entityNames.includes(entityValue as HealthEntityName))
      throw new Error('INVALID_ENTITY');
    const entity = entityValue as HealthEntityName;
    const updatedAt = Number(updatedAtValue);
    const deletedAt = deletedAtValue ? Number(deletedAtValue) : undefined;
    const record = assertPortableRecord({
      ...JSON.parse(payload),
      localId,
      updatedAt,
      deletedAt,
    });
    const target = (records[entity] ?? []) as unknown[];
    target.push(record);
    records[entity] = target as never;
    counts[entity] = (counts[entity] ?? 0) + 1;
  }
  return {
    profile: null,
    records,
    counts,
    total: Object.values(counts).reduce((sum, count) => sum + (count ?? 0), 0),
  };
}
