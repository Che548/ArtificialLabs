export const OCR_MATRIX_FIXTURES = ['two-pages.pdf', 'twenty-pages.pdf', 'sample.jpg', 'sample.png', 'rotated.png', 'poor-quality.jpg', 'password.pdf', 'corrupt.pdf', 'too-many-pages.pdf', 'too-large.pdf', 'unsupported.txt'];

export const NATIVE_QA_REQUIRED_FUNCTIONS = [
  'testing.js:prepareVerifiedNativeFixture',
  'testing.js:purgeE2EAccount',
  'emailVerification.js:loginState',
  'reviewAccess.js:configure',
  'documentInterpretation.js:status',
  'documentInterpretation.js:setConsent',
  'documentInterpretation.js:generate',
  'documentInterpretationAction.js:generate',
];

export function assertNativeQaDeployment(spec) {
  if (spec?.url !== 'https://artificiallabs-convex.bebra42.ru' || !Array.isArray(spec.functions)) {
    throw new Error('NATIVE_QA_DEPLOYMENT_MISMATCH');
  }
  const deployed = new Set(spec.functions.map(fn => fn.identifier));
  if (NATIVE_QA_REQUIRED_FUNCTIONS.some(name => !deployed.has(name))) {
    throw new Error('NATIVE_QA_DEPLOYMENT_MISMATCH');
  }
}

export function assertConsistentAdbServer(adbPath, clientOutput, serverOutput) {
  const clientVersion = /Version ([\d.]+)/.exec(clientOutput)?.[1];
  const serverVersion = /^version: "([\d.]+)"$/m.exec(serverOutput)?.[1];
  if (!clientVersion || clientVersion !== serverVersion ||
      !serverOutput.split(/\r?\n/).includes(`executable_absolute_path: "${adbPath}"`)) {
    throw new Error('Start the matching Android SDK ADB server before QA; do not restart it while other devices are connected.');
  }
}

export function assertUnsignedQaManifestCompatible(config) {
  if (!config || typeof config !== 'object') throw new Error('Invalid native update configuration');
  if (config.EXUpdatesCodeSigningCertificate) {
    throw new Error('This iOS package requires signed OTA manifests, but QA Metro is unsigned. Run node scripts/build-document-ocr-e2e-ios.mjs; do not disable production signing.');
  }
}

export function nativeQaScenarios(input) {
  const allowed = ['chat-keyboard', 'chat-conversation', 'native-connection', 'document-ocr'];
  const selected = input ? input.split(',') : allowed;
  if (!selected.length || selected.some(value => !allowed.includes(value))) throw new Error('Unknown native QA scenario');
  const required = new Set(selected);
  if (required.has('native-connection')) required.add('chat-conversation');
  return allowed.filter(value => required.has(value));
}

export function localMetroLaunchAsset(manifest, port, androidGuest = false) {
  const url = new URL(manifest?.launchAsset?.url);
  // The emulator uses its reserved host alias; the host warms the same asset
  // via loopback, never by following arbitrary private-network URLs.
  if (androidGuest && url.hostname === '10.0.2.2') url.hostname = '127.0.0.1';
  if (url.protocol !== 'http:' || url.username || url.password ||
      !['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== String(port)) {
    throw new Error('QA manifest must use the local Metro');
  }
  return url;
}
