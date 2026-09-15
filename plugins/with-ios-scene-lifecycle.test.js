const assert = require('node:assert/strict');
const { test } = require('node:test');
const { adoptSceneLifecycle, configureScenes } = require('./with-ios-scene-lifecycle');
const { excludeHealthBackup } = require('./with-ios-health-backup-exclusion');
const source = `class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?
  func launch() {
    let delegate = ReactNativeDelegate()
#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif
  }
}`;
test('migrates native launch to a scene without bypassing storage protection', () => {
  const result = adoptSceneLifecycle(excludeHealthBackup(source));
  const app = result.split('// Sfera: single-window')[0];
  assert.match(app, /#if DEBUG[\s\S]*factory.startReactNative\([\s\S]*#endif/);
  assert.ok(app.includes('setResourceValues(values)'));
  assert.ok(result.includes('appDelegate.window ?? UIWindow(windowScene: windowScene)'));
  assert.ok(result.indexOf('window.windowScene = windowScene') < result.lastIndexOf('factory.startReactNative('));
  assert.equal(adoptSceneLifecycle(result), result);
});
test('registers exactly one scene and preserves existing native privacy settings', () => {
  const original = { NSCameraUsageDescription: 'Camera', UIFileSharingEnabled: false };
  const result = configureScenes(original);
  assert.equal(result.UIFileSharingEnabled, false);
  assert.equal(result.NSCameraUsageDescription, 'Camera');
  const manifest = result.UIApplicationSceneManifest;
  assert.equal(manifest.UIApplicationSupportsMultipleScenes, false);
  assert.equal(manifest.UISceneConfigurations.UIWindowSceneSessionRoleApplication.length, 1);
  assert.match(manifest.UISceneConfigurations.UIWindowSceneSessionRoleApplication[0].UISceneDelegateClassName, /\.SceneDelegate$/);
  assert.deepEqual(configureScenes(result), result);
});
test('retains cold/warm links and forwards Expo subscriber lifecycle callbacks', () => {
  const result = adoptSceneLifecycle(source);
  assert.ok(result.includes('launchOptions[.url] = context.url'));
  assert.ok(result.includes('UIApplicationLaunchOptionsUserActivityTypeKey'));
  for (const event of ['DidBecomeActive', 'WillResignActive', 'DidEnterBackground', 'WillEnterForeground']) {
    assert.ok(result.includes(`appDelegate?.application${event}(UIApplication.shared)`));
  }
  assert.ok(result.includes('open: context.url, options: options'));
  assert.ok(result.includes('continue: userActivity'));
});
test('rejects unknown native templates instead of shipping an incomplete migration', () => {
  assert.throws(() => adoptSceneLifecycle('unknown template'), /Unsupported AppDelegate/);
});
