const {
  AndroidConfig,
  withAppBuildGradle,
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
  const withSigning = withAppBuildGradle(withManifest, (androidConfig) => {
    const marker = 'def releaseSigningConfigured =';
    if (!androidConfig.modResults.contents.includes(marker)) {
      androidConfig.modResults.contents = androidConfig.modResults.contents
        .replace(
          /android \{\n/,
          `def releaseKeystorePath = System.getenv('ANDROID_KEYSTORE_PATH')
def releaseKeystorePassword = System.getenv('ANDROID_KEYSTORE_PASSWORD')
def releaseKeyAlias = System.getenv('ANDROID_KEY_ALIAS')
def releaseKeyPassword = System.getenv('ANDROID_KEY_PASSWORD')
def releaseSigningConfigured = releaseKeystorePath && releaseKeystorePassword && releaseKeyAlias && releaseKeyPassword

android {
`,
        )
        .replace(
          /(signingConfigs \{\n\s+debug \{[\s\S]*?\n\s+}\n)(\s+})/,
          `$1        release {
            if (releaseSigningConfigured) {
                storeFile file(releaseKeystorePath)
                storePassword releaseKeystorePassword
                keyAlias releaseKeyAlias
                keyPassword releaseKeyPassword
            }
        }
$2`,
        )
        .replace(
          'signingConfig signingConfigs.debug\n            def enableShrinkResources',
          'signingConfig releaseSigningConfigured ? signingConfigs.release : signingConfigs.debug\n            def enableShrinkResources',
        );

      androidConfig.modResults.contents += `

gradle.taskGraph.whenReady { taskGraph ->
    def releaseTaskRequested = taskGraph.allTasks.any { task ->
        task.name.toLowerCase().contains('release')
    }
    if (releaseTaskRequested && !releaseSigningConfigured) {
        throw new GradleException('Release signing requires ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, and ANDROID_KEY_PASSWORD.')
    }
}
`;
    }
    return androidConfig;
  });
  const withSettings = withSettingsGradle(withSigning, (androidConfig) => {
    androidConfig.modResults.contents = androidConfig.modResults.contents.replace(
      /^rootProject\.name\s*=.*$/m,
      "rootProject.name = 'ArtificialLabs'",
    );
    return androidConfig;
  });
  return withGradleProperties(withSettings, (androidConfig) => {
    const properties = {
      'org.gradle.jvmargs': '-Xmx4096m -XX:MaxMetaspaceSize=1024m',
      // AAPT2 can spend minutes recompressing the large PNG artwork and time
      // out on macOS. The source PNGs are already compressed; Play also
      // optimizes assets when generating device-specific APKs from the AAB.
      'android.enablePngCrunchInReleaseBuilds': 'false',
    };
    for (const [key, value] of Object.entries(properties)) {
      const existing = androidConfig.modResults.find(
        (entry) => entry.type === 'property' && entry.key === key,
      );
      if (existing) existing.value = value;
      else androidConfig.modResults.push({ type: 'property', key, value });
    }
    return androidConfig;
  });
}

module.exports = withAndroidConfigChanges;
