import { isAllowedAgentTriggerMutation } from './care-plan';
import type { AgentTrigger } from './health-types';

// Replica reconciliation, NOT permission to edit a rule locally. Terminal
// states dominate active; completion evidence dominates expiry/suspension.
const statusRank = { active: 0, suspended: 1, expired: 2, completed: 3 };

// Safe diagnostic metadata: field names only, never rule values or identity.
export function agentTriggerConflictFields(left: AgentTrigger, right: AgentTrigger) {
  const fields = ['templateKey', 'templateVersion', 'combine', 'disengagementCombine',
    'targetCarePlanLocalId', 'conditions', 'disengagementConditions', 'expiresAt',
    'maxRuns', 'policyVersion', 'evidenceRefs', 'status', 'runCount',
    'nextEvaluationAt', 'cooldownUntil', 'lastRunAt', 'deletedAt'] as const;
  const stable = (value: unknown) => JSON.stringify(value, (_key, entry) =>
    entry && typeof entry === 'object' && !Array.isArray(entry)
      ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))) : entry);
  return fields.filter((key) => stable(left[key]) !== stable(right[key]));
}

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

  let olderRun = left.runCount <= right.runCount ? left : right;
  let newerRun = left.runCount <= right.runCount ? right : left;
  // The client and backend can record the same logical run at different times.
  // Join only valid timestamps for an already recorded run; do not invent a run
  // or relax the equality checks on its schedule/cooldown and immutable policy.
  if (left.runCount === right.runCount && left.runCount > 0 &&
      left.lastRunAt !== right.lastRunAt) {
    const validTime = (row: AgentTrigger) => row.lastRunAt !== undefined &&
      Number.isFinite(row.lastRunAt) && row.lastRunAt > 0 && row.lastRunAt <= row.updatedAt;
    if (!validTime(left) || !validTime(right)) return undefined;
    const lastRunAt = Math.max(left.lastRunAt!, right.lastRunAt!);
    if ([left, right].some((row) => row.status === 'active' &&
      (row.cooldownUntil === undefined || row.cooldownUntil < lastRunAt))) return undefined;
    olderRun = { ...olderRun, lastRunAt };
    newerRun = { ...newerRun, lastRunAt };
  }
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
