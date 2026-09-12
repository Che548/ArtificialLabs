import {
  OnboardingPreviewFlow,
  type OnboardingFlowResult,
} from '../design-system/onboarding-flow';
import { useHealthStore } from '../lib/health-store';

export function OnboardingScreen() {
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
    // Completing onboarding is not consent to upload medical data or call AI.
    // Explicit activation remains in Profile and the existing disclosure sheets.
    await setCloudSyncEnabled(cloudSyncEnabled);
    await savePreferences({
      anonymousAnalytics,
      medicalRecommendations,
      agentNotifications: false,
    });
    for (const title of medicalConditions) {
      await saveMedicalCondition({ title, status: 'active' });
    }
    await completeOnboarding(profile);
  };

  return (
    <OnboardingPreviewFlow onClose={() => undefined} onComplete={complete} />
  );
}
