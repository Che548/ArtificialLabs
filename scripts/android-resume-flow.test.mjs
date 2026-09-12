import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { splitAndroidResumeFlow } from './android-resume-flow.mjs';

for (const name of ['chat-keyboard', 'chat-conversation']) {
  test(`${name}: retains all checks and real Home while delegating only Activity resume`, () => {
    const source = readFileSync(new URL(`../.maestro/${name}.yml`, import.meta.url), 'utf8');
    const { before, after } = splitAndroidResumeFlow(source, '/fixture/.maestro');
    assert.match(before, /- pressKey: home\n$/);
    assert.doesNotMatch(before + after, /launchApp|stopApp/);
    assert.equal((before + after).match(/assertVisible|assertNotVisible|takeScreenshot/g).length,
      source.match(/assertVisible|assertNotVisible|takeScreenshot/g).length);
    assert.ok(after.startsWith(source.slice(0, source.indexOf('\n---\n') + 5)));
    if (name === 'chat-conversation') assert.match(before, /file: "\/fixture\/\.maestro\/assert-native-input.yml"/);
    assert.throws(() => splitAndroidResumeFlow(source.replace('stopApp: false', 'stopApp: true'), '/fixture'));
    assert.throws(() => splitAndroidResumeFlow(source + source, '/fixture'));
  });
}
