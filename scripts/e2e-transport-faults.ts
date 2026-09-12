import type { IncomingMessage, ServerResponse } from 'node:http';

// Local test proxy only; no request payloads or target state are retained.
export function createTransportFaults(enabled: boolean) {
  let offline = false;
  const connections = new Set<() => void>();
  return {
    get offline() {
      return offline;
    },
    register(close: () => void) {
      if (offline) close();
      else connections.add(close);
      return () => connections.delete(close);
    },
    handle(request: IncomingMessage, response: ServerResponse) {
      if (!enabled || !request.url?.startsWith('/__e2e_transport/'))
        return false;
      if (
        request.method !== 'POST' ||
        request.headers['x-e2e-control'] !== 'local-qa' ||
        request.headers.origin
      ) {
        response.writeHead(403).end();
        return true;
      }
      if (
        !['/__e2e_transport/down', '/__e2e_transport/up'].includes(request.url)
      ) {
        response.writeHead(404).end();
        return true;
      }
      offline = request.url.endsWith('/down');
      if (offline) {
        for (const close of [...connections]) close();
        connections.clear();
      }
      response.writeHead(204).end();
      return true;
    },
  };
}
