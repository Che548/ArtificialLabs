import * as FileSystem from 'expo-file-system/legacy';
import { createLocalDocumentEngine } from '../modules/document-ocr';
import { DOCUMENT_LIMITS, validateDocumentMetadata } from '../shared/document-policy';

async function persist(uri: string, folder: string, extension = 'jpg') {
  if (!FileSystem.documentDirectory)
    throw new Error('Document storage is unavailable');
  const directory = `${FileSystem.documentDirectory}${folder}/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const destination = `${directory}${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  try {
    await FileSystem.copyAsync({ from: uri, to: destination });
    return destination;
  } catch (error) {
    await FileSystem.deleteAsync(destination, { idempotent: true }).catch(
      () => {},
    );
    throw error;
  }
}

async function deleteWithin(uri: string, directory: string | null) {
  if (!directory || !uri.startsWith(directory)) return;
  await FileSystem.deleteAsync(uri, { idempotent: true });
}

export const persistScanImage = (uri: string) => persist(uri, 'scan-images');
export async function persistLabDocument(uri: string) {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || info.isDirectory || info.size <= 0 || info.size > DOCUMENT_LIMITS.bytes) throw new Error('DOCUMENT_SIZE');
  const destination = await persist(uri, 'lab-documents', 'bin');
  let engine: ReturnType<typeof createLocalDocumentEngine> | undefined;
  try {
    engine = createLocalDocumentEngine();
    const metadata = await engine.inspect(destination);
    validateDocumentMetadata(metadata.mime, metadata.bytes, metadata.pages);
    return destination;
  } catch (error) {
    await discardPersistedLabDocument(destination);
    throw error;
  } finally { await engine?.cleanup(); }
}
export const persistChatAttachment = (uri: string) =>
  persist(uri, 'chat-attachments', 'bin');

export const discardTemporaryScanImage = (uri: string) =>
  deleteWithin(uri, FileSystem.cacheDirectory);

export const discardPersistedScanImage = (uri: string) =>
  deleteWithin(
    uri,
    FileSystem.documentDirectory
      ? `${FileSystem.documentDirectory}scan-images/`
      : null,
  );

export const discardPersistedChatAttachment = (uri: string) =>
  deleteWithin(
    uri,
    FileSystem.documentDirectory
      ? `${FileSystem.documentDirectory}chat-attachments/`
      : null,
  );

export const discardPersistedLabDocument = (uri: string) =>
  deleteWithin(
    uri,
    FileSystem.documentDirectory
      ? `${FileSystem.documentDirectory}lab-documents/`
      : null,
  );

/** A store callback may throw after its local transaction committed. Never erase a linked file. */
export async function discardUnreferencedLabDocument(uri: string) {
  try {
    const { loadLocalSnapshot } = await import('./local-database');
    const snapshot = await loadLocalSnapshot();
    if (snapshot.documents.some(document => !document.deletedAt && document.localFileUri === uri) ||
        snapshot.labResults.some(result => !result.deletedAt && result.localDocumentUri === uri)) return;
    await discardPersistedLabDocument(uri);
  } catch {
    // When persistence cannot be checked, retaining a private orphan is safer than deleting user data.
  }
}

export async function clearLocalHealthFiles() {
  if (!FileSystem.documentDirectory) return;
  for (const folder of [
    'scan-images',
    'scan-history',
    'lab-documents',
    'chat-attachments',
  ]) {
    await FileSystem.deleteAsync(`${FileSystem.documentDirectory}${folder}/`, {
      idempotent: true,
    });
  }
}

async function folderDiagnostics(folder: string) {
  if (!FileSystem.documentDirectory) return { count: 0, bytes: 0 };
  const directory = `${FileSystem.documentDirectory}${folder}/`;
  const directoryInfo = await FileSystem.getInfoAsync(directory);
  if (!directoryInfo.exists || !directoryInfo.isDirectory)
    return { count: 0, bytes: 0 };
  const names = await FileSystem.readDirectoryAsync(directory);
  let count = 0;
  let bytes = 0;
  for (const name of names) {
    const info = await FileSystem.getInfoAsync(`${directory}${name}`);
    if (info.exists && !info.isDirectory) {
      count += 1;
      bytes += info.size ?? 0;
    }
  }
  return { count, bytes };
}

export async function loadLocalFileDiagnostics() {
  const [scanImages, labDocuments, chatAttachments] = await Promise.all([
    folderDiagnostics('scan-images'),
    folderDiagnostics('lab-documents'),
    folderDiagnostics('chat-attachments'),
  ]);
  return { scanImages, labDocuments, chatAttachments };
}
