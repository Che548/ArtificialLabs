import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { LOCAL_ONBOARDING_PRIVACY } from '../shared/onboarding-privacy';
import { onboardingLayout } from './onboarding-layout';

test('new onboarding UI never manufactures cloud or provider consent', () => {
  assert.deepEqual(LOCAL_ONBOARDING_PRIVACY, {
    cloudSyncEnabled: false, anonymousAnalytics: false, medicalRecommendations: false,
  });
  const screen = readFileSync(new URL('../components/OnboardingScreen.tsx', import.meta.url), 'utf8');
  const flow = readFileSync(new URL('../design-system/onboarding-flow.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(screen, /useMutation|acceptAgentConsent|acceptChatConsent|setAutomation/);
  assert.match(flow, /\.\.\.LOCAL_ONBOARDING_PRIVACY/);
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
