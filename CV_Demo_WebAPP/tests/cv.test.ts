import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {execFileSync} from 'node:child_process';
import {analyzeImage,resolveProduct,cliPath,modelsPath,CvError} from '../lib/cv';
import {adaptLearnedStripResult} from '../../modules/strip-cv/src/LearnedStripResult';
import {DEFAULT_ASSAY_PROFILE} from '../../services/scanning/profiles';
import {getAnalysisDecision} from '../lib/contracts';
test('batch validation and locked QR profile',()=>{assert.equal(resolveProduct('ABC-25','').batch,'ABC-25');assert.throws(()=>resolveProduct('<script>',''));assert.throws(()=>resolveProduct('','{"cutoff":0}'));});
test('real native pipeline rejects blank image as reportable',async()=>{const photo=await sharp({create:{width:800,height:400,channels:3,background:'#dddddd'}}).png().toBuffer();const result=await analyzeImage(photo,{batch:'SYNTHETIC',qr:''});assert.equal(result.width,800);assert.equal(result.analysis.schema_version,'1.0');assert.notEqual(getAnalysisDecision(result.analysis),'reportable');assert.equal(result.analysis.signal.classification,null);});
test('invalid images and invalid corner coordinates are rejected',async()=>{await assert.rejects(analyzeImage(Buffer.from('not an image'),{batch:'',qr:''}));const photo=await sharp({create:{width:800,height:400,channels:3,background:'#dddddd'}}).png().toBuffer();await assert.rejects(analyzeImage(photo,{batch:'',qr:'',corners:[[0,0],[799,0],[799,500],[0,399]]}),/границы|Границы/);});
test('web results use exactly the mobile R6 reader and result adapter',async()=>{
  const photo=await sharp({create:{width:800,height:400,channels:3,background:'#dddddd'}}).png().toBuffer();
  const web=await analyzeImage(photo,{batch:'',qr:''});
  const rgb=await sharp(photo).removeAlpha().toColourspace('srgb').raw().toBuffer();
  const raw=execFileSync(cliPath(),['--learned',modelsPath()],{
    input:JSON.stringify({rgb_base64:rgb.toString('base64'),width:800,height:400,row_stride:2400}),
    encoding:'utf8',timeout:30_000,maxBuffer:8*1024*1024,
  });
  const native=adaptLearnedStripResult(raw,DEFAULT_ASSAY_PROFILE);
  assert.equal(web.analysis.algorithm_version,'strip-reader-experimental-20260914-r6');
  assert.ok(web.analysis.reason_codes.includes('learned_count_only'));
  assert.deepEqual({...web.analysis,timings_ms:{}},{...native,timings_ms:{}});
  assert.equal(web.analysis.signal.value,null);
});
test('manual corner correction retains the same classical mobile path',async()=>{
  const photo=await sharp({create:{width:800,height:400,channels:3,background:'#dddddd'}}).png().toBuffer();
  const result=await analyzeImage(photo,{batch:'',qr:'',corners:[[0,0],[799,0],[799,399],[0,399]],flip:true});
  assert.ok(!result.analysis.algorithm_version.startsWith('strip-reader-experimental'));
  assert.notEqual(getAnalysisDecision(result.analysis),'reportable');
});
test('missing models fail closed and an already cancelled scan never starts inference',async()=>{
  const old=process.env.STRIPCV_MODELS;
  process.env.STRIPCV_MODELS='/nonexistent-cv-demo-model-directory';
  try {
    const photo=await sharp({create:{width:64,height:64,channels:3,background:'#dddddd'}}).png().toBuffer();
    await assert.rejects(analyzeImage(photo,{batch:'',qr:''}),e=>e instanceof CvError&&e.status===503);
    await assert.rejects(analyzeImage(photo,{batch:'',qr:''},AbortSignal.abort()),e=>e instanceof CvError&&e.status===499);
  } finally {if(old===undefined)delete process.env.STRIPCV_MODELS;else process.env.STRIPCV_MODELS=old;}
});
