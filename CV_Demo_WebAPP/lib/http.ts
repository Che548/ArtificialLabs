import { NextRequest, NextResponse } from 'next/server';
import { COOKIE, getSession, type Session } from './auth';
export const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
export function sameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  // Next may use its listening address (0.0.0.0) in req.url. The browser
  // sends the actual requested host, such as localhost, in the Host header.
  const url = new URL(req.url);
  const host = req.headers.get('host');
  const allowed = process.env.CV_DEMO_PUBLIC_ORIGIN || (host ? `${url.protocol}//${host}` : url.origin);
  return origin === allowed;
}
export function sessionFrom(req: NextRequest): Session | null { return getSession(req.cookies.get(COOKIE)?.value); }
export function sessionResponse(req: NextRequest, token: string, session: Session) {
  const response = json({ role: session.role, owner: session.owner, expiresAt: session.expiresAt });
  const secure = (process.env.CV_DEMO_PUBLIC_ORIGIN || req.url).startsWith('https:');
  response.cookies.set(COOKIE, token, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: Math.max(1, Math.floor((session.expiresAt-Date.now())/1000)) });
  return response;
}
export async function smallJson(req: NextRequest) {
  const reader = req.body?.getReader(); if (!reader) throw new Error('Пустой запрос.');
  let text = ''; const decoder = new TextDecoder(); let size = 0;
  while (true) { const {done,value} = await reader.read(); if (done) break; size += value.length; if (size > 8192) { await reader.cancel(); throw new Error('Слишком большой запрос.'); } text += decoder.decode(value,{stream:true}); }
  return JSON.parse(text + decoder.decode()) as Record<string, unknown>;
}
