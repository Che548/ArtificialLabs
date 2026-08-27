import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  DIAGNOSTICS_TAP_WINDOW_MS,
  registerDiagnosticsTap,
} from './diagnostics-access';

test('opens diagnostics after three taps in production without an environment gate', () => {
  let taps: number[] = [];
  for (const now of [1_000, 1_500]) {
    const result = registerDiagnosticsTap(taps, now);
    assert.equal(result.shouldOpen, false);
    taps = result.taps;
  }

  const result = registerDiagnosticsTap(taps, 2_900);
  assert.equal(result.shouldOpen, true);
  assert.deepEqual(result.taps, []);
});

test('expired taps do not count toward opening diagnostics', () => {
  const first = registerDiagnosticsTap([], 1_000);
  const expired = registerDiagnosticsTap(
    first.taps,
    1_000 + DIAGNOSTICS_TAP_WINDOW_MS + 1,
  );
  const third = registerDiagnosticsTap(expired.taps, 3_100);

  assert.equal(third.shouldOpen, false);
  assert.deepEqual(third.taps, [3_001, 3_100]);
});

test('production diagnostics source has no environment gate or server internals', () => {
  const profileSource = fs.readFileSync(
    new URL('../app/profile.tsx', import.meta.url),
    'utf8',
  );
  const diagnosticsSource = fs.readFileSync(
    new URL('../components/DiagnosticsScreen.tsx', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(profileSource, /EXPO_PUBLIC_ENABLE_DEV_MENU/);
  assert.match(diagnosticsSource, /\/version/);
  for (const forbidden of [
    'CONVEX_SELF_HOSTED_ADMIN_KEY',
    'serverCpu',
    'serverRam',
    'viewerEmail',
    'viewerPhone',
    'userId',
  ]) {
    assert.equal(diagnosticsSource.includes(forbidden), false, forbidden);
  }
});
