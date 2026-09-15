import { spawn } from 'node:child_process';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { decodeScanImage } from './image';
import { DEFAULT_ASSAY_PROFILE, DEFAULT_CARD_PROFILE } from '../../services/scanning/profiles';
import { parseCvProfileQr } from '../../services/scanning/profile-qr';
import { assertTrustedCvProfileEnvelope } from '../../services/scanning/profile-trust';
import { initialProduct, type AnalysisResponse, type Product } from './contracts';
import { adaptLearnedStripResult } from '../../modules/strip-cv/src/LearnedStripResult';
import { matchesCurrentReader } from './reader-version';
export class CvError extends Error { constructor(message:string,public status=422){super(message);} }
export const cliPath=()=>process.env.STRIPCV_CLI || path.resolve(process.cwd(),'../web-build/stripcv-native/stripcv_cli');
export const modelsPath=()=>process.env.STRIPCV_MODELS || path.resolve(process.cwd(),'../modules/strip-cv/models/reader-20260914');
let active=0;
export function resolveProduct(batch:string,qr:string):Product {
  if(qr){const envelope=parseCvProfileQr(qr);if(!envelope)throw new CvError('QR-код не содержит профиль теста. Введите номер партии вручную.');
    try{assertTrustedCvProfileEnvelope(envelope);}catch{throw new CvError('QR-профиль не входит в список доверенных. Используйте номер партии и встроенный профиль.');}
    return {label:envelope.product?.label||initialProduct.label,batch:envelope.product?.batch||envelope.assay_profile.version,expiresAt:envelope.product?.expires_at||'',source:'qr'};
  }
  if(batch && !/^[\p{L}\p{N} ._\/-]{1,80}$/u.test(batch))throw new CvError('В номере партии допустимы буквы, цифры, пробел, дефис, точка и косая черта.');
  return batch?{...initialProduct,batch,source:'manual'}:initialProduct;
}
export async function analyzeImage(bytes:Buffer,options:{corners?:unknown;flip?:boolean;batch:string;qr:string},abort?:AbortSignal):Promise<AnalysisResponse> {
  if(abort?.aborted)throw new CvError('Анализ отменён.',499);
  if(!existsSync(cliPath()))throw new CvError('Модуль анализа ещё не собран. Запустите npm run build:cv на сервере.',503);
  if(active>=2)throw new CvError('Анализатор занят. Попробуйте через несколько секунд.',429);
  active++;
  try {
    const product=resolveProduct(options.batch,options.qr);
    const {data,info}=await decodeScanImage(bytes);
    if(info.width<64||info.height<64||info.width>6000||info.height>6000)throw new CvError('Выберите изображение от 64 до 6000 пикселей по стороне.');
    let corners:null|number[][]=null;
    if(options.corners!=null){
      if(!Array.isArray(options.corners)||options.corners.length!==4||!options.corners.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=0&&p[0]<info.width&&p[1]>=0&&p[1]<info.height))throw new CvError('Границы полоски выходят за пределы снимка.');
      corners=options.corners;
    }
    // Match mobile routing: automatic counts use the learned reader; explicit
    // manual geometry continues through the shared classical correction path.
    const learned=corners===null && options.flip!==true;
    if(learned && !['detector','points','presence','coverage','auxiliary','local_bands'].every(name=>existsSync(path.join(modelsPath(),`${name}.onnx`))))throw new CvError('Модели анализа недоступны. Запустите npm run build:cv на сервере.',503);
    const input=JSON.stringify({rgb_base64:data.toString('base64'),width:info.width,height:info.height,row_stride:info.width*3,assay_profile:DEFAULT_ASSAY_PROFILE,card_profile:DEFAULT_CARD_PROFILE,options:{cutoff:null,corner_override:corners,flip_orientation:options.flip===true,include_rectified_image:true}});
    const analysis=await new Promise<AnalysisResponse['analysis']>((resolve,reject)=>{
      const child=spawn(cliPath(),learned?['--learned',modelsPath()]:[],{stdio:['pipe','pipe','pipe'],shell:false});let output='';let count=0;let done=false;
      const finish=(error?:Error)=>{if(done)return;done=true;clearTimeout(timer);abort?.removeEventListener('abort',cancel);if(error){child.kill('SIGKILL');reject(error);}else{try{if(learned && !matchesCurrentReader(output))throw new CvError('Версия анализатора не совпадает с приложением. Пересоберите CV демо.',503);const value=learned?adaptLearnedStripResult(output,DEFAULT_ASSAY_PROFILE):JSON.parse(output);if(value.schema_version!=='1.0'||!value.peaks||!['valid','invalid','review'].includes(value.status))throw Error();resolve(value);}catch(error){reject(error instanceof CvError?error:new CvError('Анализатор вернул некорректный ответ.',502));}}};
      const cancel=()=>finish(new CvError('Анализ отменён.',499));
      const timer=setTimeout(()=>finish(new CvError('Анализ занял слишком много времени. Попробуйте другой снимок.',504)),30_000);
      child.stdout.on('data',(part:Buffer)=>{count+=part.length;if(count>8*1024*1024)finish(new CvError('Ответ анализатора слишком большой.',502));else output+=part.toString();});
      child.stderr.resume();child.stdin.on('error',()=>finish(new CvError('Не удалось передать снимок анализатору.',502)));
      child.on('error',()=>finish(new CvError('Не удалось запустить модуль анализа.',503)));
      child.on('close',code=>finish(code===0?undefined:new CvError('Не удалось обработать снимок. Проверьте изображение и границы полоски.')));
      abort?.addEventListener('abort',cancel,{once:true});if(abort?.aborted){cancel();return;}
      child.stdin.end(input);
    });
    return {analysis,width:info.width,height:info.height,product};
  }catch(e){if(e instanceof CvError)throw e;throw new CvError('Не удалось прочитать изображение. Используйте JPEG, PNG или WebP.');}
  finally{active--;}
}
