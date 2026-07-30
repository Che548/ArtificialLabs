import * as FileSystem from 'expo-file-system/legacy';

async function persist(uri: string, folder: string, extension = 'jpg') {
  if (!FileSystem.documentDirectory) throw new Error('Document storage is unavailable');
  const directory = `${FileSystem.documentDirectory}${folder}/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const destination = `${directory}${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  await FileSystem.copyAsync({ from: uri, to: destination });
  return destination;
}

export const persistScanImage = (uri: string) => persist(uri, 'scan-images');
export const persistLabDocument = (uri: string) => persist(uri, 'lab-documents', 'bin');
