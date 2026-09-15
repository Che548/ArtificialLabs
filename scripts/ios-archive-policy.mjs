export function validateArchiveIdentity(info, version, build) {
  if (!version || !build || info.CFBundleShortVersionString !== version ||
      info.CFBundleVersion !== build ||
      info.CFBundleIdentifier !== 'engineering.brainwaves.sfera') {
    throw new Error('Archive identity/version does not match release');
  }
}

export function validateArchiveRuntime(entitlements, updates, embeddedFingerprint) {
  if (entitlements['com.apple.developer.team-identifier'] !== '6HZGXYF43L' ||
      entitlements['application-identifier'] !== '6HZGXYF43L.engineering.brainwaves.sfera' ||
      entitlements['get-task-allow'] === true) throw new Error('Wrong archive signing entitlements');
  // Expo SDK 54 resolves this sentinel from EXUpdates.bundle/fingerprint.
  // Validate the actual resource, never treat the sentinel itself as a runtime.
  const runtime = updates.EXUpdatesRuntimeVersion === 'file:fingerprint'
    ? embeddedFingerprint : updates.EXUpdatesRuntimeVersion;
  if (typeof runtime !== 'string' || !/^[a-f0-9]{12,64}$(?![\s\S])/.test(runtime)) {
    throw new Error('Missing fingerprint runtime in archive');
  }
  if (updates.EXUpdatesEnabled !== true || updates.EXUpdatesDisableAntiBrickingMeasures === true) {
    throw new Error('Unsafe Expo Updates configuration');
  }
  return runtime;
}
