import * as FileSystem from 'expo-file-system/legacy';
const path = FileSystem.cacheDirectory
  ? `${FileSystem.cacheDirectory}public-today-articles-v1.json`
  : null;
// This cache contains public editorial copy only, never local journal data.
export async function readTodayContentCache(): Promise<unknown> {
  if (!path) return undefined;
  try {
    return JSON.parse(await FileSystem.readAsStringAsync(path));
  } catch {
    return undefined;
  }
}
let pendingWrite = Promise.resolve();
export function writeTodayContentCache(value: unknown) {
  if (!path) return;
  const serialized = JSON.stringify(value);
  pendingWrite = pendingWrite
    .then(() => FileSystem.writeAsStringAsync(path, serialized))
    .catch(() => {});
}
