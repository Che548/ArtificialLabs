import assert from 'node:assert/strict';
import test from 'node:test';

import { isAllowedChatMarkdownLink } from './safe-markdown';

test('chat Markdown links allow only absolute HTTPS targets', () => {
  assert.equal(isAllowedChatMarkdownLink('https://example.com/path'), true);
  assert.equal(isAllowedChatMarkdownLink('http://example.com'), false);
  assert.equal(isAllowedChatMarkdownLink('javascript:alert(1)'), false);
  assert.equal(isAllowedChatMarkdownLink('/relative'), false);
  assert.equal(isAllowedChatMarkdownLink('not a url'), false);
});
