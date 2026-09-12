import assert from 'node:assert/strict';
import test from 'node:test';

import { rewriteRequestHeaders } from '../../scripts/convex-e2e-proxy';
import { createTransportFaults } from '../../scripts/e2e-transport-faults';
import type { IncomingMessage, ServerResponse } from 'node:http';

test('transport fault control is opt-in, rejects browser origins and recovers sockets', () => {
  const invoke = (faults: ReturnType<typeof createTransportFaults>, path: string, origin?: string) => {
    let status = 0;
    const response = { writeHead(code: number) { status = code; return this; }, end() {} } as unknown as ServerResponse;
    const handled = faults.handle({ method: 'POST', url: '/__e2e_transport/' + path, headers: { 'x-e2e-control': 'local-qa', ...(origin ? { origin } : {}) } } as IncomingMessage, response);
    return { handled, status };
  };
  const disabled = createTransportFaults(false);
  assert.deepEqual(invoke(disabled, 'down'), { handled: false, status: 0 });
  assert.equal(disabled.offline, false);
  const faults = createTransportFaults(true);
  let closed = 0;
  faults.register(() => closed++);
  assert.equal(invoke(faults, 'down', 'https://example.test').status, 403);
  assert.equal(closed, 0);
  assert.equal(invoke(faults, 'down').status, 204);
  assert.equal(faults.offline, true);
  assert.equal(closed, 1);
  faults.register(() => closed++);
  assert.equal(closed, 2);
  assert.equal(invoke(faults, 'up').status, 204);
  assert.equal(faults.offline, false);
  faults.register(() => closed++);
  assert.equal(closed, 2);
});

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
