import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { test } from 'node:test';

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

test('accepts one signed request, replays it idempotently, and deletes only its sent SMS', async () => {
  let sendCount = 0;
  let deleteCount = 0;
  let outgoing;
  const modem = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://modem');
    response.setHeader('content-type', 'application/json');
    if (request.method === 'GET' && url.searchParams.get('cmd') === 'sms_data_total') {
      const tags = url.searchParams.get('tags');
      response.end(JSON.stringify({ messages: tags === '2' && outgoing ? [outgoing] : [] }));
      return;
    }
    if (request.method === 'GET' && url.searchParams.get('cmd') === 'sms_cmd_status_info') {
      response.end(JSON.stringify({ sms_cmd_status_result: '3' }));
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const form = new URLSearchParams(Buffer.concat(chunks).toString());
    if (form.get('goformId') === 'SEND_SMS') {
      sendCount += 1;
      outgoing = {
        id: '42',
        number: form.get('Number'),
        content: form.get('MessageBody'),
        tag: '2',
      };
    }
    if (form.get('goformId') === 'DELETE_SMS' && form.get('msg_id') === '42;') deleteCount += 1;
    response.end(JSON.stringify({ result: 'success' }));
  });
  const modemPort = await listen(modem);
  process.env.NODE_ENV = 'test';
  process.env.MODEM_BASE_URL = `http://127.0.0.1:${modemPort}`;
  process.env.SMS_GATEWAY_SHARED_SECRET = 'test-shared-secret';
  process.env.STATE_FILE = `/tmp/artificiallabs-sms-gateway-${process.pid}.json`;
  const { createGatewayServer } = await import(`./server.mjs?test=${Date.now()}`);
  const gateway = createGatewayServer();
  const gatewayPort = await listen(gateway);
  const body = JSON.stringify({
    requestId: 'request-1',
    phone: '+79990000000',
    code: '123456',
    expiration: Date.now() + 300_000,
  });
  const timestamp = String(Date.now());
  const signature = createHmac('sha256', 'test-shared-secret')
    .update(`${timestamp}\nrequest-1\n${body}`)
    .digest('hex');
  const request = () => fetch(`http://127.0.0.1:${gatewayPort}/v1/sms`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-sms-timestamp': timestamp,
      'x-sms-request-id': 'request-1',
      'x-sms-signature': signature,
    },
    body,
  });
  assert.equal((await request()).status, 200);
  assert.equal((await request()).status, 200);
  assert.equal(sendCount, 1);
  assert.equal(deleteCount, 1);
  await Promise.all([
    new Promise((resolve) => gateway.close(resolve)),
    new Promise((resolve) => modem.close(resolve)),
  ]);
});

test('rejects missing signatures without contacting the modem', async () => {
  process.env.NODE_ENV = 'test';
  process.env.SMS_GATEWAY_SHARED_SECRET = 'test-shared-secret';
  const { createGatewayServer } = await import(`./server.mjs?unauthorized=${Date.now()}`);
  const gateway = createGatewayServer();
  const port = await listen(gateway);
  const response = await fetch(`http://127.0.0.1:${port}/v1/sms`, { method: 'POST', body: '{}' });
  assert.equal(response.status, 401);
  await new Promise((resolve) => gateway.close(resolve));
});

test('reads the T2 tariff SMS remainder once and enforces the daily gateway cooldown', async () => {
  let ussdSendCount = 0;
  let healthCount = 0;
  let pollCount = 0;
  const encode = (value) => Array.from(value)
    .map((character) => character.codePointAt(0).toString(16).padStart(4, '0'))
    .join('');
  const modem = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://modem');
    response.setHeader('content-type', 'application/json');
    if (request.method === 'GET' && url.searchParams.get('cmd') === 'network_type,signalbar') {
      healthCount += 1;
      response.end(JSON.stringify({ network_type: 'LTE', signalbar: '4' }));
      return;
    }
    if (request.method === 'GET' && url.searchParams.get('cmd') === 'ussd_write_flag') {
      pollCount += 1;
      response.end(JSON.stringify({ ussd_write_flag: pollCount > 1 ? '16' : '15' }));
      return;
    }
    if (request.method === 'GET' && url.searchParams.get('cmd') === 'ussd_data_info') {
      response.end(JSON.stringify({ ussd_data_info: encode('Осталось 237 SMS') }));
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const form = new URLSearchParams(Buffer.concat(chunks).toString());
    if (
      form.get('goformId') === 'USSD_PROCESS' &&
      form.get('USSD_operator') === 'ussd_send'
    ) {
      ussdSendCount += 1;
      assert.equal(form.get('USSD_send_number'), '*105#');
    }
    response.end(JSON.stringify({ result: 'success' }));
  });
  const modemPort = await listen(modem);
  process.env.NODE_ENV = 'test';
  process.env.MODEM_BASE_URL = `http://127.0.0.1:${modemPort}`;
  process.env.SMS_GATEWAY_SHARED_SECRET = 'test-shared-secret';
  process.env.STATE_FILE = `/tmp/artificiallabs-sms-gateway-balance-${process.pid}.json`;
  const { createGatewayServer, testing } = await import(`./server.mjs?balance=${Date.now()}`);
  assert.equal(testing.parseRemainingSms('SMS: 1 234 из 1500'), 1234);
  assert.equal(testing.parseRemainingSms('Нет данных о пакете'), undefined);
  const gateway = createGatewayServer();
  const gatewayPort = await listen(gateway);

  const health = await fetch(`http://127.0.0.1:${gatewayPort}/health`);
  assert.equal(health.status, 200);
  assert.equal(healthCount, 1);

  const signedRequest = (requestId) => {
    const body = JSON.stringify({ requestId });
    const timestamp = String(Date.now());
    const signature = createHmac('sha256', 'test-shared-secret')
      .update(`${timestamp}\n${requestId}\n${body}`)
      .digest('hex');
    return fetch(`http://127.0.0.1:${gatewayPort}/v1/tariff-balance`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-sms-timestamp': timestamp,
        'x-sms-request-id': requestId,
        'x-sms-signature': signature,
      },
      body,
    });
  };
  const first = await signedRequest('balance-request-1');
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { ok: true, remainingSms: 237 });
  const second = await signedRequest('balance-request-2');
  assert.equal(second.status, 429);
  assert.equal((await second.json()).code, 'SMS_BALANCE_COOLDOWN');
  assert.equal(ussdSendCount, 1);

  await Promise.all([
    new Promise((resolve) => gateway.close(resolve)),
    new Promise((resolve) => modem.close(resolve)),
  ]);
});
