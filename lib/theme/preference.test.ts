import assert from 'node:assert/strict';
import test from 'node:test';
import { appearanceOverride, parseThemePreference, resolveThemeMode } from './preference';

test('defaults to system without overwriting an existing manual choice', () => {
  for (const saved of [null, undefined, '', 'system', 'invalid']) assert.equal(parseThemePreference(saved), 'system');
  for (const saved of ['light', 'dark'] as const) assert.equal(parseThemePreference(saved), saved);
});

test('automatic mode follows both transitions, with a light fallback for unknown appearance', () => {
  for (const system of ['light', 'dark', 'light', 'dark']) assert.equal(resolveThemeMode('system', system), system);
  for (const system of [null, undefined]) assert.equal(resolveThemeMode('system', system), 'light');
});

test('manual themes ignore system changes, returning to automatic clears the native override', () => {
  for (const preference of ['light', 'dark'] as const) {
    for (const system of ['light', 'dark', null]) assert.equal(resolveThemeMode(preference, system), preference);
    assert.equal(appearanceOverride(preference), preference);
  }
  assert.equal(appearanceOverride('system'), null);
});
