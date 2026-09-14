import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {analyzeImage,resolveProduct} from '../lib/cv';
import {getAnalysisDecision} from '../lib/contracts';
test('batch validation and locked QR profile',()=>{assert.equal(resolveProduct('ABC-25','').batch,'ABC-25');assert.throws(()=>resolveProduct('<script>',''));assert.throws(()=>resolveProduct('','{"cutoff":0}'));});
test('real native pipeline rejects blank image as reportable',async()=>{const photo=await sharp({create:{width:800,height:400,channels:3,background:'#dddddd'}}).png().toBuffer();const result=await analyzeImage(photo,{batch:'SYNTHETIC',qr:''});assert.equal(result.width,800);assert.equal(result.analysis.schema_version,'1.0');assert.notEqual(getAnalysisDecision(result.analysis),'reportable');assert.equal(result.analysis.signal.classification,null);});
test('invalid images and invalid corner coordinates are rejected',async()=>{await assert.rejects(analyzeImage(Buffer.from('not an image'),{batch:'',qr:''}));const photo=await sharp({create:{width:800,height:400,channels:3,background:'#dddddd'}}).png().toBuffer();await assert.rejects(analyzeImage(photo,{batch:'',qr:'',corners:[[0,0],[799,0],[799,500],[0,399]]}),/границы|Границы/);});
