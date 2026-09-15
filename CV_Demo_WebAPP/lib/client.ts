export async function api<T>(url:string,method='GET',body?:unknown,signal?:AbortSignal):Promise<T>{const response=await fetch(url,{method,credentials:'same-origin',cache:'no-store',headers:body instanceof FormData?undefined:body?{'Content-Type':'application/json'}:undefined,body:body instanceof FormData?body:body?JSON.stringify(body):undefined,signal});const result=await response.json();if(!response.ok)throw new Error(result.error||'Не удалось выполнить запрос.');return result;}
export function localDate(date=new Date()){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
export function dateLabel(value:number|string){return new Date(typeof value==='string'?`${value}T12:00:00`:value).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'});}
export async function normalizePhoto(file:Blob):Promise<Blob> {
  if(file.size>12*1024*1024)throw new Error('Размер снимка — не более 12 МБ.');
  const bitmap=await createImageBitmap(file);
  try {
    if(bitmap.width*bitmap.height>20_000_000)throw new Error('Снимок слишком большой. Выберите фото до 20 Мп.');
    // Preserve line pixels and avoid recompressing camera JPEGs. The server
    // applies EXIF orientation and composites transparency onto white.
    if(['image/jpeg','image/png','image/webp'].includes(file.type) &&
       Math.max(bitmap.width,bitmap.height)<=6000)return file;
    const scale=Math.min(1,2400/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.round(bitmap.width*scale);
    canvas.height=Math.round(bitmap.height*scale);
    const ctx=canvas.getContext('2d')!;
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(
      b=>b?resolve(b):reject(Error('Не удалось прочитать снимок.')),'image/jpeg',.94));
  } finally {bitmap.close();}
}
