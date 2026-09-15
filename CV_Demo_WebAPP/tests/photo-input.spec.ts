import {test,expect} from '@playwright/test';
import {normalizePhoto} from '../lib/client';

for(const type of ['image/jpeg','image/png','image/webp']) {
  test(`supported ${type} uploads retain original bytes and full resolution`,async({page})=>{
    const result=await page.evaluate(async({source,type})=>{
      const normalize=(0,eval)(`(${source})`) as (file:Blob)=>Promise<Blob>;
      const canvas=document.createElement('canvas');
      canvas.width=2560;canvas.height=1920;
      const ctx=canvas.getContext('2d')!;
      ctx.fillStyle='rgba(153,51,85,0.5)';ctx.fillRect(0,0,2560,1920);
      const input=await new Promise<Blob>(resolve=>canvas.toBlob(blob=>resolve(blob!),type,1));
      const output=await normalize(input);
      const a=new Uint8Array(await input.arrayBuffer());
      const b=new Uint8Array(await output.arrayBuffer());
      const bitmap=await createImageBitmap(output);
      const result={sameBytes:a.length===b.length&&a.every((value,i)=>value===b[i]),width:bitmap.width,height:bitmap.height,type:output.type};
      bitmap.close();return result;
    },{source:normalizePhoto.toString(),type});
    expect(result).toEqual({sameBytes:true,width:2560,height:1920,type});
  });
}

test('oversize uploads are rejected before image decoding',async({page})=>{
  const message=await page.evaluate(async(source)=>{
    const normalize=(0,eval)(`(${source})`) as (file:Blob)=>Promise<Blob>;
    try {await normalize(new Blob([new Uint8Array(12*1024*1024+1)],{type:'image/jpeg'}));}
    catch(error){return (error as Error).message;}
    return null;
  },normalizePhoto.toString());
  expect(message).toMatch(/12 МБ/);
});
