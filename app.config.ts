import type { ConfigContext, ExpoConfig } from 'expo/config';

import base from './app.json';

const baseConfig = base.expo as ExpoConfig;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  ...baseConfig,
  ios: {
    ...baseConfig.ios,
    buildNumber: baseConfig.ios?.buildNumber ?? '1',
  },
  android: {
    ...baseConfig.android,
    versionCode: baseConfig.android?.versionCode ?? 1,
  },
  runtimeVersion: { policy: 'fingerprint' },
  updates: {
    enabled: true,
    url: 'https://artificiallabs-updates.bebra42.ru/api/manifest',
    requestHeaders: {
      'expo-channel-name': 'production',
    },
    checkAutomatically: 'ON_ERROR_RECOVERY',
    fallbackToCacheTimeout: 0,
    codeSigningCertificate: './certs/ota-certificate.pem',
    codeSigningMetadata: {
      keyid: 'main',
      alg: 'rsa-v1_5-sha256',
    },
  },
  extra: {
    ...(baseConfig.extra ?? {}),
    updatesHealthUrl: 'https://artificiallabs-updates.bebra42.ru/health',
  },
});
