import { useEffect, useRef } from 'react';
import { useAuthToken } from '@convex-dev/auth/react';
import { useConvex } from 'convex/react';
import { api } from '../convex/_generated/api';
import { AI_CHAT_CONSENT_POLICY_VERSION } from '../convex/aiChatConfig';
import { AI_AGENT_CONSENT_POLICY_VERSION, AI_AGENT_SCOPES } from '../convex/aiAgentConfig';
import { OCR_POLICY_VERSION } from '../shared/document-ocr';
import { DOCUMENT_INTERPRETATION_POLICY_VERSION } from '../shared/document-interpretation';
import { userIdFromAuthToken } from '../lib/auth-session';
import { useHealthStore } from '../lib/health-store';
import { loadLocalSetting, saveLocalSetting } from '../lib/local-database';

/** One-time product defaults, scoped to this account and device. Later choices are preserved. */
export function DefaultPermissions() {
  const store = useHealthStore();
  const convex = useConvex();
  const owner = userIdFromAuthToken(useAuthToken());
  const latest = useRef(store);
  latest.current = store;
  const onboarded = Boolean(store.profile?.onboardingCompleted);
  const active = Boolean(owner && store.ready && !store.readOnly && !store.accountDeletion.pendingDeletion);
  useEffect(() => {
    if (!active || !owner) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      const once = async (name: string, action: () => Promise<unknown>) => {
        const key = `permissions-defaults.v1:${owner}:${name}`;
        if (cancelled || await loadLocalSetting<boolean>(key)) return;
        if (cancelled || latest.current.accountDeletion.pendingDeletion) return;
        await action();
        if (!cancelled) await saveLocalSetting(key, true);
      };
      let failed = false;
      try {
        await once('cloud', () => latest.current.setCloudSyncEnabled(true));
        if (!onboarded || cancelled) return;
        // Persist local switches only once; never overwrite subsequent manual changes.
        await once('preferences', () => latest.current.savePreferences({
          anonymousAnalytics: true, medicalRecommendations: true, agentNotifications: true,
          notificationsEnabled: true, journalNotifications: true, resultNotifications: true,
        }));
      } catch { failed = true; }
      if (!onboarded) {
        if (!cancelled && failed) timer = setTimeout(() => void run(), 60_000);
        return;
      }
      const operations: [string, () => Promise<unknown>][] = [
        ['chat', () => convex.mutation(api.chat.acceptConsent, { policyVersion: AI_CHAT_CONSENT_POLICY_VERSION })],
        ['agent', () => convex.mutation(api.agent.acceptConsent, { policyVersion: AI_AGENT_CONSENT_POLICY_VERSION, scopes: [...AI_AGENT_SCOPES] })],
        ['automation', () => convex.mutation(api.agent.setAutomation, { enabled: true })],
        ['analytics', () => convex.mutation(api.telemetry.setConsent, { enabled: true })],
        ['ocr', () => convex.mutation(api.documentOcr.setConsent, { accepted: true, policyVersion: OCR_POLICY_VERSION })],
        ['interpretation', () => convex.mutation(api.documentInterpretation.setConsent, { accepted: true, policyVersion: DOCUMENT_INTERPRETATION_POLICY_VERSION })],
      ];
      for (const [name, action] of operations) {
        if (cancelled) return;
        try { await once(name, action); } catch { failed = true; }
      }
      // An unavailable service does not prevent the other defaults from applying.
      if (!cancelled && failed) timer = setTimeout(() => void run(), 60_000);
    };
    void run();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [active, owner, convex, onboarded]);
  return null;
}
