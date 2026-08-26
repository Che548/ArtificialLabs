const {
  AndroidConfig,
  withAndroidManifest,
} = require('@expo/config-plugins');

/**
 * Expo SDK 54's generated manifest does not include smallestScreenSize. On
 * Android 16, a display/configuration change can then recreate MainActivity
 * while Expo Router's previous linking handler is still mounted.
 */
function withAndroidConfigChanges(config) {
  return withAndroidManifest(config, (androidConfig) => {
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(
      androidConfig.modResults,
    );
    const current = mainActivity.$['android:configChanges'] ?? '';
    const values = new Set(current.split('|').filter(Boolean));
    values.add('smallestScreenSize');
    mainActivity.$['android:configChanges'] = [...values].join('|');
    return androidConfig;
  });
}

module.exports = withAndroidConfigChanges;
