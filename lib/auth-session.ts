export function userIdFromAuthToken(token: string | null | undefined) {
  if (!token) return undefined;
  try {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) return undefined;
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      '=',
    );
    const payload = JSON.parse(atob(padded)) as { sub?: unknown };
    if (typeof payload.sub !== 'string') return undefined;
    const [userId] = payload.sub.split('|');
    return userId || undefined;
  } catch {
    return undefined;
  }
}
