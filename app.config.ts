import type { ConfigContext, ExpoConfig } from 'expo/config';

import base from './app.json';

const baseConfig = base.expo as ExpoConfig;
const e2eMode = process.env.EXPO_PUBLIC_E2E_MODE === '1';
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

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  ...baseConfig,
  ios: {
    ...baseConfig.ios,
    buildNumber: baseConfig.ios?.buildNumber ?? '1',
    infoPlist: {
      ...(baseConfig.ios?.infoPlist ?? {}),
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
    versionCode: baseConfig.android?.versionCode ?? 1,
    ...(localOtaE2E ? { usesCleartextTraffic: true } : {}),
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
    ...(e2eMode
      ? {}
      : {
          codeSigningCertificate: otaCertificate,
          codeSigningMetadata: {
            keyid: 'main',
            alg: 'rsa-v1_5-sha256',
          },
        }),
  },
  extra: {
    ...(baseConfig.extra ?? {}),
    updatesHealthUrl: `${updatesBaseUrl}/health`,
  },
});
