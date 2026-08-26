'use node';

import { internal } from './_generated/api';
import { internalAction } from './_generated/server';

const CHECK_TIMEOUT_MS = 5_000;

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
