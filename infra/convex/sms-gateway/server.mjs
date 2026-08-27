import { createHmac, timingSafeEqual } from 'node:crypto';
import { appendFile, mkdir, readFile, rename, writeFile, chmod } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import { dirname } from 'node:path';

const PORT = Number(process.env.PORT ?? 8080);
const MODEM_BASE_URL = process.env.MODEM_BASE_URL ?? 'http://192.168.241.17';
const STATE_FILE = process.env.STATE_FILE ?? '/data/idempotency.json';
const INCOMING_ARCHIVE_FILE =
  process.env.INCOMING_ARCHIVE_FILE ?? '/data/incoming-sms-archive.ndjson';
const SHARED_SECRET = process.env.SMS_GATEWAY_SHARED_SECRET ?? '';
const MAX_BODY_BYTES = 2048;
const REPLAY_WINDOW_MS = 60_000;
const IDEMPOTENCY_TTL_MS = 48 * 60 * 60 * 1000;
const TARIFF_REFRESH_MS = 24 * 60 * 60 * 1000;
const USSD_TIMEOUT_MS = 30_000;
const TARIFF_BALANCE_USSD = process.env.SMS_BALANCE_USSD_CODE ?? '*255*0#';
const MODEM_CAPACITY = Number(process.env.MODEM_CAPACITY ?? 20);
const MODEM_INCOMING_TARGET = Number(process.env.MODEM_INCOMING_TARGET ?? 16);

function json(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(body);
}

function encodeUnicode(message) {
  return Array.from(message)
    .map((character) => character.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'))
    .join('');
}

function modemTime(date = new Date()) {
  const parts = [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
  ];
  return parts.map((part) => String(part).padStart(2, '0')).join(';');
}

function modemRequest(url, options, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, { ...options, insecureHTTPParser: true }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const status = response.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          reject(new Error('MODEM_HTTP_ERROR'));
          return;
        }
        resolve(Buffer.concat(chunks).toString('utf8'));
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error('MODEM_TIMEOUT')));
    request.on('error', reject);
    if (body) request.end(body);
    else request.end();
  });
}

async function modemGet(params, timeoutMs = 5000) {
  const url = new URL('/reqproc/proc_get', MODEM_BASE_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const text = (await modemRequest(url, { method: 'GET' }, undefined, timeoutMs))
    .replace(/[\u0000-\u001f]/g, '');
  return JSON.parse(text);
}

async function modemPost(params, timeoutMs = 5000) {
  const body = new URLSearchParams(params).toString();
  const text = await modemRequest(
    new URL('/reqproc/proc_post', MODEM_BASE_URL),
    {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'content-length': Buffer.byteLength(body),
      },
    },
    body,
    timeoutMs,
  );
  return JSON.parse(text);
}

async function listMessages(tags = '10') {
  const payload = await modemGet({
    cmd: 'sms_data_total',
    page: '0',
    data_per_page: '500',
    mem_store: '1',
    tags,
    order_by: 'order by id desc',
  });
  return Array.isArray(payload.messages) ? payload.messages : [];
}

function incomingFingerprint(message) {
  return createHmac('sha256', SHARED_SECRET)
    .update(
      JSON.stringify([
        message.id ?? '',
        message.date ?? '',
        message.number ?? '',
        message.content ?? '',
      ]),
    )
    .digest('hex');
}

async function archiveAndTrimIncoming(messages) {
  const incoming = messages.filter((message) => String(message.tag ?? '1') === '1');
  const fresh = incoming
    .map((message) => ({ fingerprint: incomingFingerprint(message), message }))
    .filter(({ fingerprint }) => !state.archivedIncoming[fingerprint]);
  if (fresh.length > 0) {
    await mkdir(dirname(INCOMING_ARCHIVE_FILE), { recursive: true, mode: 0o700 });
    const archivedAt = Date.now();
    await appendFile(
      INCOMING_ARCHIVE_FILE,
      `${fresh
        .map(({ fingerprint, message }) =>
          JSON.stringify({ fingerprint, archivedAt, message }),
        )
        .join('\n')}\n`,
      { encoding: 'utf8', mode: 0o600 },
    );
    await chmod(INCOMING_ARCHIVE_FILE, 0o600);
    for (const { fingerprint } of fresh) {
      state.archivedIncoming[fingerprint] = archivedAt;
    }
    await queueStateWrite();
  }
  const target = Number.isSafeInteger(MODEM_INCOMING_TARGET)
    ? Math.min(Math.max(MODEM_INCOMING_TARGET, 1), MODEM_CAPACITY - 1)
    : 16;
  const stale = incoming.slice(target).filter((message) => message.id);
  if (stale.length === 0) return incoming;
  const accepted = await modemPost({
    goformId: 'DELETE_SMS',
    msg_id: `${stale.map((message) => message.id).join(';')};`,
    notCallback: 'true',
  });
  if (accepted.result !== 'success' || !(await pollCommand(6))) {
    throw new Error('SMS_STORAGE_CLEANUP_FAILED');
  }
  return incoming.slice(0, target);
}

async function capacity() {
  const messages = await archiveAndTrimIncoming(await listMessages('10'));
  return { total: MODEM_CAPACITY, used: messages.length, free: Math.max(0, MODEM_CAPACITY - messages.length) };
}

async function modemHealth() {
  const status = await modemGet({
    cmd: 'network_type,signalbar',
    multi_data: '1',
  });
  return Boolean(status && typeof status === 'object');
}

function decodeUssdData(value) {
  const text = String(value ?? '').trim();
  if (!/^(?:[0-9a-fA-F]{4})+$/.test(text)) return text;
  let decoded = '';
  for (let index = 0; index < text.length; index += 4) {
    decoded += String.fromCharCode(Number.parseInt(text.slice(index, index + 4), 16));
  }
  return decoded.replace(/\0/g, '').trim();
}

function parseRemainingSms(value) {
  const text = decodeUssdData(value).replace(/[\u00a0\u202f]/g, ' ');
  const afterValues = [
    ...text.matchAll(/(\d[\d ]{0,12})\s*(?:sms|смс)\b/giu),
  ].map((match) => Number(match[1].replace(/\s/g, '')));
  const beforeMatch = text.match(
    /(?:sms|смс)\s*(?:остаток|осталось|доступно)?\s*[:=\-]?\s*(\d[\d ]{0,12})/iu,
  );
  const values = afterValues.length > 0
    ? afterValues
    : beforeMatch
      ? [Number(beforeMatch[1].replace(/\s/g, ''))]
      : [];
  if (
    values.length > 0 &&
    values.every(
      (count) =>
        Number.isSafeInteger(count) && count >= 0 && count <= 1_000_000_000,
    )
  ) {
    const total = values.reduce((sum, count) => sum + count, 0);
    if (Number.isSafeInteger(total) && total <= 1_000_000_000) return total;
  }
  return undefined;
}

function isTariffBalanceMessage(value) {
  const text = decodeUssdData(value);
  return /остаток\s+пакет/iu.test(text) && /(?:sms|смс)/iu.test(text);
}

function tariffSmsUnavailable(value) {
  const text = decodeUssdData(value).toLocaleLowerCase('ru-RU');
  return /запрос\s+неправильн|управлени[ея]\s+тарифом|личн(?:ый|ом)\s+кабинет/iu.test(
    text,
  );
}

async function cancelUssd() {
  await modemPost({
    goformId: 'USSD_PROCESS',
    USSD_operator: 'ussd_cancel',
    notCallback: 'true',
  }).catch(() => undefined);
}

async function tariffBalance() {
  const existingMessages = await archiveAndTrimIncoming(await listMessages('10'));
  if (existingMessages.length >= MODEM_CAPACITY) {
    return { ok: false, code: 'SMS_BALANCE_UNAVAILABLE' };
  }
  const existingMessageIds = new Set(
    existingMessages.map((message) => String(message.id ?? '')),
  );
  const accepted = await modemPost({
    goformId: 'USSD_PROCESS',
    USSD_operator: 'ussd_send',
    USSD_send_number: TARIFF_BALANCE_USSD,
    notCallback: 'true',
  });
  if (accepted.result !== 'success') {
    return { ok: false, code: 'SMS_BALANCE_UNAVAILABLE' };
  }
  try {
    const deadline = Date.now() + USSD_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const status = await modemGet({ cmd: 'ussd_write_flag' });
      const flag = String(status.ussd_write_flag ?? '');
      if (flag === '16') {
        const response = await modemGet({ cmd: 'ussd_data_info' });
        // ZTE firmware variants expose the same value under either the
        // requested command name or the older `ussd_data` alias.
        const responseValue = response.ussd_data_info ?? response.ussd_data;
        const remainingSms = parseRemainingSms(responseValue);
        if (remainingSms !== undefined) return { ok: true, remainingSms };
        if (tariffSmsUnavailable(responseValue)) {
          return { ok: false, code: 'SMS_BALANCE_NOT_INCLUDED' };
        }
        break;
      }
      if (['1', '2', '3', '4', '10', '41', '99', 'unknown'].includes(flag)) {
        return {
          ok: false,
          code: ['3', '4'].includes(flag)
            ? 'SMS_BALANCE_TIMEOUT'
            : 'SMS_BALANCE_UNAVAILABLE',
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    while (Date.now() < deadline) {
      const messages = await listMessages('10');
      for (const message of messages) {
        if (existingMessageIds.has(String(message.id ?? ''))) continue;
        if (!isTariffBalanceMessage(message.content)) continue;
        const remainingSms = parseRemainingSms(message.content);
        if (remainingSms !== undefined) {
          await archiveAndTrimIncoming(messages);
          return { ok: true, remainingSms };
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    return { ok: false, code: 'SMS_BALANCE_TIMEOUT' };
  } finally {
    await cancelUssd();
  }
}

async function pollCommand(smsCmd, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await modemGet({ cmd: 'sms_cmd_status_info', sms_cmd: String(smsCmd) });
    const result = String(status.sms_cmd_status_result ?? '');
    if (result === '3') return true;
    if (result === '2') return false;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function deleteOwnOutgoing(phone, encodedMessage) {
  const sent = await listMessages('2');
  const own = sent.find(
    (message) =>
      String(message.number ?? '').replace(/\D/g, '') === phone.replace(/\D/g, '') &&
      String(message.content ?? '').toUpperCase() === encodedMessage,
  );
  if (!own?.id) return false;
  const accepted = await modemPost({ goformId: 'DELETE_SMS', msg_id: `${own.id};`, notCallback: 'true' });
  return accepted.result === 'success' && (await pollCommand(6));
}

async function sendSms({ phone, code }) {
  const storage = await capacity();
  if (storage.free < 1) return { ok: false, code: 'SMS_UNAVAILABLE' };
  const message = `ArtificialLabs: код входа ${code}. Никому не сообщайте. Код действует 5 минут.`;
  const encodedMessage = encodeUnicode(message);
  const accepted = await modemPost({
    goformId: 'SEND_SMS',
    notCallback: 'true',
    Number: phone,
    sms_time: modemTime(),
    MessageBody: encodedMessage,
    ID: '-1',
    encode_type: 'UNICODE',
  });
  if (accepted.result !== 'success' || !(await pollCommand(4))) {
    return { ok: false, code: 'SMS_GATEWAY_REJECTED' };
  }
  const cleaned = await deleteOwnOutgoing(phone, encodedMessage).catch(() => false);
  return { ok: true, cleaned };
}

let state = {
  requests: {},
  balanceRequests: {},
  archivedIncoming: {},
  tariffLastAttemptAt: 0,
};
let stateWrite = Promise.resolve();
const inFlight = new Map();

async function loadState() {
  try {
    const parsed = JSON.parse(await readFile(STATE_FILE, 'utf8'));
    if (parsed && typeof parsed.requests === 'object') {
      state = {
        requests: parsed.requests,
        balanceRequests:
          parsed.balanceRequests && typeof parsed.balanceRequests === 'object'
            ? parsed.balanceRequests
            : {},
        archivedIncoming:
          parsed.archivedIncoming && typeof parsed.archivedIncoming === 'object'
            ? parsed.archivedIncoming
            : {},
        tariffLastAttemptAt: Number(parsed.tariffLastAttemptAt) || 0,
      };
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const cutoff = Date.now() - IDEMPOTENCY_TTL_MS;
  state.requests = Object.fromEntries(
    Object.entries(state.requests).filter(([, entry]) => entry.at > cutoff),
  );
  state.balanceRequests = Object.fromEntries(
    Object.entries(state.balanceRequests).filter(([, entry]) => entry.at > cutoff),
  );
}

async function saveState() {
  const temporary = `${STATE_FILE}.tmp`;
  await mkdir(dirname(STATE_FILE), { recursive: true, mode: 0o700 });
  await writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, STATE_FILE);
}

function queueStateWrite() {
  stateWrite = stateWrite.then(saveState, saveState);
  return stateWrite;
}

function validSignature(rawBody, headers) {
  const timestamp = String(headers['x-sms-timestamp'] ?? '');
  const requestId = String(headers['x-sms-request-id'] ?? '');
  const received = String(headers['x-sms-signature'] ?? '');
  if (!SHARED_SECRET || !timestamp || !requestId || !/^[a-f0-9]{64}$/.test(received)) return false;
  if (Math.abs(Date.now() - Number(timestamp)) > REPLAY_WINDOW_MS) return false;
  const expected = createHmac('sha256', SHARED_SECRET)
    .update(`${timestamp}\n${requestId}\n${rawBody}`)
    .digest('hex');
  return timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function createGatewayServer() {
  return createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      try {
        const ready = await modemHealth();
        json(response, ready ? 200 : 503, { ready });
      } catch {
        json(response, 503, { ready: false, code: 'SMS_UNAVAILABLE' });
      }
      return;
    }
    const isSmsRequest = request.method === 'POST' && request.url === '/v1/sms';
    const isBalanceRequest =
      request.method === 'POST' && request.url === '/v1/tariff-balance';
    if (!isSmsRequest && !isBalanceRequest) {
      json(response, 404, { ok: false, code: 'NOT_FOUND' });
      return;
    }
    try {
      const rawBody = await readBody(request);
      if (!validSignature(rawBody, request.headers)) {
        json(response, 401, { ok: false, code: 'UNAUTHORIZED' });
        return;
      }
      const input = JSON.parse(rawBody);
      const requestId = String(request.headers['x-sms-request-id']);
      if (isBalanceRequest) {
        if (input.requestId !== requestId) {
          json(response, 400, { ok: false, code: 'INVALID_REQUEST' });
          return;
        }
        const previous = state.balanceRequests[requestId];
        if (previous) {
          json(response, previous.ok ? 200 : 503, previous.response);
          return;
        }
        const now = Date.now();
        const nextAllowedAt = state.tariffLastAttemptAt + TARIFF_REFRESH_MS;
        if (nextAllowedAt > now) {
          json(response, 429, {
            ok: false,
            code: 'SMS_BALANCE_COOLDOWN',
            nextAllowedAt,
          });
          return;
        }
        state.tariffLastAttemptAt = now;
        await queueStateWrite();
        const result = await tariffBalance().catch(() => ({
          ok: false,
          code: 'SMS_BALANCE_UNAVAILABLE',
        }));
        const safeResponse = result.ok && 'remainingSms' in result
          ? { ok: true, remainingSms: result.remainingSms }
          : {
              ok: false,
              code: ('code' in result && result.code) || 'SMS_BALANCE_UNAVAILABLE',
            };
        state.balanceRequests[requestId] = {
          at: now,
          ok: result.ok,
          response: safeResponse,
        };
        await queueStateWrite();
        json(response, result.ok ? 200 : 503, safeResponse);
        return;
      }
      if (
        input.requestId !== requestId ||
        !/^\+79\d{9}$/.test(input.phone) ||
        !/^\d{6}$/.test(input.code) ||
        !Number.isFinite(input.expiration) ||
        input.expiration <= Date.now()
      ) {
        json(response, 400, { ok: false, code: 'INVALID_REQUEST' });
        return;
      }
      const previous = state.requests[requestId];
      if (previous) {
        json(response, previous.ok ? 200 : 503, previous.response);
        return;
      }
      let operation = inFlight.get(requestId);
      if (!operation) {
        operation = sendSms(input)
          .catch(() => ({ ok: false, code: 'SMS_UNAVAILABLE' }))
          .finally(() => inFlight.delete(requestId));
        inFlight.set(requestId, operation);
      }
      const result = await operation;
      const safeResponse = result.ok
        ? { ok: true }
        : { ok: false, code: result.code ?? 'SMS_UNAVAILABLE' };
      state.requests[requestId] = { at: Date.now(), ok: result.ok, response: safeResponse };
      await queueStateWrite();
      json(response, result.ok ? 200 : 503, safeResponse);
    } catch {
      json(response, 400, { ok: false, code: 'INVALID_REQUEST' });
    }
  });
}

if (process.env.NODE_ENV !== 'test') {
  await loadState();
  createGatewayServer().listen(PORT, '0.0.0.0', () => {
    console.log(`SMS gateway listening on port ${PORT}`);
  });
}

export const testing = {
  decodeUssdData,
  encodeUnicode,
  modemTime,
  parseRemainingSms,
  isTariffBalanceMessage,
  tariffSmsUnavailable,
  validSignature,
};
