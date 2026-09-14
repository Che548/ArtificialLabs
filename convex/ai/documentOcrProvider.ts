import {
  OCR_INSTRUCTIONS,
  OCR_TRANSCRIPTION_INSTRUCTIONS,
  OCR_EXTRACTION_INSTRUCTIONS,
  OCR_LIMITS,
  OCR_MODEL,
  parseOcrPage,
} from '../../shared/document-ocr';

const stringArray = { type: 'array', items: { type: 'string' } };
const rowProperties = {
  name: { type: 'string' },
  value: { type: 'string' },
  unit: { type: 'string' },
  reference: { type: 'string' },
  sourceText: { type: 'string' },
  date: { type: 'string' },
  issues: stringArray,
};
const responseFormat = {
  type: 'json_schema',
  json_schema: {
    name: 'document_page',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['version', 'text', 'rows', 'dates', 'issues'],
      properties: {
        version: { type: 'integer', enum: [1] },
        text: { type: 'string' },
        dates: stringArray,
        issues: stringArray,
        rows: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: Object.keys(rowProperties),
            properties: rowProperties,
          },
        },
      },
    },
  },
};

const strictObject = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const string = { type: 'string' };
const structureFormat = {
  type: 'json_schema',
  json_schema: {
    name: 'document_page_v2',
    strict: true,
    schema: strictObject({
      version: { type: 'integer', enum: [2] },
      text: string,
      dates: stringArray,
      issues: stringArray,
      rows: {
        type: 'array',
        items: strictObject({
          ...rowProperties,
          section: string,
          kind: {
            type: 'string',
            enum: ['observation', 'method', 'reference', 'other'],
          },
        }),
      },
      structure: strictObject({
        version: { type: 'integer', enum: [1] },
        title: string,
        pageRole: {
          type: 'string',
          enum: ['content', 'cover', 'continuation', 'blank', 'unknown'],
        },
        dates: {
          type: 'array',
          items: strictObject({
            kind: {
              type: 'string',
              enum: [
                'collection',
                'received',
                'reported',
                'printed',
                'birth',
                'unknown',
              ],
            },
            text: string,
            sourceText: string,
            section: string,
          }),
        },
        blocks: {
          type: 'array',
          items: strictObject({
            kind: {
              type: 'string',
              enum: ['method', 'conclusion', 'reference', 'note', 'heading'],
            },
            text: string,
            section: string,
          }),
        },
      }),
    }),
  },
};

/** Fetch directly in the HTTP action; both stages share one timeout and store no content. */
export async function recognizeWithQwen(
  image: string,
  formatVersion: 1 | 2 = 1,
  beforeExtraction?: () => Promise<void>,
) {
  const apiKey = process.env.YANDEX_AI_API_KEY,
    folder = process.env.YANDEX_AI_FOLDER_ID,
    model = process.env.YANDEX_DOCUMENT_OCR_MODEL;
  if (!apiKey || !folder || model !== OCR_MODEL)
    throw new Error('OCR_CONFIGURATION');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OCR_LIMITS.timeoutMs),
    startedAt = Date.now();
  let phase = 'request',
    httpStatus: number | undefined;
  type Message = { role: string; content: unknown };
  const complete = async (messages: Message[], format: unknown) => {
    phase = 'request';
    const response = await fetch(
      'https://ai.api.cloud.yandex.net/v1/chat/completions',
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Api-Key ${apiKey}`,
          'OpenAI-Project': folder!,
          'Content-Type': 'application/json',
          'x-data-logging-enabled': 'false',
        },
        body: JSON.stringify({
          model: `gpt://${folder}/${model}`,
          temperature: 0,
          max_tokens: 16000,
          store: false,
          response_format: format,
          messages,
        }),
      },
    );
    httpStatus = response.status;
    if (!response.ok)
      throw new Error(
        response.status === 429
          ? 'OCR_RATE_LIMITED'
          : [400, 401, 403, 404].includes(response.status)
            ? 'OCR_CONFIGURATION'
            : 'OCR_PROVIDER_UNAVAILABLE',
      );
    phase = 'response_body';
    const reader = response.body?.getReader();
    if (!reader) throw new Error('OCR_INVALID_OUTPUT');
    const decoder = new TextDecoder();
    let raw = '',
      size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 1024 * 1024) {
        await reader.cancel();
        throw new Error('OCR_INVALID_OUTPUT');
      }
      raw += decoder.decode(part.value, { stream: true });
    }
    raw += decoder.decode();
    phase = 'response_json';
    const data = JSON.parse(raw),
      choice = data.choices?.[0];
    if (
      choice?.finish_reason !== 'stop' ||
      typeof choice.message?.content !== 'string'
    )
      throw new Error('OCR_INVALID_OUTPUT');
    phase = 'transcription_json';
    return JSON.parse(
      choice.message.content
        .trim()
        .replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/, '$1'),
    );
  };
  try {
    const imageContent = [
      { type: 'text', text: 'Read this document page.' },
      {
        type: 'image_url',
        image_url: { url: `data:image/jpeg;base64,${image}` },
      },
    ];
    if (formatVersion === 1) {
      const parsed = await complete(
        [
          {
            role: 'system',
            content:
              OCR_INSTRUCTIONS +
              ' For each lab row, transcribe a single full line into text and copy that identical line byte-for-byte into sourceText. Never reformat sourceText.',
          },
          { role: 'user', content: imageContent },
        ],
        responseFormat,
      );
      phase = 'validation';
      if (parsed.version !== 1) throw new Error('OCR_INVALID_OUTPUT');
      return { result: parseOcrPage(parsed), model };
    }
    const transcription = await complete(
      [
        { role: 'system', content: OCR_TRANSCRIPTION_INSTRUCTIONS },
        { role: 'user', content: imageContent },
      ],
      {
        type: 'json_schema',
        json_schema: {
          name: 'document_transcription',
          strict: true,
          schema: strictObject({ text: string, issues: stringArray }),
        },
      },
    );
    // Validate the fixed transcription before it is sent to the structuring stage.
    phase = 'validation';
    const recognized = parseOcrPage({
      version: 1,
      text: transcription.text,
      issues: transcription.issues,
      rows: [],
      dates: [],
    });
    await beforeExtraction?.();
    const properties = structureFormat.json_schema.schema.properties as Record<
      string,
      unknown
    >;
    const organized = await complete(
      [
        { role: 'system', content: OCR_EXTRACTION_INSTRUCTIONS },
        {
          role: 'user',
          content: [{type:'text',text:JSON.stringify({transcription:recognized.text})},{type:'image_url',image_url:{url:`data:image/jpeg;base64,${image}`}}],
        },
      ],
      {
        type: 'json_schema',
        json_schema: {
          name: 'document_structure',
          strict: true,
          schema: strictObject({
            rows: properties.rows,
            structure: properties.structure,
            issues: stringArray,
          }),
        },
      },
    );
    phase = 'validation';
    // The structuring stage cannot replace or rewrite the source transcription.
    const result = parseOcrPage({
      version: 2,
      text: recognized.text,
      rows: organized.rows,
      structure: organized.structure,
      issues: organized.issues,
      dates: [],
    });
    result.issues = [
      ...new Set([...recognized.issues, ...result.issues]),
    ].slice(0, 30);
    result.dates = [
      ...new Set(
        result
          .structure!.dates.filter((d) => d.kind === 'collection')
          .map((d) => d.text),
      ),
    ].slice(0, 20);
    return { result, model };
  } catch (error) {
    const code =
      error instanceof SyntaxError
        ? 'OCR_INVALID_OUTPUT'
        : error instanceof Error
          ? error.message
          : '';
    const safeCode = [
      'OCR_RATE_LIMITED',
      'OCR_CONFIGURATION',
      'OCR_PROVIDER_UNAVAILABLE',
      'OCR_INVALID_OUTPUT',
      'OCR_CONSENT_REQUIRED',
      'OCR_CLOUD_SYNC_REQUIRED',
      'OCR_ACCOUNT_UNAVAILABLE',
      'OCR_SERVICE_DISABLED',
    ].includes(code)
      ? code
      : 'OCR_PROVIDER_UNAVAILABLE';
    console.warn('document_ocr_provider_failure', {
      code: safeCode,
      phase,
      httpStatus,
      timedOut: controller.signal.aborted,
      seconds: Math.round((Date.now() - startedAt) / 1000),
    });
    throw new Error(safeCode);
  } finally {
    clearTimeout(timeout);
  }
}
