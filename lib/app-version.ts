import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

function short(value: string | null | undefined, fallback: string) {
  return value && value !== 'development' ? value.slice(0, 8) : fallback;
}

function manifestCommit() {
  const manifest = Updates.manifest as Record<string, unknown> | null;
  const metadata = manifest?.metadata as Record<string, unknown> | undefined;
  if (typeof metadata?.sourceCommit === 'string') return metadata.sourceCommit;
  const extra = manifest?.extra as Record<string, unknown> | undefined;
  const expoClient = extra?.expoClient as Record<string, unknown> | undefined;
  const clientExtra = expoClient?.extra as Record<string, unknown> | undefined;
  return typeof clientExtra?.gitCommit === 'string'
    ? clientExtra.gitCommit
    : undefined;
}

export function getAppVersionInfo() {
  const gitCommit = manifestCommit() ?? process.env.EXPO_PUBLIC_GIT_COMMIT;
  return {
    appVersion:
      Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '1.0.0',
    buildNumber: Application.nativeBuildVersion ?? 'dev',
    gitCommit: short(gitCommit, 'local'),
    runtimeVersion: Updates.runtimeVersion ?? 'development',
    updateId: Updates.isEmbeddedLaunch ? 'embedded' : short(Updates.updateId, 'unknown'),
    isEmbedded: Updates.isEmbeddedLaunch,
    updateCreatedAt: Updates.createdAt?.getTime(),
  };
}
