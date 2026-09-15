import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { LOCAL_ONBOARDING_PRIVACY } from '../shared/onboarding-privacy';
import { onboardingLayout } from './onboarding-layout';

test('onboarding enables the default internal services', () => {
  assert.deepEqual(LOCAL_ONBOARDING_PRIVACY, {
    cloudSyncEnabled: true, anonymousAnalytics: true, medicalRecommendations: true,
  });
  const screen = readFileSync(new URL('../components/OnboardingScreen.tsx', import.meta.url), 'utf8');
  const flow = readFileSync(new URL('../design-system/onboarding-flow.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(screen, /acceptAgentConsent|acceptChatConsent|setAutomation/);
  assert.match(screen, /receipt \? await acceptRegistrationConsent\(receipt\) : undefined/);
  assert.match(screen, /activation\?\.accepted === true/);
  assert.match(flow, /\.\.\.LOCAL_ONBOARDING_PRIVACY/);
  const automation = readFileSync(new URL('./agent-automation-manager.tsx', import.meta.url), 'utf8');
  assert.match(automation, /healthStore\.cloudSyncEnabled &&/);
  assert.match(automation, /healthStore\.cloudProfileReady &&/);
  assert.match(automation, /healthStore\.profile\?\.onboardingCompleted &&/);
});

test('signup choice survives email verification but is not created by login or recovery', () => {
  const auth = readFileSync(new URL('../components/AuthScreen.tsx', import.meta.url), 'utf8');
  const submit = auth.slice(auth.indexOf('const submit = async'));
  assert.match(submit, /flow === 'signUp' && channel === 'email' && personalDataConsent && agreementAccepted/);
  assert.match(submit, /rememberRegistrationConsent\(normalizedIdentifier\)/);
  assert.doesNotMatch(auth.slice(0, auth.indexOf('const submit = async')), /await rememberRegistrationConsent/);
  const pending = submit.indexOf('if (pending)');
  assert.ok(pending >= 0 && submit.indexOf('return;', pending) < submit.indexOf('await clearRegistrationConsent()', pending));
});

test('onboarding leaves a usable scroll viewport on phone, Fold and keyboard-resized windows', () => {
  for (const [width, height, top, bottom] of [[402, 874, 62, 34], [375, 667, 20, 0], [841, 701, 24, 24], [393, 851, 24, 24], [841, 390, 24, 24]]) {
    for (const header of [32, 58]) {
      const layout = onboardingLayout(width, height, top, bottom, header);
      assert.ok(height - layout.scrollTop - layout.scrollBottom >= 120, `${width}x${height}`);
      assert.ok(layout.panelHeaderTop >= top + 72);
      assert.ok(layout.scale <= 1);
      assert.equal(layout.shapeTop, layout.panelHeaderTop - 73 * layout.scale);
    }
  }
});
test('ordinary tall phone retains the reference header position', () => {
  assert.equal(onboardingLayout(402, 874, 62, 34, 32).panelHeaderTop, 486);
});

test('registration consent scrolling is not wrapped by a keyboard-dismiss touch responder', () => {
  const auth = readFileSync(new URL('../components/AuthScreen.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(auth, /TouchableWithoutFeedback/);
  assert.match(auth, /<Pressable\s+accessible=\{false\}\s+onPress=\{Keyboard.dismiss\}\s+style=\{StyleSheet.absoluteFill\}/);
  assert.match(auth, /<View pointerEvents="box-none" style=\{styles.content\}>/);
  assert.match(auth, /<View style=\{styles.consents\}>\s*<ScrollView\s+style=\{styles.consentScroll\}/);
  assert.match(auth, /keyboardDismissMode="on-drag"\s+nestedScrollEnabled/);
});
