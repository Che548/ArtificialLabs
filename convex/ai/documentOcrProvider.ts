import {
  OCR_INSTRUCTIONS,
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

/** Fetch directly in the HTTP action: image bytes never enter an action argument or stored file. */
export async function recognizeWithQwen(image: string) {
  const apiKey = process.env.YANDEX_AI_API_KEY;
  const folder = process.env.YANDEX_AI_FOLDER_ID;
  const model = process.env.YANDEX_DOCUMENT_OCR_MODEL;
  if (!apiKey || !folder || model !== OCR_MODEL)
    throw new Error('OCR_CONFIGURATION');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OCR_LIMITS.timeoutMs);
  const startedAt = Date.now();
  let phase = 'request';
  let httpStatus: number | undefined;
  try {
    const response = await fetch(
      'https://ai.api.cloud.yandex.net/v1/chat/completions',
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Api-Key ${apiKey}`,
          'OpenAI-Project': folder,
          'Content-Type': 'application/json',
          'x-data-logging-enabled': 'false',
        },
        body: JSON.stringify({
          model: `gpt://${folder}/${model}`,
          temperature: 0,
          max_tokens: 16000,
          store: false,
          response_format: responseFormat,
          messages: [
            {
              role: 'system',
              content:
                OCR_INSTRUCTIONS +
                ' For each lab row, transcribe a single full line into text and copy that identical line byte-for-byte into sourceText. Never reformat sourceText.',
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Transcribe this page into the specified JSON object.',
                },
                {
                  type: 'image_url',
                  image_url: { url: `data:image/jpeg;base64,${image}` },
                },
              ],
            },
          ],
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
    // Bound the response before parsing; never expose provider errors or raw output.
    phase = 'response_body';
    const reader = response.body?.getReader();
    if (!reader) throw new Error('OCR_INVALID_OUTPUT');
    const decoder = new TextDecoder();
    let raw = '';
    let size = 0;
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
    const data = JSON.parse(raw);
    const choice = data.choices?.[0];
    if (
      choice?.finish_reason !== 'stop' ||
      typeof choice.message?.content !== 'string'
    )
      throw new Error('OCR_INVALID_OUTPUT');
    // Some models surround JSON with a single Markdown fence. No arbitrary text repair.
    const text = choice.message.content
      .trim()
      .replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/, '$1');
    phase = 'transcription_json';
    const parsed = JSON.parse(text);
    phase = 'validation';
    return { result: parseOcrPage(parsed), model };
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
    ].includes(code)
      ? code
      : 'OCR_PROVIDER_UNAVAILABLE';
    // Coarse operational metadata only: never log the exception, request or response.
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
