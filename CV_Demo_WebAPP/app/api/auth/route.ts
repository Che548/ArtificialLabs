import { NextRequest } from 'next/server';
import { COOKIE, checkCredentials, createSession, logout, rateLimit } from '../../../lib/auth';
import { json, sameOrigin, sessionFrom, sessionResponse, smallJson } from '../../../lib/http';
export const runtime = 'nodejs';
export async function GET(req: NextRequest) {
  const s = sessionFrom(req); return s ? json({role:s.role,owner:s.owner,expiresAt:s.expiresAt}) : json({error:'Войдите, чтобы продолжить.'},401);
}
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return json({error:'Запрос отклонён.'},403);
  if (!rateLimit('login')) return json({error:'Слишком много попыток. Повторите через 15 минут.'},429);
  try {
    const body = await smallJson(req);
    if (typeof body.login !== 'string' || typeof body.password !== 'string' || !checkCredentials(body.login,body.password)) return json({error:'Неверный логин или пароль.'},401);
    const {session,token} = createSession('admin'); return sessionResponse(req,token,session);
  } catch { return json({error:'Не удалось выполнить вход.'},400); }
}
export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return json({error:'Запрос отклонён.'},403);
  logout(req.cookies.get(COOKIE)?.value); const response = json({ok:true}); response.cookies.delete(COOKIE); return response;
}
