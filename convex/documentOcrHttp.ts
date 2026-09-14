import { getAuthUserId } from '@convex-dev/auth/server';
import { httpAction } from './_generated/server';
import { internal } from './_generated/api';
import { OCR_LIMITS, validateOcrRequest } from '../shared/document-ocr';
import { recognizeWithQwen } from './ai/documentOcrProvider';

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
export const recognize = httpAction(async (ctx, request) => {
  try {
    const userId = await getAuthUserId(ctx);
    if (!userId) return reply({ ok: false, code: 'OCR_UNAUTHENTICATED' }, 401);
    if (
      request.headers.get('Content-Type')?.split(';')[0] !== 'application/json'
    )
      return reply({ ok: false, code: 'OCR_INVALID_REQUEST' }, 400);
    if (
      Number(request.headers.get('Content-Length') ?? 0) > OCR_LIMITS.bodyBytes
    )
      return reply({ ok: false, code: 'OCR_INVALID_REQUEST' }, 413);
    const reader = request.body?.getReader();
    if (!reader) return reply({ ok: false, code: 'OCR_INVALID_REQUEST' }, 400);
    let size = 0,
      raw = '';
    const decoder = new TextDecoder();
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > OCR_LIMITS.bodyBytes) {
        await reader.cancel();
        return reply({ ok: false, code: 'OCR_INVALID_REQUEST' }, 413);
      }
      raw += decoder.decode(part.value, { stream: true });
    }
    raw += decoder.decode();
    const { image, formatVersion, ...args } = validateOcrRequest(JSON.parse(raw));
    const id = await ctx.runMutation(internal.documentOcr.reserve, {
      ...args,
      userId,
    });
    try {
      const result = await recognizeWithQwen(image, formatVersion ?? 1, async () => {
        if (request.signal.aborted) throw new Error('OCR_ACCOUNT_UNAVAILABLE');
        await ctx.runQuery(internal.documentOcr.assertAccess, {userId});
      });
      await ctx.runMutation(internal.documentOcr.finish, {
        id,
        userId,
        requestId: args.requestId,
        success: true,
      });
      return reply({ ok: true, ...result, page: args.page });
    } catch (error) {
      try {
        await ctx.runMutation(internal.documentOcr.finish, {
          id,
          userId,
          requestId: args.requestId,
          success: false,
        });
      } catch {
        /* No content or raw errors in logs. */
      }
      throw error;
    }
  } catch (error) {
    const safe = [
      'OCR_INVALID_REQUEST',
      'OCR_CONFIGURATION',
      'OCR_INVALID_OUTPUT',
      'OCR_PROVIDER_UNAVAILABLE',
      'OCR_RATE_LIMITED',
      'OCR_ALREADY_SUBMITTED',
      'OCR_PAGE_ATTEMPTS_EXHAUSTED',
      'OCR_BUSY',
      'OCR_ACCOUNT_UNAVAILABLE',
      'OCR_SERVICE_DISABLED',
      'OCR_CLOUD_SYNC_REQUIRED',
      'OCR_CONSENT_REQUIRED',
    ];
    const message = error instanceof Error ? error.message : '';
    return reply(
      {
        ok: false,
        code:
          safe.find((code) => message.includes(code)) ?? 'OCR_REQUEST_FAILED',
      },
      400,
    );
  }
});
