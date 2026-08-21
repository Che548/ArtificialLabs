import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { reconcileCarePlan } from './care-plan';
import {
  loadLocalSetting,
  loadLocalSnapshot,
  releaseLocalAgentRunLease,
  saveAgentPlanChanges,
  saveLocalSetting,
  tryAcquireLocalAgentRunLease,
} from './local-database';
import { scheduleAgentPlanUpdateNotification } from './notifications';
import { AGENT_BACKGROUND_MINIMUM_INTERVAL_MINUTES } from './agent-automation-policy';

export const AGENT_BACKGROUND_TASK = 'artificiallabs-agent-plan-maintenance-v1';
const AGENT_BACKGROUND_AUTHORIZATION_SETTING =
  'agentBackgroundAuthorization.v1';

async function runLocalAgentMaintenance() {
  const authorized = await loadLocalSetting<boolean>(
    AGENT_BACKGROUND_AUTHORIZATION_SETTING,
  );
  if (authorized !== true) return false;
  const snapshot = await loadLocalSnapshot();
  const preferences = snapshot.preferences.find((item) => !item.deletedAt);
  if (!preferences?.medicalRecommendations) return false;
  const runId = `background_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  if (!(await tryAcquireLocalAgentRunLease(runId))) return false;
  try {
    const currentSnapshot = await loadLocalSnapshot();
    const currentPreferences = currentSnapshot.preferences.find(
      (item) => !item.deletedAt,
    );
    if (!currentPreferences?.medicalRecommendations) return false;
    const reconciliation = reconcileCarePlan(currentSnapshot);

    await saveAgentPlanChanges(reconciliation);

    const changed = Boolean(
      reconciliation.items.length || reconciliation.events.length,
    );
    if (
      changed &&
      currentPreferences.notificationsEnabled &&
      currentPreferences.agentNotifications
    ) {
      await scheduleAgentPlanUpdateNotification();
    }
    return changed;
  } finally {
    await releaseLocalAgentRunLease(runId);
  }
}

if (!TaskManager.isTaskDefined(AGENT_BACKGROUND_TASK)) {
  TaskManager.defineTask(AGENT_BACKGROUND_TASK, async () => {
    try {
      await runLocalAgentMaintenance();
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      // A locked SecureStore/SQLCipher database is intentionally treated as a
      // retryable task failure. No health data or error detail is logged.
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

export async function reconcileAgentBackgroundRegistration(enabled: boolean) {
  await saveLocalSetting(AGENT_BACKGROUND_AUTHORIZATION_SETTING, enabled);
  const available = await TaskManager.isAvailableAsync();
  const registered = await TaskManager.isTaskRegisteredAsync(
    AGENT_BACKGROUND_TASK,
  );
  if (!enabled || !available) {
    if (registered)
      await BackgroundTask.unregisterTaskAsync(AGENT_BACKGROUND_TASK);
    return false;
  }
  if (!registered) {
    await BackgroundTask.registerTaskAsync(AGENT_BACKGROUND_TASK, {
      minimumInterval: AGENT_BACKGROUND_MINIMUM_INTERVAL_MINUTES,
    });
  }
  return true;
}
