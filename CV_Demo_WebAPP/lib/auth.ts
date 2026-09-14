import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import path from 'node:path';

export const COOKIE = 'cv_demo_session';
export type Session = { id: string; role: 'admin' | 'guest'; owner: string; expiresAt: number; linkId?: string };
type Link = { id: string; label: string; digest: string; createdAt: number; expiresAt: number; revokedAt?: number; uses: number };
type Store = { secret: string; sessions: Session[]; links: Link[]; attempts: Record<string, { count: number; since: number }> };
const folder = () => path.resolve(process.env.CV_DEMO_DATA_DIR || '.data');
function readStore(): Store {
  const dir = folder(); mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, 'access.json');
  if (!existsSync(file)) {
    const initial: Store = { secret: randomBytes(48).toString('hex'), sessions: [], links: [], attempts: {} };
    try { writeFileSync(file, JSON.stringify(initial), { flag: 'wx', mode: 0o600 }); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
  }
  return JSON.parse(readFileSync(file, 'utf8')) as Store;
}
function save(store: Store) {
  const now = Date.now();
  store.sessions = store.sessions.filter(s => s.expiresAt > now);
  for (const [key, value] of Object.entries(store.attempts)) if (now - value.since > 15 * 60_000) delete store.attempts[key];
  const file = path.join(folder(), 'access.json');
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(store), { mode: 0o600 }); renameSync(temp, file);
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const equal = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const sign = (id: string, secret: string) => createHmac('sha256', secret).update(id).digest('base64url');
// Demo credentials are server-only. The password itself is never shipped to the browser.
const PASSWORD_SALT = 'sfera-cv-demo-2026';
const PASSWORD_HASH = '59d3ef92cb2589f5db5c64ba776ec9552bfe5f434fddc99e84f9c745294032c0';
export function checkCredentials(login: string, password: string): boolean {
  if (password.length > 256 || login.length > 128) return false;
  const hash = scryptSync(password, PASSWORD_SALT, 32).toString('hex');
  return equal(digest(login), digest('admin')) && equal(hash, PASSWORD_HASH);
}
export function rateLimit(bucket: string, limit = 12): boolean {
  const store = readStore(); const key = digest(bucket); const now = Date.now();
  let entry = store.attempts[key];
  if (!entry || now - entry.since > 15 * 60_000) entry = { count: 0, since: now };
  entry.count++; store.attempts[key] = entry; save(store);
  return entry.count <= limit;
}
export function createSession(role: Session['role'], link?: Link) {
  const store = readStore(); const session: Session = {
    id: randomBytes(32).toString('base64url'), role,
    owner: link ? `guest-${link.id}` : 'admin',
    expiresAt: Math.min(Date.now() + 24 * 60 * 60_000, link?.expiresAt ?? Infinity),
    ...(link ? { linkId: link.id } : {}),
  };
  store.sessions.push(session); save(store);
  return { session, token: `${session.id}.${sign(session.id, store.secret)}` };
}
export function getSession(token?: string): Session | null {
  if (!token || token.length > 200) return null;
  const [id, signature, extra] = token.split('.'); if (!id || !signature || extra) return null;
  const store = readStore(); if (!equal(signature, sign(id, store.secret))) return null;
  const session = store.sessions.find(s => s.id === id && s.expiresAt > Date.now());
  if (!session) return null;
  if (session.linkId && !store.links.some(l => l.id === session.linkId && !l.revokedAt && l.expiresAt > Date.now())) return null;
  return session;
}
export function logout(token?: string) {
  const session = getSession(token); if (!session) return;
  const store = readStore(); store.sessions = store.sessions.filter(s => s.id !== session.id); save(store);
}
export function listLinks() {
  return readStore().links.map(({ digest: _digest, ...link }) => link).sort((a,b) => b.createdAt-a.createdAt);
}
export function createLink(label: string, hours: number) {
  const store = readStore();
  if (store.links.filter(l => !l.revokedAt && l.expiresAt > Date.now()).length >= 100) throw new Error('Сначала отзовите одну из действующих ссылок.');
  const token = randomBytes(32).toString('base64url');
  const link: Link = { id: randomBytes(12).toString('hex'), label: label.trim().slice(0,80) || 'Гостевой доступ', digest: digest(token), createdAt: Date.now(), expiresAt: Date.now() + hours * 60 * 60_000, uses: 0 };
  store.links.push(link); save(store); return { token, link: listLinks().find(l => l.id === link.id)! };
}
export function exchangeLink(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const store = readStore(); const hash = digest(token);
  const link = store.links.find(l => equal(l.digest, hash) && !l.revokedAt && l.expiresAt > Date.now());
  if (!link) return null;
  link.uses++; save(store); return createSession('guest', link);
}
export function revokeLink(id: string) {
  const store = readStore(); const link = store.links.find(l => l.id === id);
  if (link) { link.revokedAt = Date.now(); store.sessions = store.sessions.filter(s => s.linkId !== id); save(store); }
}
