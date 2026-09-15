import type { ConfigContext, ExpoConfig } from 'expo/config';

import base from './app.json';

const baseConfig = base.expo as ExpoConfig;
const e2eMode = process.env.EXPO_PUBLIC_E2E_MODE === '1';
const appStoreBuild = process.env.SFERA_IOS_APP_STORE === '1';
const playStoreBuild = process.env.SFERA_ANDROID_PLAY_STORE === '1';
const androidBuild = process.env.SFERA_ANDROID_VERSION_CODE;
if (playStoreBuild && (!androidBuild || !/^[1-9]\d*$(?![\s\S])/.test(androidBuild) || Number(androidBuild) > 2100000000)) {
  throw new Error('Play builds require a valid SFERA_ANDROID_VERSION_CODE');
}
const releaseVersion = process.env.SFERA_RELEASE_VERSION;
const releaseBuild = process.env.SFERA_IOS_BUILD_NUMBER;
if (releaseVersion && !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$(?![\s\S])/.test(releaseVersion)) {
  throw new Error('Invalid SFERA_RELEASE_VERSION');
}
if (releaseBuild && !/^[1-9]\d*$(?![\s\S])/.test(releaseBuild)) {
  throw new Error('Invalid SFERA_IOS_BUILD_NUMBER');
}
if (appStoreBuild && (!releaseVersion || !releaseBuild)) {
  throw new Error('App Store builds require explicit release version and build number');
}
if ((appStoreBuild || playStoreBuild) && e2eMode) {
  throw new Error('App Store builds must not enable E2E mode');
}
if (playStoreBuild && !releaseVersion) throw new Error('Play builds require SFERA_RELEASE_VERSION');
const updatesBaseUrl = (
  process.env.EXPO_PUBLIC_E2E_OTA_URL ??
  'https://artificiallabs-updates.bebra42.ru'
).replace(/\/$/, '');
const localOtaE2E = /^http:\/\/(127\.0\.0\.1|localhost|10\.0\.2\.2)(?::|\/|$)/.test(
  updatesBaseUrl,
);
const otaCertificate =
  process.env.EXPO_OTA_CODE_SIGNING_CERTIFICATE ??
  './certs/ota-certificate.pem';
const signedUpdatesEnabled =
  !e2eMode || Boolean(process.env.EXPO_OTA_CODE_SIGNING_CERTIFICATE);

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  ...baseConfig,
  ...(appStoreBuild || playStoreBuild ? { version: releaseVersion } : {}),
  ios: {
    ...baseConfig.ios,
    ...(appStoreBuild
      ? {
          bundleIdentifier: 'engineering.brainwaves.sfera',
          appleTeamId: '6HZGXYF43L',
        }
      : {}),
    buildNumber: appStoreBuild ? releaseBuild : (baseConfig.ios?.buildNumber ?? '1'),
    infoPlist: {
      ...(baseConfig.ios?.infoPlist ?? {}),
      // Owner-approved 2026-09-15: standard third-party crypto, no France.
      // No Apple encryption documentation for this questionnaire branch.
      // Reassess with any cryptography or distribution-territory change.
      ITSAppUsesNonExemptEncryption: false,
      ...(localOtaE2E
        ? {
            NSAppTransportSecurity: {
              NSAllowsLocalNetworking: true,
            },
          }
        : {}),
    },
  },
  android: {
    ...baseConfig.android,
    ...(playStoreBuild ? { package: 'engineering.brainwaves.sfera' } : {}),
    versionCode: playStoreBuild ? Number(androidBuild) : (baseConfig.android?.versionCode ?? 1),
  },
  runtimeVersion: { policy: 'fingerprint' },
  updates: {
    enabled: true,
    url: `${updatesBaseUrl}/api/manifest`,
    requestHeaders: {
      'expo-channel-name': 'production',
    },
    checkAutomatically: 'ON_ERROR_RECOVERY',
    fallbackToCacheTimeout: 0,
    ...(signedUpdatesEnabled
      ? {
          codeSigningCertificate: otaCertificate,
          codeSigningMetadata: {
            keyid: 'main',
            alg: 'rsa-v1_5-sha256',
          },
        }
      : {}),
  },
  extra: {
    ...(baseConfig.extra ?? {}),
    updatesHealthUrl: `${updatesBaseUrl}/health`,
  },
});
