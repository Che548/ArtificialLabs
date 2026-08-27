const {
  AndroidConfig,
  withAndroidManifest,
  withGradleProperties,
  withSettingsGradle,
} = require('@expo/config-plugins');

/**
 * Expo SDK 54's generated manifest does not include smallestScreenSize. On
 * Android 16, a display/configuration change can then recreate MainActivity
 * while Expo Router's previous linking handler is still mounted.
 */
function withAndroidConfigChanges(config) {
  const withManifest = withAndroidManifest(config, (androidConfig) => {
    const application = androidConfig.modResults.manifest.application?.[0];
    if (
      application &&
      process.env.EXPO_PUBLIC_E2E_MODE === '1' &&
      /^http:\/\/(127\.0\.0\.1|localhost|10\.0\.2\.2)(?::|\/|$)/.test(
        process.env.EXPO_PUBLIC_E2E_OTA_URL ?? '',
      )
    ) {
      application.$['android:usesCleartextTraffic'] = 'true';
    }
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(
      androidConfig.modResults,
    );
    const current = mainActivity.$['android:configChanges'] ?? '';
    const values = new Set(current.split('|').filter(Boolean));
    values.add('smallestScreenSize');
    mainActivity.$['android:configChanges'] = [...values].join('|');
    return androidConfig;
  });
  const withSettings = withSettingsGradle(withManifest, (androidConfig) => {
    androidConfig.modResults.contents = androidConfig.modResults.contents.replace(
      /^rootProject\.name\s*=.*$/m,
      "rootProject.name = 'ArtificialLabs'",
    );
    return androidConfig;
  });
  return withGradleProperties(withSettings, (androidConfig) => {
    const key = 'org.gradle.jvmargs';
    const value = '-Xmx4096m -XX:MaxMetaspaceSize=1024m';
    const existing = androidConfig.modResults.find(
      (entry) => entry.type === 'property' && entry.key === key,
    );
    if (existing) existing.value = value;
    else androidConfig.modResults.push({ type: 'property', key, value });
    return androidConfig;
  });
}

module.exports = withAndroidConfigChanges;
