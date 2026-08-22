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
    await completeOnboarding(profile);
    await setCloudSyncEnabled(cloudSyncEnabled);
    await savePreferences({ anonymousAnalytics, medicalRecommendations });
    for (const title of medicalConditions) {
      await saveMedicalCondition({ title, status: 'active' });
    }
  };

  return (
    <OnboardingPreviewFlow onClose={() => undefined} onComplete={complete} />
  );
}
