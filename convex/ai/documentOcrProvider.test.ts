import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { recognizeWithQwen } from './documentOcrProvider';
import { OCR_LIMITS, OCR_MODEL } from '../../shared/document-ocr';
beforeEach(() => {
  vi.stubEnv('YANDEX_AI_API_KEY', 'synthetic-key');
  vi.stubEnv('YANDEX_AI_FOLDER_ID', 'synthetic-folder');
  vi.stubEnv('YANDEX_DOCUMENT_OCR_MODEL', OCR_MODEL);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
const result = { version: 1, text: '', rows: [], dates: [], issues: [] };
test('uses image input, independent exact model, no logging and no tools', async () => {
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
    expect(init.headers).toMatchObject({ 'x-data-logging-enabled': 'false' });
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe(`gpt://synthetic-folder/${OCR_MODEL}`);
    expect(body.tools).toBeUndefined();
    expect(body.store).toBe(false);
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.response_format.json_schema.schema.required).toEqual(
      expect.arrayContaining(['version', 'text', 'rows', 'dates', 'issues']),
    );
    expect(body.messages[1].content[1].image_url.url).toBe(
      'data:image/jpeg;base64,/9j/AAAA',
    );
    return Response.json({
      choices: [
        { finish_reason: 'stop', message: { content: JSON.stringify(result) } },
      ],
    });
  });
  vi.stubGlobal('fetch', fetcher);
  expect((await recognizeWithQwen('/9j/AAAA')).result).toEqual(result);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toMatch(
    /raw secret|medical content|synthetic-key|\/9j/,
  );
});

test.each(['envelope', 'transcription'])(
  'malformed %s JSON is invalid output, not provider downtime',
  async (phase) => {
    vi.stubGlobal('fetch', async () =>
      phase === 'envelope'
        ? new Response('{invalid secret payload')
        : Response.json({
            choices: [
              {
                finish_reason: 'stop',
                message: { content: '{invalid secret payload' },
              },
            ],
          }),
    );
    await expect(recognizeWithQwen('/9j/AAAA')).rejects.toThrow(
      /^OCR_INVALID_OUTPUT$/,
    );
    expect(console.warn).toHaveBeenCalledWith(
      'document_ocr_provider_failure',
      expect.objectContaining({
        code: 'OCR_INVALID_OUTPUT',
        httpStatus: 200,
        phase: phase === 'envelope' ? 'response_json' : 'transcription_json',
      }),
    );
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(
      'secret payload',
    );
  },
);

test('timeout aborts once, reports metadata only and never retries', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn(
    (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal!.addEventListener('abort', () =>
          reject(new DOMException('Private transport details', 'AbortError')),
        );
      }),
  );
  vi.stubGlobal('fetch', fetcher);
  const pending = expect(recognizeWithQwen('/9j/AAAA')).rejects.toThrow(
    /^OCR_PROVIDER_UNAVAILABLE$/,
  );
  await vi.advanceTimersByTimeAsync(OCR_LIMITS.timeoutMs);
  await pending;
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(console.warn).toHaveBeenCalledWith(
    'document_ocr_provider_failure',
    expect.objectContaining({ timedOut: true, phase: 'request' }),
  );
  expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(
    'Private',
  );
  expect(vi.getTimerCount()).toBe(0);
});
test.each(['length', 'content_filter'])(
  'rejects %s partial response',
  async (finish) => {
    vi.stubGlobal('fetch', async () =>
      Response.json({
        choices: [
          {
            finish_reason: finish,
            message: { content: JSON.stringify(result) },
          },
        ],
      }),
    );
    await expect(recognizeWithQwen('/9j/AAAA')).rejects.toThrow(
      'OCR_INVALID_OUTPUT',
    );
  },
);
test('never retries or exposes raw provider error, credentials or content', async () => {
  const fetcher = vi.fn(async () => {
    throw new Error('raw secret medical content');
  });
  vi.stubGlobal('fetch', fetcher);
  await expect(recognizeWithQwen('/9j/AAAA')).rejects.toThrow(
    /^OCR_PROVIDER_UNAVAILABLE$/,
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test('v2 separates image transcription from structured extraction without retransmitting the image or rewriting text', async () => {
  const source='Conclusion: sample processed.';
  const structured={rows:[],issues:[],structure:{version:1,title:'',pageRole:'content',dates:[],blocks:[{kind:'conclusion',text:source,section:''}]}};
  const requests:Record<string,any>[]=[];
  vi.stubGlobal('fetch',async (_url:string,init:RequestInit)=>{
    const body=JSON.parse(init.body as string);requests.push(body);
    const content=requests.length===1?{text:source,issues:['source_unclear']}:structured;
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(content)}}]});
  });
  const output=(await recognizeWithQwen('/9j/AAAA',2)).result;
  expect(requests).toHaveLength(2);expect(requests[0].messages[1].content[1].type).toBe('image_url');
  expect(JSON.stringify(requests[1])).not.toContain('/9j/');expect(requests[1].messages[1].content).toBe(JSON.stringify({transcription:source}));
  expect(requests.every(r=>r.store===false && r.model===`gpt://synthetic-folder/${OCR_MODEL}`)).toBe(true);
  expect(output.text).toBe(source);expect(output.issues).toContain('source_unclear');expect(output.structure?.blocks[0].kind).toBe('conclusion');
});

test('failed or fabricated second-stage extraction is not retried or accepted', async () => {
  const fetcher=vi.fn().mockResolvedValueOnce(Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({text:'Source',issues:[]})}}]})).mockResolvedValueOnce(Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({rows:[],issues:[],structure:{version:1,title:'',pageRole:'content',dates:[],blocks:[{kind:'conclusion',text:'Invented',section:''}]}})}}]}));
  vi.stubGlobal('fetch',fetcher);await expect(recognizeWithQwen('/9j/AAAA',2)).rejects.toThrow('OCR_INVALID_OUTPUT');expect(fetcher).toHaveBeenCalledTimes(2);
});

test('both v2 stages share the original page deadline', async () => {
  vi.useFakeTimers();const signals:AbortSignal[]=[];
  vi.stubGlobal('fetch',async (_url:string,init:RequestInit)=>{
    signals.push(init.signal as AbortSignal);
    if(signals.length===1){await new Promise(resolve=>setTimeout(resolve,30000));return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({text:'Source',issues:[]})}}]});}
    return new Promise<Response>((_,reject)=>init.signal!.addEventListener('abort',()=>reject(new DOMException('timeout','AbortError')),{once:true}));
  });
  const failure=expect(recognizeWithQwen('/9j/AAAA',2)).rejects.toThrow('OCR_PROVIDER_UNAVAILABLE');
  await vi.advanceTimersByTimeAsync(OCR_LIMITS.timeoutMs);await failure;
  expect(signals).toHaveLength(2);expect(signals[0]).toBe(signals[1]);expect(signals[1].aborted).toBe(true);expect(vi.getTimerCount()).toBe(0);
});

test('consent revocation between stages prevents further provider transmission', async () => {
  const fetcher=vi.fn(async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({text:'Source',issues:[]})}}]}));
  vi.stubGlobal('fetch',fetcher);
  await expect(recognizeWithQwen('/9j/AAAA',2,async()=>{throw new Error('OCR_CONSENT_REQUIRED');})).rejects.toThrow('OCR_CONSENT_REQUIRED');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
