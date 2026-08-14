const { withAppDelegate, withXcodeProject } = require('@expo/config-plugins');

const BUNDLE_PHASE_NAME = '"Bundle React Native code and images"';
const DEBUG_SKIP_BUNDLING_BLOCK =
  '\\nif [[ \\"$CONFIGURATION\\" = *Debug* ]]; then\\n  export SKIP_BUNDLING=1\\nfi\\n';
const XCODE_MARKER =
  '# ArtificialLabs: embed production JavaScript for physical Debug builds';
const LEGACY_XCODE_MARKER =
  '# ArtificialLabs: embed JavaScript for physical Debug builds';
const APP_DELEGATE_MARKER =
  '// ArtificialLabs: use the embedded bundle for physical Debug builds';
const LEGACY_APP_DELEGATE_MARKER =
  '// ArtificialLabs: use the embedded bundle when Metro is unavailable';

function withPhysicalDeviceBundle(config) {
  config = withXcodeProject(config, (xcodeConfig) => {
    const shellScriptBuildPhases =
      xcodeConfig.modResults.hash.project.objects.PBXShellScriptBuildPhase;
    const bundlePhase = Object.values(shellScriptBuildPhases).find(
      (phase) => phase && phase.name === BUNDLE_PHASE_NAME,
    );

    if (!bundlePhase) {
      throw new Error(
        'Could not find the iOS JavaScript bundle build phase while applying the physical-device bundle plugin.',
      );
    }

    if (bundlePhase.shellScript.includes(XCODE_MARKER)) {
      return xcodeConfig;
    }

    const bundleModeBlock = `\\n${XCODE_MARKER}\\nif [[ \\"$CONFIGURATION\\" = *Debug* && \\"$PLATFORM_NAME\\" != *simulator* ]]; then\\n  export CONFIGURATION=Release\\nfi\\n`;
    const legacyMarkerBlock = `\\n${LEGACY_XCODE_MARKER}\\n`;

    if (bundlePhase.shellScript.includes(legacyMarkerBlock)) {
      bundlePhase.shellScript = bundlePhase.shellScript.replace(
        legacyMarkerBlock,
        bundleModeBlock,
      );
      return xcodeConfig;
    }

    if (!bundlePhase.shellScript.includes(DEBUG_SKIP_BUNDLING_BLOCK)) {
      throw new Error(
        'The generated iOS JavaScript bundle build phase changed unexpectedly; refusing to patch it.',
      );
    }

    bundlePhase.shellScript = bundlePhase.shellScript.replace(
      DEBUG_SKIP_BUNDLING_BLOCK,
      bundleModeBlock,
    );
    return xcodeConfig;
  });

  config = withAppDelegate(config, (appDelegateConfig) => {
    const { contents } = appDelegateConfig.modResults;

    if (contents.includes(APP_DELEGATE_MARKER)) {
      return appDelegateConfig;
    }

    const metroBundleBlock = `#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif`;
    const legacyFallbackBundleBlock = `#if DEBUG
    ${LEGACY_APP_DELEGATE_MARKER}
    if let metroBundleURL = RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry") {
      return metroBundleURL
    }
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif`;

    const fallbackBundleBlock = `#if DEBUG && targetEnvironment(simulator)
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    ${APP_DELEGATE_MARKER}
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif`;

    let currentBundleBlock;
    if (contents.includes(metroBundleBlock)) {
      currentBundleBlock = metroBundleBlock;
    } else if (contents.includes(legacyFallbackBundleBlock)) {
      currentBundleBlock = legacyFallbackBundleBlock;
    } else {
      throw new Error(
        'The generated iOS AppDelegate bundle URL implementation changed unexpectedly; refusing to patch it.',
      );
    }

    appDelegateConfig.modResults.contents = contents.replace(
      currentBundleBlock,
      fallbackBundleBlock,
    );
    return appDelegateConfig;
  });

  return config;
}

module.exports = withPhysicalDeviceBundle;
