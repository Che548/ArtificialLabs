import { useAction, useConvex, useConvexAuth, useQuery } from 'convex/react';
import { useEffect, useRef } from 'react';

import { api } from '../convex/_generated/api';
import { reconcileAgentBackgroundRegistration } from './agent-background';
import { buildAgentContextEnvelope } from './agent-context-builder';
import { useConnectivity } from './connectivity';
import { useHealthStore } from './health-store';
import { scheduleAgentPlanUpdateNotification } from './notifications';
import {
  releaseLocalAgentRunLease,
  tryAcquireLocalAgentRunLease,
} from './local-database';
import { agentTriggerIsDue, carePlanHasRequiredRanges } from './care-plan';
import {
  AGENT_RETRY_DELAYS_MS,
  AGENT_STABLE_CONNECTION_MS,
  mayScheduleAgentCatchUp,
} from './agent-automation-policy';

export function AgentAutomationManager() {
  const convex = useConvex();
  const { isAuthenticated } = useConvexAuth();
  const status = useQuery(api.agent.status, isAuthenticated ? {} : 'skip');
  const { isKnown, isOffline } = useConnectivity();
  const healthStore = useHealthStore();
  const {
    applyAgentPlanProposal,
    preferences,
    readOnly,
    recordAgentPlanRun,
    ready,
    reconcileAgentPlan,
    savePreferences,
  } = healthStore;
  const reviewPlan = useAction(api.agentPlan.review);
  const inFlight = useRef(false);
  const preference = preferences.find((item) => !item.deletedAt);
  const enabled = Boolean(
    !readOnly &&
    ready &&
    isAuthenticated &&
    !healthStore.accountDeletion.pendingDeletion &&
    status?.enabled &&
    status.automationEnabled &&
    status.consentAccepted &&
    status.automationAccepted &&
    preference?.medicalRecommendations,
  );

  useEffect(() => {
    void reconcileAgentBackgroundRegistration(enabled).catch(() => undefined);
  }, [enabled]);

  useEffect(() => {
    return () => {
      void reconcileAgentBackgroundRegistration(false).catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (
      !mayScheduleAgentCatchUp({
        enabled,
        inFlight: inFlight.current,
        isKnown,
        isOffline,
      })
    )
      return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let retryIndex = 0;
    const run = () => {
      if (cancelled) return;
      if (inFlight.current) return;
      inFlight.current = true;
      void (async () => {
        const runId = `foreground_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        if (!(await tryAcquireLocalAgentRunLease(runId)))
          throw new Error('AGENT_AUTOMATION_BUSY');
        try {
          // The delayed query is the positive deployed-Convex health check. A
          // cached connectivity signal alone must not start a provider run.
          const liveStatus = await convex.query(api.agent.status, {});
          if (
            !liveStatus.enabled ||
            !liveStatus.automationEnabled ||
            !liveStatus.consentAccepted ||
            !liveStatus.automationAccepted
          )
            return;
          await reconcileAgentPlan();
          let changed = false;
          const runAt = Date.now();
          const dueTriggers = healthStore.agentTriggers.filter((trigger) =>
            agentTriggerIsDue(healthStore, trigger, runAt),
          );
          if (dueTriggers.length) {
            const result = await reviewPlan({
              requestId: `plan_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
              contextEnvelope: JSON.stringify(
                buildAgentContextEnvelope(healthStore, runAt, {
                  includeBodyMetrics: true,
                  includePlanningSignals: true,
                }),
              ),
            });
            if (!result.ok) throw new Error(result.code);
            const proposalApplied = await applyAgentPlanProposal({
              recommendations: result.recommendations,
              model: result.model,
            });
            if (
              !proposalApplied &&
              !carePlanHasRequiredRanges(healthStore.carePlanItems)
            )
              throw new Error('INVALID_AGENT_PLAN_PROPOSAL');
            changed = proposalApplied || changed;
            const successfulAt = Date.now();
            await recordAgentPlanRun(
              dueTriggers.map((trigger) => trigger.localId),
              successfulAt,
            );
            await savePreferences({ agentLastSuccessfulRunAt: successfulAt });
            await reconcileAgentPlan();
          }
          if (
            changed &&
            preference?.notificationsEnabled &&
            preference.agentNotifications
          ) {
            await scheduleAgentPlanUpdateNotification();
          }
        } finally {
          await releaseLocalAgentRunLease(runId);
        }
      })()
        .catch(() => {
          const delay = AGENT_RETRY_DELAYS_MS[retryIndex];
          retryIndex += 1;
          if (!cancelled && delay !== undefined) timer = setTimeout(run, delay);
        })
        .finally(() => {
          inFlight.current = false;
        });
    };
    timer = setTimeout(run, AGENT_STABLE_CONNECTION_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [
    applyAgentPlanProposal,
    convex,
    enabled,
    healthStore,
    isKnown,
    isOffline,
    preference?.agentNotifications,
    preference?.agentLastSuccessfulRunAt,
    preference?.notificationsEnabled,
    reconcileAgentPlan,
    recordAgentPlanRun,
    reviewPlan,
    savePreferences,
  ]);

  return null;
}
