import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import { createServer } from 'node:http';
import { test } from 'node:test';

function listen(server) {
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve(server.address().port)),
  );
}

test('accepts one signed request, replays it idempotently, and deletes only its sent SMS', async () => {
  let sendCount = 0;
  let deleteCount = 0;
  let outgoing;
  const modem = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://modem');
    response.setHeader('content-type', 'application/json');
    if (
      request.method === 'GET' &&
      url.searchParams.get('cmd') === 'sms_data_total'
    ) {
      const tags = url.searchParams.get('tags');
      response.end(
        JSON.stringify({
          messages: tags === '2' && outgoing ? [outgoing] : [],
        }),
      );
      return;
    }
    if (
      request.method === 'GET' &&
      url.searchParams.get('cmd') === 'sms_cmd_status_info'
    ) {
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
    if (form.get('goformId') === 'DELETE_SMS' && form.get('msg_id') === '42;')
      deleteCount += 1;
    response.end(JSON.stringify({ result: 'success' }));
  });
  const modemPort = await listen(modem);
  process.env.NODE_ENV = 'test';
  process.env.MODEM_BASE_URL = `http://127.0.0.1:${modemPort}`;
  process.env.SMS_GATEWAY_SHARED_SECRET = 'test-shared-secret';
  process.env.STATE_FILE = `/tmp/artificiallabs-sms-gateway-${process.pid}.json`;
  const { createGatewayServer } = await import(
    `./server.mjs?test=${Date.now()}`
  );
  const gateway = createGatewayServer();
  const gatewayPort = await listen(gateway);
  const body = JSON.stringify({
    requestId: 'request-1',
    phone: '+79990000000',
    code: '123456',
    expiration: Date.now() + 300_000,
    platform: 'android',
  });
  const timestamp = String(Date.now());
  const signature = createHmac('sha256', 'test-shared-secret')
    .update(`${timestamp}\nrequest-1\n${body}`)
    .digest('hex');
  const request = () =>
    fetch(`http://127.0.0.1:${gatewayPort}/v1/sms`, {
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
  const decodedMessage = String.fromCodePoint(
    ...String(outgoing.content)
      .match(/.{4}/g)
      .map((unit) => Number.parseInt(unit, 16)),
  );
  assert.equal(decodedMessage, '<#> Sfera code: 123456\nY4QO6pOIVxj');
  assert.ok(Buffer.byteLength(decodedMessage, 'utf8') <= 140);
  await Promise.all([
    new Promise((resolve) => gateway.close(resolve)),
    new Promise((resolve) => modem.close(resolve)),
  ]);
});

test('formats one strict ASCII SMS for each native platform', async () => {
  process.env.NODE_ENV = 'test';
  const { testing } = await import(`./server.mjs?formats=${Date.now()}`);
  const ios = testing.formatOtpMessage(
    '123456',
    'ios',
    'artificiallabs.bebra42.ru',
    'Y4QO6pOIVxj',
  );
  const android = testing.formatOtpMessage(
    '123456',
    'android',
    'artificiallabs.bebra42.ru',
    'Y4QO6pOIVxj',
  );
  assert.equal(ios, 'Sfera code: 123456\n@artificiallabs.bebra42.ru #123456');
  assert.equal(android, '<#> Sfera code: 123456\nY4QO6pOIVxj');
  assert.ok(Buffer.byteLength(ios, 'utf8') <= 140);
  assert.ok(Buffer.byteLength(android, 'utf8') <= 140);
  assert.equal(
    testing.formatOtpMessage(
      '654321',
      'android',
      'artificiallabs.bebra42.ru',
      'Y4QO6pOIVxj',
      'password-recovery',
    ),
    '<#> Sfera reset code: 654321\nY4QO6pOIVxj',
  );
});

test('rejects missing signatures without contacting the modem', async () => {
  process.env.NODE_ENV = 'test';
  process.env.SMS_GATEWAY_SHARED_SECRET = 'test-shared-secret';
  const { createGatewayServer } = await import(
    `./server.mjs?unauthorized=${Date.now()}`
  );
  const gateway = createGatewayServer();
  const port = await listen(gateway);
  const response = await fetch(`http://127.0.0.1:${port}/v1/sms`, {
    method: 'POST',
    body: '{}',
  });
  assert.equal(response.status, 401);
  await new Promise((resolve) => gateway.close(resolve));
});

test('reads the T2 tariff SMS remainder once and enforces the daily gateway cooldown', async () => {
  let ussdSendCount = 0;
  let healthCount = 0;
  let pollCount = 0;
  let messagePollCount = 0;
  let prunedCount = 0;
  const encode = (value) =>
    Array.from(value)
      .map((character) =>
        character.codePointAt(0).toString(16).padStart(4, '0'),
      )
      .join('');
  let incoming = Array.from({ length: 18 }, (_, index) => ({
    id: `old-${18 - index}`,
    tag: '1',
    content: encode(`Сервисное сообщение ${18 - index}`),
  }));
  let balanceDelivered = false;
  const modem = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://modem');
    response.setHeader('content-type', 'application/json');
    if (
      request.method === 'GET' &&
      url.searchParams.get('cmd') === 'network_type,signalbar'
    ) {
      healthCount += 1;
      response.end(JSON.stringify({ network_type: 'LTE', signalbar: '4' }));
      return;
    }
    if (
      request.method === 'GET' &&
      url.searchParams.get('cmd') === 'ussd_write_flag'
    ) {
      pollCount += 1;
      response.end(
        JSON.stringify({ ussd_write_flag: pollCount > 1 ? '16' : '15' }),
      );
      return;
    }
    if (
      request.method === 'GET' &&
      url.searchParams.get('cmd') === 'ussd_data_info'
    ) {
      response.end(
        JSON.stringify({
          ussd_data_info: encode('Запрос принят. Информация направлена в SMS.'),
        }),
      );
      return;
    }
    if (
      request.method === 'GET' &&
      url.searchParams.get('cmd') === 'sms_cmd_status_info'
    ) {
      response.end(JSON.stringify({ sms_cmd_status_result: '3' }));
      return;
    }
    if (
      request.method === 'GET' &&
      url.searchParams.get('cmd') === 'sms_data_total'
    ) {
      messagePollCount += 1;
      if (ussdSendCount > 0 && !balanceDelivered) {
        incoming = [
          {
            id: 'operator-balance-1',
            tag: '1',
            content: encode(
              'Остаток пакетов: 200 SMS, неиспользованные остатки с прошлого периода: 192 SMS.',
            ),
          },
          ...incoming,
        ];
        balanceDelivered = true;
      }
      response.end(JSON.stringify({ messages: incoming }));
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
      assert.equal(form.get('USSD_send_number'), '*255*0#');
    }
    if (form.get('goformId') === 'DELETE_SMS') {
      const ids = String(form.get('msg_id') ?? '')
        .split(';')
        .filter(Boolean);
      prunedCount += ids.length;
      incoming = incoming.filter((message) => !ids.includes(message.id));
    }
    response.end(JSON.stringify({ result: 'success' }));
  });
  const modemPort = await listen(modem);
  process.env.NODE_ENV = 'test';
  process.env.MODEM_BASE_URL = `http://127.0.0.1:${modemPort}`;
  process.env.SMS_GATEWAY_SHARED_SECRET = 'test-shared-secret';
  process.env.STATE_FILE = `/tmp/artificiallabs-sms-gateway-balance-${process.pid}.json`;
  process.env.SMS_BALANCE_SETTLE_MS = '0';
  process.env.INCOMING_ARCHIVE_FILE = `/tmp/artificiallabs-sms-gateway-incoming-${process.pid}.ndjson`;
  await unlink(process.env.INCOMING_ARCHIVE_FILE).catch(() => undefined);
  const { createGatewayServer, testing } = await import(
    `./server.mjs?balance=${Date.now()}`
  );
  assert.equal(testing.parseRemainingSms('SMS: 1 234 из 1500'), 1234);
  assert.equal(testing.parseRemainingSms('200 SMS и 192 SMS'), 392);
  assert.equal(
    testing.isTariffBalanceMessage('Остаток пакетов: 200 SMS'),
    true,
  );
  assert.equal(testing.parseRemainingSms('Нет данных о пакете'), undefined);
  assert.equal(testing.tariffSmsUnavailable('Запрос неправильный.'), true);
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
  assert.deepEqual(await first.json(), { ok: true, remainingSms: 392 });
  const second = await signedRequest('balance-request-2');
  assert.equal(second.status, 429);
  assert.equal((await second.json()).code, 'SMS_BALANCE_COOLDOWN');
  assert.equal(ussdSendCount, 1);
  const archived = (await readFile(process.env.INCOMING_ARCHIVE_FILE, 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.equal(archived.length, 19);
  assert.equal(archived.at(-1).message.id, 'operator-balance-1');
  assert.equal(prunedCount, 3);
  assert.equal(incoming.length, 16);

  await Promise.all([
    new Promise((resolve) => gateway.close(resolve)),
    new Promise((resolve) => modem.close(resolve)),
  ]);
  await unlink(process.env.INCOMING_ARCHIVE_FILE).catch(() => undefined);
});
