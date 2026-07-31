import {
  copyAsync,
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import { Platform } from 'react-native';

export type StoredScanResult =
  | 'Положительный'
  | 'Отрицательный'
  | 'Пик ЛГ';

export type StoredScanType = 'Ovulation LH' | 'Pregnancy hCG';

export type StoredScanRecord = {
  batch: string;
  capturedAt: number;
  confidence: number;
  date: string;
  day: string;
  id: string;
  imageUri: string;
  result: StoredScanResult;
  time: string;
  type: StoredScanType;
};

export type PendingScanRecord = Pick<
  StoredScanRecord,
  'batch' | 'confidence' | 'imageUri' | 'result' | 'type'
>;

const historyDirectory = documentDirectory
  ? `${documentDirectory}scan-history/`
  : null;
const historyFile = historyDirectory
  ? `${historyDirectory}records.json`
  : null;
let webHistory: StoredScanRecord[] = [];

function sortNewestFirst(records: StoredScanRecord[]) {
  return [...records].sort((left, right) => right.capturedAt - left.capturedAt);
}

async function ensureHistoryDirectory() {
  if (!historyDirectory) {
    return;
  }

  const info = await getInfoAsync(historyDirectory);
  if (!info.exists) {
    await makeDirectoryAsync(historyDirectory, { intermediates: true });
  }
}

function formatRecord(
  pending: PendingScanRecord,
  id: string,
  capturedAt: number,
  imageUri: string,
): StoredScanRecord {
  const capturedDate = new Date(capturedAt);

  return {
    ...pending,
    capturedAt,
    date: new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
    }).format(capturedDate),
    day: new Intl.DateTimeFormat('ru-RU', { day: '2-digit' })
      .format(capturedDate)
      .replace(/^0/, ''),
    id,
    imageUri,
    time: new Intl.DateTimeFormat('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(capturedDate),
  };
}

export async function loadScanHistory(): Promise<StoredScanRecord[]> {
  if (Platform.OS === 'web' || !historyFile) {
    return sortNewestFirst(webHistory);
  }

  try {
    const info = await getInfoAsync(historyFile);
    if (!info.exists) {
      return [];
    }

    const stored = JSON.parse(
      await readAsStringAsync(historyFile),
    ) as StoredScanRecord[];
    return sortNewestFirst(
      stored.filter(
        (record) =>
          typeof record?.capturedAt === 'number' &&
          typeof record?.imageUri === 'string' &&
          record.imageUri.length > 0,
      ),
    );
  } catch {
    return [];
  }
}

export async function saveScanToHistory(
  pending: PendingScanRecord,
): Promise<StoredScanRecord> {
  const capturedAt = Date.now();
  const id = `scan-${capturedAt}-${Math.random().toString(36).slice(2, 8)}`;

  if (Platform.OS === 'web' || !historyDirectory || !historyFile) {
    const record = formatRecord(
      pending,
      id,
      capturedAt,
      pending.imageUri,
    );
    webHistory = sortNewestFirst([record, ...webHistory]);
    return record;
  }

  await ensureHistoryDirectory();
  const extensionMatch = pending.imageUri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  const extension = extensionMatch?.[1]?.toLowerCase() ?? 'jpg';
  const permanentImageUri = `${historyDirectory}${id}.${extension}`;
  await copyAsync({ from: pending.imageUri, to: permanentImageUri });

  const record = formatRecord(
    pending,
    id,
    capturedAt,
    permanentImageUri,
  );
  const records = sortNewestFirst([record, ...(await loadScanHistory())]);
  await writeAsStringAsync(historyFile, JSON.stringify(records));
  return record;
}
