import assert from 'node:assert/strict';
import test from 'node:test';

import { rewriteRequestHeaders } from '../../scripts/convex-e2e-proxy';

test('rewrites the reverse-proxy host and local origin', () => {
  const result = rewriteRequestHeaders(
    {
      host: '127.0.0.1:3320',
      origin: 'http://127.0.0.1:3320',
      upgrade: 'websocket',
    },
    new URL('https://artificiallabs-convex.bebra42.ru'),
  );

  assert.equal(result.host, 'artificiallabs-convex.bebra42.ru');
  assert.equal(result.origin, 'https://artificiallabs-convex.bebra42.ru');
  assert.equal(result.upgrade, 'websocket');
});

test('does not rewrite a non-local origin', () => {
  const result = rewriteRequestHeaders(
    { origin: 'https://example.test' },
    new URL('https://artificiallabs-convex.bebra42.ru'),
  );

  assert.equal(result.origin, 'https://example.test');
});
