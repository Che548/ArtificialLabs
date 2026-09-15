import {
  OnboardingPreviewFlow,
  type OnboardingFlowResult,
} from '../design-system/onboarding-flow';
import { useHealthStore } from '../lib/health-store';
import { useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import { pendingRegistrationConsent, clearRegistrationConsent } from '../lib/registration-consent';

export function OnboardingScreen() {
  const acceptRegistrationConsent = useMutation(api.registrationConsent.accept);
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
    // Signup receipts may activate services early; initial settings are supplied
    // by the onboarding defaults and remaining permissions by DefaultPermissions.
    const receipt = await pendingRegistrationConsent();
    const activation = receipt ? await acceptRegistrationConsent(receipt) : undefined;
    await setCloudSyncEnabled(activation?.accepted === true || cloudSyncEnabled);
    await savePreferences({
      anonymousAnalytics,
      medicalRecommendations: activation?.accepted === true || medicalRecommendations,
      agentNotifications: activation?.automation === true,
    });
    for (const title of medicalConditions) {
      await saveMedicalCondition({ title, status: 'active' });
    }
    await completeOnboarding(profile);
    if (receipt) await clearRegistrationConsent();
  };

  return (
    <OnboardingPreviewFlow onClose={() => undefined} onComplete={complete} />
  );
}
