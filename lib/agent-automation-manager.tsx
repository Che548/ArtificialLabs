import { useAction, useConvex, useConvexAuth, useQuery } from 'convex/react';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';

import { api } from '../convex/_generated/api';
import { reconcileAgentBackgroundRegistration } from './agent-background';
import { buildAgentContextEnvelope } from './agent-context-builder';
import { useConnectivity } from './connectivity';
import { useHealthStore } from './health-store';
import { scheduleAgentPlanUpdateNotification } from './notifications';
import {
  loadLocalSnapshot,
  releaseLocalAgentRunLease,
  tryAcquireLocalAgentRunLease,
} from './local-database';
import { agentTriggerIsDue, carePlanHasRequiredRanges } from './care-plan';
import {
  AGENT_RETRY_DELAYS_MS,
  AGENT_STABLE_CONNECTION_MS,
  mayScheduleAgentCatchUp,
} from './agent-automation-policy';

export type AgentAutomationState = {
  phase: 'waiting' | 'checking' | 'retrying' | 'succeeded' | 'failed';
  errorCode?: string;
  lastAttemptAt?: number;
  nextRetryAt?: number;
};

const AgentAutomationStateContext = createContext<AgentAutomationState>({
  phase: 'waiting',
});

export function useAgentAutomationState() {
  return useContext(AgentAutomationStateContext);
}

type RetryableAgentError = Error & { retryAfterMs?: number };

function agentError(error: unknown) {
  if (error instanceof Error) {
    const failure = error as RetryableAgentError;
    if (
      [
        'AGENT_AUTOMATION_BUSY',
        'CONSENT_REQUIRED',
        'RATE_LIMITED',
        'CONTENT_FILTERED',
        'PROVIDER_UNAVAILABLE',
        'INVALID_REQUEST',
        'FEATURE_DISABLED',
        'CONTINUATION_EXPIRED',
        'INVALID_TOOL_RESULT',
        'INVALID_AGENT_PLAN_PROPOSAL',
      ].includes(failure.message)
    )
      return failure;
  }
  return new Error('TRANSPORT_ERROR') as RetryableAgentError;
}

export function AgentAutomationManager({ children }: PropsWithChildren) {
  const convex = useConvex();
  const { isAuthenticated } = useConvexAuth();
  const { isKnown, isOffline } = useConnectivity();
  const healthStore = useHealthStore();
  const {
    applyAgentPlanProposal,
    accountDeletion,
    preferences,
    readOnly,
    recordAgentPlanRun,
    ready,
    reconcileAgentPlan,
    savePreferences,
  } = healthStore;
  const status = useQuery(
    api.agent.status,
    isAuthenticated && !accountDeletion.pendingDeletion ? {} : 'skip',
  );
  const reviewPlan = useAction(api.agentPlan.review);
  const inFlight = useRef(false);
  const [automationState, setAutomationState] = useState<AgentAutomationState>({
    phase: 'waiting',
  });
  const preference = preferences.find((item) => !item.deletedAt);
  const planInputRevision = Math.max(
    healthStore.profile?.updatedAt ?? 0,
    ...[
      ...healthStore.journalEntries,
      ...healthStore.labResults,
      ...healthStore.scanResults,
      ...healthStore.medicalConditions,
      ...healthStore.medications,
      ...healthStore.allergyRisks,
      ...healthStore.documents,
      ...healthStore.chatMessages,
      ...healthStore.carePlanItems,
    ].map((item) => item.updatedAt),
  );
  const enabled = Boolean(
    !readOnly &&
    ready &&
    isAuthenticated &&
    !accountDeletion.pendingDeletion &&
    status?.enabled &&
    status.automationEnabled &&
    status.providerConfigured &&
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
            !liveStatus.providerConfigured ||
            !liveStatus.consentAccepted ||
            !liveStatus.automationAccepted
          )
            return;
          setAutomationState({ phase: 'checking' });
          await reconcileAgentPlan();
          let changed = false;
          const runAt = Date.now();
          // Reconciliation can create the first due trigger. Read the persisted
          // snapshot instead of the render-time store object so the same run can
          // act on it immediately.
          const currentSnapshot = await loadLocalSnapshot();
          const dueTriggers = currentSnapshot.agentTriggers.filter((trigger) =>
            agentTriggerIsDue(currentSnapshot, trigger, runAt),
          );
          if (dueTriggers.length) {
            const result = await reviewPlan({
              requestId: `plan_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
              contextEnvelope: JSON.stringify(
                buildAgentContextEnvelope(currentSnapshot, runAt, {
                  includeBodyMetrics: true,
                  includePlanningSignals: true,
                }),
              ),
            });
            if (!result.ok) {
              const failure = new Error(result.code) as RetryableAgentError;
              failure.retryAfterMs = result.retryAfterMs;
              throw failure;
            }
            const proposalApplied = await applyAgentPlanProposal({
              recommendations: result.recommendations,
              model: result.model,
            });
            if (
              !proposalApplied &&
              !carePlanHasRequiredRanges(
                (await loadLocalSnapshot()).carePlanItems,
              )
            ) {
              throw new Error('INVALID_AGENT_PLAN_PROPOSAL');
            }
            changed = proposalApplied || changed;
            const successfulAt = Date.now();
            await recordAgentPlanRun(
              dueTriggers.map((trigger) => trigger.localId),
              successfulAt,
            );
            await savePreferences({ agentLastSuccessfulRunAt: successfulAt });
            await reconcileAgentPlan();
            setAutomationState({
              phase: 'succeeded',
              lastAttemptAt: successfulAt,
            });
          } else {
            setAutomationState({ phase: 'waiting' });
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
        .catch((error: unknown) => {
          const failure = agentError(error);
          const policyDelay = AGENT_RETRY_DELAYS_MS[retryIndex];
          retryIndex += 1;
          const delay =
            policyDelay === undefined
              ? undefined
              : Math.max(policyDelay, failure.retryAfterMs ?? 0);
          const attemptedAt = Date.now();
          if (failure.message !== 'AGENT_AUTOMATION_BUSY') {
            setAutomationState({
              phase: delay === undefined ? 'failed' : 'retrying',
              errorCode: failure.message,
              lastAttemptAt: attemptedAt,
              nextRetryAt:
                delay === undefined ? undefined : attemptedAt + delay,
            });
          }
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
    accountDeletion.pendingDeletion,
    convex,
    enabled,
    isKnown,
    isOffline,
    planInputRevision,
    preference?.agentNotifications,
    preference?.agentLastSuccessfulRunAt,
    preference?.notificationsEnabled,
    reconcileAgentPlan,
    recordAgentPlanRun,
    reviewPlan,
    savePreferences,
  ]);

  return (
    <AgentAutomationStateContext.Provider value={automationState}>
      {children}
    </AgentAutomationStateContext.Provider>
  );
}
