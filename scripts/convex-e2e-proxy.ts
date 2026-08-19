import http, { type IncomingHttpHeaders, type IncomingMessage } from 'node:http';
import https from 'node:https';
import { readFileSync } from 'node:fs';
import tls from 'node:tls';

type ProxyDefinition = {
  name: string;
  port: number;
  target: URL;
  tlsCertificate?: string;
  tlsKey?: string;
};

const DEFAULT_BACKEND_PORT = 3320;
const DEFAULT_SITE_PORT = 3321;
const DEFAULT_IOS_BACKEND_PORT = 3340;

export function rewriteRequestHeaders(
  headers: IncomingHttpHeaders,
  target: URL,
): IncomingHttpHeaders {
  const rewritten = { ...headers, host: target.host };
  const origin = headers.origin;
  if (typeof origin === 'string' && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(origin)) {
    rewritten.origin = target.origin;
  }
  return rewritten;
}

function serializeUpgradeRequest(request: IncomingMessage, target: URL) {
  const headers = rewriteRequestHeaders(request.headers, target);
  const lines = [`${request.method} ${request.url} HTTP/${request.httpVersion}`];
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) lines.push(`${name}: ${item}`);
    } else {
      lines.push(`${name}: ${value}`);
    }
  }
  return `${lines.join('\r\n')}\r\n\r\n`;
}

function createProxy({ name, port, target, tlsCertificate, tlsKey }: ProxyDefinition) {
  const targetPort = Number(target.port || 443);
  const handleRequest: http.RequestListener = (request, response) => {
    if (request.url === '/__e2e_proxy_health') {
      response.writeHead(204).end();
      return;
    }

    const upstream = https.request(
      {
        hostname: target.hostname,
        port: targetPort,
        servername: target.hostname,
        method: request.method,
        path: request.url,
        headers: rewriteRequestHeaders(request.headers, target),
      },
      (upstreamResponse) => {
        response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
        upstreamResponse.pipe(response);
      },
    );
    upstream.setTimeout(15_000, () => upstream.destroy(new Error(`${name} upstream timeout`)));
    upstream.on('error', (error) => {
      if (!response.headersSent) response.writeHead(502);
      response.end(`E2E proxy error: ${error.message}`);
    });
    request.pipe(upstream);
  };
  const server =
    tlsCertificate && tlsKey
      ? https.createServer(
          {
            cert: readFileSync(tlsCertificate),
            key: readFileSync(tlsKey),
          },
          handleRequest,
        )
      : http.createServer(handleRequest);

  server.on('upgrade', (request, socket, head) => {
    const upstream = tls.connect({
      host: target.hostname,
      port: targetPort,
      servername: target.hostname,
    });
    const closeBoth = (error?: Error) => {
      if (error) console.error(`${name} WebSocket proxy error: ${error.message}`);
      upstream.destroy();
      socket.destroy();
    };
    upstream.setTimeout(15_000, () => closeBoth(new Error('upstream timeout')));
    upstream.once('secureConnect', () => {
      upstream.setTimeout(0);
      upstream.write(serializeUpgradeRequest(request, target));
      if (head.length > 0) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    upstream.on('error', closeBoth);
    socket.on('error', closeBoth);
  });

  server.listen(port, '127.0.0.1', () => {
    const protocol = tlsCertificate ? 'https' : 'http';
    console.log(`${name} E2E proxy listening on ${protocol}://127.0.0.1:${port} -> ${target.origin}`);
  });
  return server;
}

function requiredHttpsUrl(name: string, value: string | undefined) {
  if (!value) throw new Error(`${name} is required`);
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error(`${name} must use https`);
  return url;
}

if (process.argv[1]?.endsWith('convex-e2e-proxy.ts')) {
  const backendTarget = requiredHttpsUrl(
    'CONVEX_SELF_HOSTED_URL',
    process.env.CONVEX_SELF_HOSTED_URL ?? process.env.EXPO_PUBLIC_CONVEX_URL,
  );
  const backend = createProxy({
    name: 'Convex backend',
    port: Number(process.env.E2E_CONVEX_PROXY_PORT ?? DEFAULT_BACKEND_PORT),
    target: backendTarget,
  });
  const site = createProxy({
    name: 'Convex site',
    port: Number(process.env.E2E_CONVEX_SITE_PROXY_PORT ?? DEFAULT_SITE_PORT),
    target: requiredHttpsUrl(
      'EXPO_PUBLIC_CONVEX_SITE_URL',
      process.env.EXPO_PUBLIC_CONVEX_SITE_URL,
    ),
  });
  const iosBackend = createProxy({
    name: 'Convex iOS backend',
    port: Number(
      process.env.E2E_CONVEX_IOS_PROXY_PORT ?? DEFAULT_IOS_BACKEND_PORT,
    ),
    target: backendTarget,
    tlsCertificate: process.env.E2E_CONVEX_TLS_CERT,
    tlsKey: process.env.E2E_CONVEX_TLS_KEY,
  });
  const shutdown = () => {
    backend.close();
    site.close();
    iosBackend.close();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
