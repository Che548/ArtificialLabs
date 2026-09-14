import { NextRequest } from 'next/server';
import { createLink, listLinks, revokeLink } from '../../../lib/auth';
import { json, sameOrigin, sessionFrom, smallJson } from '../../../lib/http';
export const runtime='nodejs';
export async function GET(req:NextRequest) { if(sessionFrom(req)?.role!=='admin') return json({error:'Нет доступа.'},403); return json({links:listLinks()}); }
export async function POST(req:NextRequest) {
  if(!sameOrigin(req) || sessionFrom(req)?.role!=='admin') return json({error:'Нет доступа.'},403);
  try { const b=await smallJson(req); if(typeof b.label!=='string'|| ![1,24,168].includes(Number(b.hours))) return json({error:'Проверьте срок действия ссылки.'},400);
    return json(createLink(b.label,Number(b.hours)));
  } catch(e) { return json({error:e instanceof Error?e.message:'Не удалось создать ссылку.'},400); }
}
export async function DELETE(req:NextRequest) {
  if(!sameOrigin(req) || sessionFrom(req)?.role!=='admin') return json({error:'Нет доступа.'},403);
  try { const b=await smallJson(req); if(typeof b.id!=='string') return json({error:'Не указана ссылка.'},400); revokeLink(b.id); return json({ok:true}); } catch {return json({error:'Не удалось отозвать ссылку.'},400);}
}
