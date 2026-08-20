import OpenAI from 'openai';
import type { Responses } from 'openai/resources/responses/responses';
import { describe, expect, test } from 'vitest';

import {
  createYandexClientOptions,
  createYandexResponseRequest,
  mapYandexProviderError,
  parseYandexResponse,
} from '../../convex/ai/yandexProvider';

function response(
  overrides: Partial<Responses.Response> = {},
): Responses.Response {
  return {
    id: 'response-1',
    created_at: 1,
    output_text: ' Ответ ',
    error: null,
    incomplete_details: null,
    instructions: null,
    metadata: null,
    model: 'model',
    object: 'response',
    output: [],
    parallel_tool_calls: false,
    temperature: 0.3,
    tool_choice: 'auto',
    tools: [],
    top_p: 1,
    status: 'completed',
    usage: {
      input_tokens: 11,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      output_tokens: 7,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 18,
    },
    ...overrides,
  };
}

describe('Yandex provider adapter', () => {
  test('builds a no-retry, no-logging server client configuration', () => {
    expect(
      createYandexClientOptions({ apiKey: 'test-key', folderId: 'folder-1' }),
    ).toEqual({
      apiKey: 'test-key',
      baseURL: 'https://ai.api.cloud.yandex.net/v1',
      project: 'folder-1',
      timeout: 60_000,
      maxRetries: 0,
      logLevel: 'off',
      defaultHeaders: { 'x-data-logging-enabled': 'false' },
    });
  });

  test('builds a stateless, text-only request with server-owned instructions', () => {
    const request = createYandexResponseRequest({
      folderId: 'folder-1',
      model: 'deepseek-v4-flash/latest',
      messages: [{ role: 'user', content: 'Привет' }],
    });

    expect(request).toMatchObject({
      model: 'gpt://folder-1/deepseek-v4-flash/latest',
      temperature: 0.3,
      max_output_tokens: 1500,
      input: [{ role: 'user', content: 'Привет' }],
    });
    expect(request.instructions).toContain(
      'Reply in the language of the latest user message',
    );
    expect(request.instructions).toContain('no internet, file, attachment');
    expect(request.instructions).toContain('not a diagnosis');
    expect(request.instructions).toContain(
      'Do not recommend starting, stopping, or changing medication',
    );
    expect(request.instructions).toContain('local emergency services');
    expect(request).not.toHaveProperty('previous_response_id');
    expect(request).not.toHaveProperty('conversation');
    expect(request).not.toHaveProperty('tools');
    expect(request).not.toHaveProperty('truncation');
  });

  test('extracts text, usage, response ID, and truncation metadata', () => {
    expect(
      parseYandexResponse(
        response({
          status: 'incomplete',
          incomplete_details: { reason: 'max_output_tokens' },
        }),
        'deepseek-v4-flash/latest',
        42,
      ),
    ).toEqual({
      ok: true,
      reply: 'Ответ',
      provider: 'yandex-ai-studio',
      model: 'deepseek-v4-flash/latest',
      responseId: 'response-1',
      inputTokens: 11,
      outputTokens: 7,
      totalTokens: 18,
      durationMs: 42,
      truncated: true,
    });
  });

  test('maps filtered and empty outputs to safe codes', () => {
    expect(
      parseYandexResponse(
        response({ incomplete_details: { reason: 'content_filter' } }),
        'model',
        1,
      ),
    ).toEqual({ ok: false, code: 'CONTENT_FILTERED' });
    expect(
      parseYandexResponse(response({ output_text: '  ' }), 'model', 1),
    ).toEqual({ ok: false, code: 'PROVIDER_UNAVAILABLE' });
  });

  test('maps provider errors without returning provider bodies', () => {
    const invalid = new OpenAI.APIError(
      400,
      { secret: 'must-not-leak' },
      'bad request',
      new Headers(),
    );
    const filtered = new OpenAI.APIError(
      400,
      { code: 'content_filter' },
      undefined,
      new Headers(),
    );
    const rateLimited = new OpenAI.APIError(
      429,
      { secret: 'must-not-leak' },
      'slow down',
      new Headers({ 'retry-after': '2' }),
    );
    expect(mapYandexProviderError(invalid)).toEqual({
      ok: false,
      code: 'INVALID_REQUEST',
    });
    expect(mapYandexProviderError(filtered)).toEqual({
      ok: false,
      code: 'CONTENT_FILTERED',
    });
    expect(mapYandexProviderError(rateLimited)).toEqual({
      ok: false,
      code: 'RATE_LIMITED',
      retryAfterMs: 2000,
    });
  });
});
