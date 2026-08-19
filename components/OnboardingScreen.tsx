import {
  OnboardingPreviewFlow,
  type OnboardingFlowResult,
} from '../design-system/onboarding-flow';
import { useHealthStore } from '../lib/health-store';

export function OnboardingScreen() {
  const { completeOnboarding, saveMedicalCondition } = useHealthStore();

  const complete = async ({
    medicalConditions,
    ...profile
  }: OnboardingFlowResult) => {
    await completeOnboarding(profile);
    for (const title of medicalConditions) {
      await saveMedicalCondition({ title, status: 'active' });
    }
  };

  return (
    <OnboardingPreviewFlow onClose={() => undefined} onComplete={complete} />
  );
}
