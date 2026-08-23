import OpenAI from 'openai';
import type { Responses } from 'openai/resources/responses/responses';
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  createYandexClientOptions,
  createYandexResponseRequest,
  generatePlanReviewWithYandex,
  mapYandexProviderError,
  parseYandexResponse,
  validatePlanReviewResponse,
} from '../../convex/ai/yandexProvider';
import type { AgentPlanCatalogCandidate } from '../../convex/ai/yandexProvider';

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

const planCandidates: AgentPlanCatalogCandidate[] = Array.from(
  { length: 6 },
  (_, index) => ({
    key: `catalog_${index + 1}`,
    title: `Проверка ${index + 1}`,
    category: 'Общее здоровье',
    schedulingGuidance: 'Предварительно в указанный месяц',
    purpose: 'Профилактическое наблюдение',
    riskTier: 'low',
    requiresClinician: false,
    riskFlags: [],
    constraints: [],
  }),
);

const planContextEnvelope = JSON.stringify({
  recentJournal: [],
  confirmedTests: [
    {
      sourceRef: { localId: 'test_source_1' },
    },
  ],
  carePlan: [],
  planningSignals: [],
});

function validPlanArguments() {
  const recommendation = (
    catalogKey: string,
    monthOffset: 0 | 1 | 2 | 3 | 4,
  ) => ({
    catalogKey,
    monthOffset,
    confidence: 0.8,
    rationale: 'Предварительная рекомендация; срок требует подтверждения.',
    evidenceSourceIds: [],
  });
  return {
    current: [recommendation(planCandidates[0].key, 0)],
    upcoming: planCandidates
      .slice(1)
      .map((candidate, index) =>
        recommendation(candidate.key, ((index % 4) + 1) as 1 | 2 | 3 | 4),
      ),
  };
}

function planResponse(argumentsValue: unknown) {
  return response({
    output_text: '',
    output: [
      {
        type: 'function_call',
        call_id: 'call-1',
        name: 'propose_care_plan',
        arguments: JSON.stringify(argumentsValue),
        status: 'completed',
      },
    ],
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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

  test('identifies a plan cut off before its required tool call', () => {
    expect(
      validatePlanReviewResponse({
        candidates: planCandidates,
        contextEnvelope: planContextEnvelope,
        response: response({
          status: 'incomplete',
          incomplete_details: { reason: 'max_output_tokens' },
        }),
      }),
    ).toEqual({ ok: false, reason: 'TOOL_CALL_MISSING_OUTPUT_LIMIT' });
  });

  test('rejects current recommendations supported only by journal evidence', () => {
    const plan = validPlanArguments();
    plan.current[0].evidenceSourceIds = ['journal_source_1'];
    expect(
      validatePlanReviewResponse({
        candidates: planCandidates,
        contextEnvelope: JSON.stringify({
          recentJournal: [{ sourceRef: { localId: 'journal_source_1' } }],
          confirmedTests: [],
          carePlan: [],
          planningSignals: [],
        }),
        response: planResponse(plan),
      }),
    ).toEqual({ ok: false, reason: 'CURRENT_EVIDENCE' });
  });

  test('regenerates a malformed plan within the same provider review', async () => {
    vi.stubEnv('YANDEX_AI_API_KEY', 'test-key');
    vi.stubEnv('YANDEX_AI_FOLDER_ID', 'folder-1');
    vi.stubEnv('YANDEX_AI_MODEL', 'deepseek-v4-flash/latest');
    const bodies: string[] = [];
    const generatedResponses = [
      planResponse({ current: [], upcoming: [] }),
      planResponse(validPlanArguments()),
    ];
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        bodies.push(String(init?.body ?? ''));
        const next = generatedResponses.shift();
        if (!next) throw new Error('Unexpected provider request');
        return new Response(JSON.stringify(next), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await generatePlanReviewWithYandex({
      candidates: planCandidates,
      contextEnvelope: planContextEnvelope,
      requestId: 'plan_test_regeneration',
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodies[1]).toContain(
      'PREVIOUS_OUTPUT_REJECTED: RECOMMENDATION_SCHEMA',
    );
  });
});
