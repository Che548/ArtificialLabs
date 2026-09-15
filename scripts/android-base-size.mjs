// Conservative archive budget, not a per-device Play download-size estimate.
// Summing ALL base entries/ABIs deliberately leaves room for APK generation.
export function checkAndroidBaseSize(zipInfo, budget = 480_000_000) {
  let bytes = 0;
  let entries = 0;
  for (const line of zipInfo.split('\n')) {
    const fields = line.trim().split(/\s+/);
    if (fields.length < 10 || !fields.slice(9).join(' ').startsWith('base/')) continue;
    const compressed = Number(fields[5]);
    if (!Number.isSafeInteger(compressed) || compressed < 0) throw new Error('Invalid AAB size listing');
    bytes += compressed;
    entries++;
  }
  if (!entries) throw new Error('Missing AAB base entries');
  if (bytes > budget) throw new Error(`Android base archive exceeds ${budget} byte safety budget: ${bytes}. Reduce assets before upload.`);
  return { bytes, entries };
}
