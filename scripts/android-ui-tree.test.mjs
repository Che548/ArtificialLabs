import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAndroidUiTree, matchingAndroidNode } from './android-ui-tree.mjs';

test('native tree decodes text without confusing attributes or hidden zero bounds', () => {
  const nodes = parseAndroidUiTree('<hierarchy><node text="A &amp; B&#10;1,25 &quot;12.50&quot;" enabled="true" bounds="[0,10][400,120]"/><node text="hidden" bounds="[0,0][0,0]"/></hierarchy>');
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].text, 'A & B\n1,25 "12.50"');
  assert.equal(matchingAndroidNode(nodes, /1,25[\s\S]*12.50/), nodes[0]);
});
test('disabled controls never satisfy a tap selector and malformed dumps fail', () => {
  const nodes = parseAndroidUiTree('<hierarchy><node content-desc="Send" enabled="false" bounds="[0,10][30,40]"/></hierarchy>');
  assert.equal(matchingAndroidNode(nodes, /^Send$/), undefined);
  assert.throws(() => parseAndroidUiTree('ERROR: could not get idle state'));
});
