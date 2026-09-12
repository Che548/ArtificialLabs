import { isAllowedAgentTriggerMutation } from './care-plan';
import type { AgentTrigger } from './health-types';

// Replica reconciliation, NOT permission to edit a rule locally. Terminal
// states dominate active; completion evidence dominates expiry/suspension.
const statusRank = { active: 0, suspended: 1, expired: 2, completed: 3 };

export function mergeAgentTriggerReplicas(
  left: AgentTrigger,
  right: AgentTrigger,
): AgentTrigger | undefined {
  if (left.localId !== right.localId || left.deletedAt || right.deletedAt)
    return undefined;
  // Reuse the policy guard while holding lifecycle fields constant. Conditions,
  // evidence, targets, expiry and budgets must still match exactly.
  if (!isAllowedAgentTriggerMutation(left, {
    ...right, status: left.status, runCount: left.runCount,
    nextEvaluationAt: left.nextEvaluationAt, cooldownUntil: left.cooldownUntil,
    lastRunAt: left.lastRunAt, updatedAt: left.updatedAt,
  })) return undefined;

  const olderRun = left.runCount <= right.runCount ? left : right;
  const newerRun = left.runCount <= right.runCount ? right : left;
  // A concurrent run must itself be a legal transition from an active replica.
  // Equal counters must have identical run metadata, not merely newer clocks.
  if (!isAllowedAgentTriggerMutation(
    { ...olderRun, status: 'active' }, newerRun,
  )) return undefined;

  return {
    ...newerRun,
    status: statusRank[left.status] >= statusRank[right.status]
      ? left.status : right.status,
    updatedAt: Math.max(left.updatedAt, right.updatedAt),
  };
}
