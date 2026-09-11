import { useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import { AI_AGENT_CONSENT_POLICY_VERSION, AI_AGENT_SCOPES } from '../convex/aiAgentConfig';
import { AI_CHAT_CONSENT_POLICY_VERSION } from '../convex/aiChatConfig';
import {
  OnboardingPreviewFlow,
  type OnboardingFlowResult,
} from '../design-system/onboarding-flow';
import { useHealthStore } from '../lib/health-store';

export function OnboardingScreen() {
  const acceptAgentConsent = useMutation(api.chat.acceptAgentConsent);
  const acceptChatConsent = useMutation(api.chat.acceptConsent);
  const setAutomation = useMutation(api.agent.setAutomation);
  const {
    completeOnboarding,
    saveMedicalCondition,
    savePreferences,
    setCloudSyncEnabled,
  } = useHealthStore();

  const complete = async ({
    anonymousAnalytics,
    cloudSyncEnabled,
    medicalConditions,
    medicalRecommendations,
    ...profile
  }: OnboardingFlowResult) => {
    // Initialize remote AI settings before marking onboarding complete. Failed
    // activation stays on the final step and can be retried through its error UI.
    await acceptChatConsent({ policyVersion: AI_CHAT_CONSENT_POLICY_VERSION });
    await acceptAgentConsent({
      policyVersion: AI_AGENT_CONSENT_POLICY_VERSION,
      scopes: [...AI_AGENT_SCOPES],
    });
    await setAutomation({ enabled: true });
    await setCloudSyncEnabled(cloudSyncEnabled);
    await savePreferences({ anonymousAnalytics, medicalRecommendations, agentNotifications: true });
    for (const title of medicalConditions) {
      await saveMedicalCondition({ title, status: 'active' });
    }
    await completeOnboarding(profile);
  };

  return (
    <OnboardingPreviewFlow onClose={() => undefined} onComplete={complete} />
  );
}
