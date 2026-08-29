'use node';

import { internal } from './_generated/api';
import { internalAction } from './_generated/server';
import { v } from 'convex/values';
import { hmacSha256 } from './lib/sms';

const CHECK_TIMEOUT_MS = 5_000;
const BALANCE_TIMEOUT_MS = 35_000;
const SAFE_BALANCE_ERRORS = new Set([
  'SMS_BALANCE_COOLDOWN',
  'SMS_BALANCE_UNAVAILABLE',
  'SMS_BALANCE_TIMEOUT',
  'SMS_BALANCE_UNPARSEABLE',
  'SMS_BALANCE_NOT_INCLUDED',
]);

export const checkServices = internalAction({
  args: {},
  handler: async (ctx) => {
    const cloudUrl = process.env.CONVEX_CLOUD_URL;
    const siteUrl = process.env.CONVEX_SITE_URL;
    const smsGatewayUrl = process.env.SMS_GATEWAY_URL;
    const targets = [
      cloudUrl
        ? { service: 'convex-backend', url: `${cloudUrl}/version` }
        : null,
      siteUrl ? { service: 'convex-site', url: siteUrl } : null,
      smsGatewayUrl
        ? { service: 'sms-gateway', url: `${smsGatewayUrl}/health` }
        : null,
    ].filter((item): item is { service: string; url: string } => Boolean(item));
    for (const target of targets) {
      const startedAt = Date.now();
      let status: 'healthy' | 'degraded' | 'offline' = 'offline';
      let errorCode: string | undefined;
      let capacityUsed: number | undefined;
      let capacityTotal: number | undefined;
      try {
        const response = await fetch(target.url, {
          signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
        });
        status = response.ok ? 'healthy' : 'degraded';
        if (!response.ok) errorCode = `HTTP_${response.status}`;
        if (target.service === 'sms-gateway') {
          const payload = (await response.json().catch(() => null)) as
            | { capacity?: { used?: number; total?: number } }
            | null;
          capacityUsed = payload?.capacity?.used;
          capacityTotal = payload?.capacity?.total;
        }
      } catch (error) {
        errorCode =
          error instanceof Error && error.name === 'TimeoutError'
            ? 'TIMEOUT'
            : 'NETWORK_ERROR';
      }
      await ctx.runMutation(internal.monitoringData.recordServiceCheck, {
        service: target.service,
        status,
        latencyMs: Date.now() - startedAt,
        errorCode,
        capacityUsed,
        capacityTotal,
      });
    }
    return { checked: targets.length };
  },
});

export const refreshSmsTariffBalance = internalAction({
  args: { requestId: v.string(), actorUserId: v.id('users') },
  handler: async (ctx, args): Promise<void> => {
    const gatewayUrl = process.env.SMS_GATEWAY_URL ?? 'http://sms-gateway:8080';
    const sharedSecret = process.env.SMS_GATEWAY_SHARED_SECRET;
    let remainingSms: number | undefined;
    let errorCode: string | undefined;
    let nextAllowedAt: number | undefined;
    if (!sharedSecret) {
      errorCode = 'SMS_BALANCE_UNAVAILABLE';
    } else {
      const timestamp = String(Date.now());
      const body = JSON.stringify({ requestId: args.requestId });
      const signature = await hmacSha256(
        sharedSecret,
        `${timestamp}\n${args.requestId}\n${body}`,
      );
      try {
        const response = await fetch(`${gatewayUrl}/v1/tariff-balance`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-sms-timestamp': timestamp,
            'x-sms-request-id': args.requestId,
            'x-sms-signature': signature,
          },
          body,
          signal: AbortSignal.timeout(BALANCE_TIMEOUT_MS),
        });
        const payload = (await response.json().catch(() => null)) as
          | {
              ok?: boolean;
              remainingSms?: number;
              code?: string;
              nextAllowedAt?: number;
            }
          | null;
        if (
          response.ok &&
          payload?.ok === true &&
          Number.isSafeInteger(payload.remainingSms) &&
          (payload.remainingSms ?? -1) >= 0
        ) {
          remainingSms = payload.remainingSms;
        } else {
          errorCode =
            payload?.code && SAFE_BALANCE_ERRORS.has(payload.code)
              ? payload.code
              : 'SMS_BALANCE_UNAVAILABLE';
          if (
            errorCode === 'SMS_BALANCE_COOLDOWN' &&
            Number.isSafeInteger(payload?.nextAllowedAt) &&
            (payload?.nextAllowedAt ?? 0) > Date.now()
          ) {
            nextAllowedAt = payload?.nextAllowedAt;
          }
        }
      } catch (error) {
        errorCode =
          error instanceof Error && error.name === 'TimeoutError'
            ? 'SMS_BALANCE_TIMEOUT'
            : 'SMS_BALANCE_UNAVAILABLE';
      }
    }
    await ctx.runMutation(internal.monitoringData.finishSmsTariffRefresh, {
      requestId: args.requestId,
      actorUserId: args.actorUserId,
      remainingSms,
      errorCode,
      nextAllowedAt,
    });
  },
});
