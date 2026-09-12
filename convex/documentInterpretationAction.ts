'use node';
import { v } from 'convex/values';
import { internalAction } from './_generated/server';
import { internal } from './_generated/api';
import { generateWithYandex } from './ai/yandexProvider';
import { validateDocumentInterpretationRequest } from '../shared/document-interpretation';

export const generate = internalAction({
  args: {
    userId: v.id('users'),
    requestId: v.string(),
    text: v.string(),
    policyVersion: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: boolean; reply?: string; code?: string }> => {
    validateDocumentInterpretationRequest(args.requestId, args.text);
    const id = await ctx.runMutation(internal.documentInterpretation.reserve, {
      userId: args.userId,
      requestId: args.requestId,
      policyVersion: args.policyVersion,
    });
    const result = await generateWithYandex({
      requestId: args.requestId,
      purpose: 'document-interpretation',
      capabilities: [],
      messages: [
        {
          role: 'user',
          content: JSON.stringify({ confirmedDocumentText: args.text }),
        },
      ],
    });
    await ctx.runMutation(internal.documentInterpretation.finish, {
      id,
      userId: args.userId,
      success: result.ok,
    });
    return result.ok
      ? { ok: true, reply: result.reply }
      : { ok: false, code: result.code };
  },
});
