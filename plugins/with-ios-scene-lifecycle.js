const { withAppDelegate, withInfoPlist } = require('@expo/config-plugins');

const marker = '// Sfera: single-window scene lifecycle for iOS 27.';
const sceneStart = `    // SceneDelegate attaches the window before starting React.
#if DEBUG
    // Expo SDK 54's development launcher requires a window during didFinishLaunching.
    // SceneDelegate attaches this same window when UIKit connects the scene.
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(withModuleName: "main", in: window, launchOptions: launchOptions)
#endif`;
const legacyStart = /#if os\(iOS\) \|\| os\(tvOS\)\s+window = UIWindow\(frame: UIScreen\.main\.bounds\)\s+factory\.startReactNative\(\s+withModuleName: "main",\s+in: window,\s+launchOptions: launchOptions\)\s+#endif/;
const sceneDelegate = `
${marker}
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  private var appDelegate: AppDelegate? {
    UIApplication.shared.delegate as? AppDelegate
  }

  func scene(_ scene: UIScene, willConnectTo session: UISceneSession,
             options connectionOptions: UIScene.ConnectionOptions) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate else { return }
    // Retain the protected-storage error screen if startup failed closed.
    let window = appDelegate.window ?? UIWindow(windowScene: windowScene)
    window.windowScene = windowScene
    self.window = window
    appDelegate.window = window
    if window.rootViewController == nil, let factory = appDelegate.reactNativeFactory {
      var launchOptions = appDelegate.initialLaunchOptions ?? [:]
      if let context = connectionOptions.urlContexts.first {
        launchOptions[.url] = context.url
        launchOptions[.sourceApplication] = context.options.sourceApplication
      }
      if let activity = connectionOptions.userActivities.first {
        launchOptions[.userActivityDictionary] = [
          "UIApplicationLaunchOptionsUserActivityTypeKey": activity.activityType,
          "UIApplicationLaunchOptionsUserActivityKey": activity
        ]
      }
      factory.startReactNative(withModuleName: "main", in: window, launchOptions: launchOptions)
    }
    window.makeKeyAndVisible()
  }

  func sceneDidBecomeActive(_ scene: UIScene) {
    appDelegate?.applicationDidBecomeActive(UIApplication.shared)
  }

  func sceneWillResignActive(_ scene: UIScene) {
    appDelegate?.applicationWillResignActive(UIApplication.shared)
  }

  func sceneWillEnterForeground(_ scene: UIScene) {
    appDelegate?.applicationWillEnterForeground(UIApplication.shared)
  }

  func sceneDidEnterBackground(_ scene: UIScene) {
    appDelegate?.applicationDidEnterBackground(UIApplication.shared)
  }

  func scene(_ scene: UIScene, openURLContexts contexts: Set<UIOpenURLContext>) {
    for context in contexts {
      var options: [UIApplication.OpenURLOptionsKey: Any] = [
        .openInPlace: context.options.openInPlace
      ]
      if let source = context.options.sourceApplication { options[.sourceApplication] = source }
      if let annotation = context.options.annotation { options[.annotation] = annotation }
      _ = appDelegate?.application(UIApplication.shared, open: context.url, options: options)
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    _ = appDelegate?.application(UIApplication.shared, continue: userActivity,
                                 restorationHandler: { _ in })
  }
}
`;

function adoptSceneLifecycle(source) {
  if (source.includes(marker)) {
    return source.includes("Expo SDK 54's development launcher") ? source
      : source.replace('    // SceneDelegate attaches the window before starting React.', sceneStart);
  }
  const property = '  var window: UIWindow?';
  const launch = '    let delegate = ReactNativeDelegate()';
  if (!source.includes(property) || !source.includes(launch) || !legacyStart.test(source)) {
    throw new Error('Unsupported AppDelegate: cannot safely install scene lifecycle');
  }
  return source
    .replace(property, `${property}\n  var initialLaunchOptions: [UIApplication.LaunchOptionsKey: Any]?`)
    .replace(launch, `    initialLaunchOptions = launchOptions\n${launch}`)
    .replace(legacyStart, sceneStart)
    + sceneDelegate;
}

function configureScenes(plist) {
  return {
    ...plist,
    UIApplicationSceneManifest: {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [{
          UISceneConfigurationName: 'Default Configuration',
          UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
        }],
      },
    },
  };
}
module.exports = (config) => {
  config = withInfoPlist(config, mod => {
    mod.modResults = configureScenes(mod.modResults);
    return mod;
  });
  return withAppDelegate(config, mod => {
    if (mod.modResults.language !== 'swift') throw new Error('Scene lifecycle requires Swift');
    mod.modResults.contents = adoptSceneLifecycle(mod.modResults.contents);
    return mod;
  });
};
module.exports.adoptSceneLifecycle = adoptSceneLifecycle;
module.exports.configureScenes = configureScenes;
