import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {decodeScanImage} from '../lib/image';

test('transparent source pixels are composited onto white before CV',async()=>{
  const source=await sharp({create:{width:64,height:64,channels:4,background:{r:255,g:0,b:0,alpha:0}}}).png().toBuffer();
  const {data,info}=await decodeScanImage(source);
  assert.equal(info.channels,3);
  assert.ok(data.every(value=>value===255));
});

test('preserved JPEG orientation is applied once and pixels keep their resolution',async()=>{
  const source=await sharp({create:{width:2560,height:1920,channels:3,background:'#993355'}})
    .jpeg({quality:100}).withMetadata({orientation:6}).toBuffer();
  const {info}=await decodeScanImage(source);
  assert.equal(info.width,1920);
  assert.equal(info.height,2560);
  assert.equal(info.channels,3);
});
