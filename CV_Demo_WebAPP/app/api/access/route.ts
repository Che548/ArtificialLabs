import { NextRequest } from 'next/server';
import { exchangeLink, rateLimit } from '../../../lib/auth';
import { json, sameOrigin, sessionResponse, smallJson } from '../../../lib/http';
export const runtime='nodejs';
export async function POST(req:NextRequest) {
  if (!sameOrigin(req)) return json({error:'Запрос отклонён.'},403);
  if (!rateLimit('link-exchange',60)) return json({error:'Слишком много запросов. Попробуйте позже.'},429);
  try { const body=await smallJson(req); const result=typeof body.token==='string' ? exchangeLink(body.token):null;
    if (!result) return json({error:'Ссылка недействительна, отозвана или срок её действия истёк.'},401);
    return sessionResponse(req,result.token,result.session);
  } catch { return json({error:'Не удалось проверить ссылку.'},400); }
}
