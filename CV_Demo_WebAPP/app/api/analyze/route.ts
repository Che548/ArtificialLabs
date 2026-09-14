import { NextRequest } from 'next/server';
import { analyzeImage, CvError } from '../../../lib/cv';
import { json, sameOrigin, sessionFrom } from '../../../lib/http';
import { rateLimit } from '../../../lib/auth';
export const runtime='nodejs';
export const maxDuration=40;
export async function POST(req:NextRequest) {
  if(!sameOrigin(req))return json({error:'Запрос отклонён.'},403);
  const session=sessionFrom(req);if(!session)return json({error:'Сессия истекла. Войдите снова.'},401);
  if(!rateLimit(`scan:${session.id}`,60))return json({error:'Слишком много снимков. Повторите позже.'},429);
  const max=13*1024*1024;
  if(Number(req.headers.get('content-length'))>max)return json({error:'Файл слишком большой. Максимум 12 МБ.'},413);
  try {
    const reader=req.body?.getReader();if(!reader)throw new CvError('Выберите фотографию.');const chunks:Uint8Array[]=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();return json({error:'Файл слишком большой. Максимум 12 МБ.'},413);}chunks.push(value);}
    const form=await new Response(Buffer.concat(chunks),{headers:{'Content-Type':req.headers.get('content-type')||''}}).formData();
    const file=form.get('image');if(!(file instanceof File)||file.size>12*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type))throw new CvError('Выберите JPEG, PNG или WebP до 12 МБ.');
    const batch=String(form.get('batch')||'').slice(0,81);const qr=String(form.get('qr')||'');if(qr.length>32_000)throw new CvError('QR-код слишком большой.');
    const corners=form.get('corners');
    const result=await analyzeImage(Buffer.from(await file.arrayBuffer()),{batch,qr,corners:corners?JSON.parse(String(corners)):null,flip:form.get('flip')==='true'},req.signal);
    return json(result);
  }catch(e){return json({error:e instanceof CvError?e.message:'Не удалось обработать запрос.'},e instanceof CvError?e.status:400);}
}
