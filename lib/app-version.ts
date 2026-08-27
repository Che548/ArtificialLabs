import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

function short(value: string | null | undefined, fallback: string) {
  return value && value !== 'development' ? value.slice(0, 8) : fallback;
}

function activeManifest() {
  const updatesManifest = Updates.manifest as Record<string, unknown> | null;
  if (updatesManifest && Object.keys(updatesManifest).length > 0) {
    return updatesManifest;
  }
  return Constants.manifest2 as Record<string, unknown> | null;
}

function manifestCommit() {
  const manifest = activeManifest();
  const metadata = manifest?.metadata as Record<string, unknown> | undefined;
  if (typeof metadata?.sourceCommit === 'string') return metadata.sourceCommit;
  const extra = manifest?.extra as Record<string, unknown> | undefined;
  const expoClient = extra?.expoClient as Record<string, unknown> | undefined;
  const clientExtra = expoClient?.extra as Record<string, unknown> | undefined;
  return typeof clientExtra?.gitCommit === 'string'
    ? clientExtra.gitCommit
    : undefined;
}

function manifestUpdateId() {
  const manifest = activeManifest();
  return typeof manifest?.id === 'string' ? manifest.id : undefined;
}

function manifestCreatedAt() {
  const manifest = activeManifest();
  if (typeof manifest?.createdAt !== 'string') return undefined;
  const timestamp = Date.parse(manifest.createdAt);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

export function getAppVersionInfo(
  persisted?: { updateId?: string; updateCreatedAt?: number },
) {
  const gitCommit = manifestCommit() ?? process.env.EXPO_PUBLIC_GIT_COMMIT;
  return {
    appVersion:
      Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '1.0.0',
    buildNumber: Application.nativeBuildVersion ?? 'dev',
    gitCommit: short(gitCommit, 'local'),
    runtimeVersion: Updates.runtimeVersion ?? 'development',
    updateId: Updates.isEmbeddedLaunch
      ? 'embedded'
      : short(
          Updates.updateId ?? manifestUpdateId() ?? persisted?.updateId,
          'unknown',
        ),
    isEmbedded: Updates.isEmbeddedLaunch,
    updateCreatedAt:
      Updates.createdAt?.getTime() ??
      manifestCreatedAt() ??
      persisted?.updateCreatedAt,
  };
}
