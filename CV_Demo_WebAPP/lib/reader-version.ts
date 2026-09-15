import manifest from '../../modules/strip-cv/models/reader-20260914/manifest.json';

// The same frozen manifest is packaged into the installed native application.
export const EXPECTED_READER_VERSION = manifest.algorithm_version;

export function matchesCurrentReader(output: string): boolean {
  try {
    return JSON.parse(output)?.algorithm_version === EXPECTED_READER_VERSION;
  } catch {
    return false;
  }
}
