import {
  ANALYSIS_CATALOG_VERSION,
  analysisCatalog,
  analysisCatalogByKey,
  type AnalysisCatalogEntry,
} from './analysis-catalog';
import type {
  AgentSourceRef,
  AgentRuleCondition,
  AgentTrigger,
  CarePlanItem,
  HealthGoal,
  HealthSnapshot,
  Reminder,
  RecommendationEvent,
} from './health-types';
import { newLocalId } from './health-types';

export const AGENT_POLICY_VERSION = '2026-08-20-medical-agent-v1' as const;
export const AGENT_TRIGGER_TEMPLATE_VERSION = '2026-08-20-v1' as const;
export const CARE_PLAN_CURRENT_MIN = 1;
export const CARE_PLAN_CURRENT_MAX = 5;
export const CARE_PLAN_UPCOMING_MIN = 5;
export const CARE_PLAN_UPCOMING_MAX = 10;

const DAY_MS = 24 * 60 * 60 * 1000;
const DECLINE_COOLDOWN_MS = 90 * DAY_MS;
const MODEL_REPLACEMENT_COOLDOWN_MS = 30 * DAY_MS;

function latestHealthEvidenceAt(snapshot: HealthSnapshot) {
  const confirmedLabIds = new Set(
    snapshot.labResults
      .filter((item) => !item.deletedAt && item.status !== 'unreviewed')
      .map((item) => item.localId),
  );
  const confirmedScanIds = new Set(
    snapshot.scanResults
      .filter((item) => !item.deletedAt && item.confirmedByUser)
      .map((item) => item.localId),
  );
  return Math.max(
    snapshot.profile?.updatedAt ?? 0,
    ...[
      ...snapshot.journalEntries.filter(
        (item) =>
          (item.source !== 'lab' ||
            Boolean(
              item.sourceLocalId && confirmedLabIds.has(item.sourceLocalId),
            )) &&
          (item.source !== 'scan' ||
            Boolean(
              item.sourceLocalId && confirmedScanIds.has(item.sourceLocalId),
            )),
      ),
      ...snapshot.labResults.filter((item) => item.status !== 'unreviewed'),
      ...snapshot.scanResults.filter((item) => item.confirmedByUser),
      ...snapshot.medicalConditions,
      ...snapshot.medications,
      ...snapshot.allergyRisks,
    ]
      .filter((item) => !item.deletedAt)
      .map((item) => item.updatedAt),
  );
}

function latestPlanningInputAt(snapshot: HealthSnapshot) {
  const assistantConversationIds = new Set(
    snapshot.chatConversations
      .filter(
        (conversation) =>
          !conversation.deletedAt && conversation.mode === 'assistant',
      )
      .map((conversation) => conversation.localId),
  );
  return Math.max(
    latestHealthEvidenceAt(snapshot),
    ...snapshot.carePlanItems
      .filter((item) => !item.deletedAt)
      .map((item) => item.updatedAt),
    ...snapshot.chatMessages
      .filter(
        (item) =>
          !item.deletedAt &&
          item.role === 'user' &&
          assistantConversationIds.has(item.conversationLocalId),
      )
      .map((item) => item.updatedAt),
    ...snapshot.documents
      .filter((item) => !item.deletedAt)
      .map((item) => item.updatedAt),
  );
}

function conditionValue(
  snapshot: HealthSnapshot,
  condition: AgentRuleCondition,
  targetCarePlanLocalId: string | undefined,
  now: number,
) {
  const plan = targetCarePlanLocalId
    ? snapshot.carePlanItems.find(
        (item) => item.localId === targetCarePlanLocalId && !item.deletedAt,
      )
    : undefined;
  if (condition.field === 'profile.goal') return snapshot.profile?.goal;
  if (condition.field === 'profile.ageYears')
    return snapshot.profile?.birthDate
      ? Math.max(
          0,
          Math.floor((now - snapshot.profile.birthDate) / (365.2425 * DAY_MS)),
        )
      : undefined;
  if (condition.field === 'profile.postpartum')
    return snapshot.profile?.postpartum;
  if (condition.field === 'profile.pregnancy')
    return snapshot.profile?.goal === 'pregnancy';
  if (condition.field === 'preferences.medicalRecommendations')
    return snapshot.preferences.find((item) => !item.deletedAt)
      ?.medicalRecommendations;
  if (condition.field === 'plan.status') return plan?.status;
  if (condition.field === 'plan.safetyHold') return Boolean(plan?.safetyHoldAt);
  if (condition.field === 'daysSince.labResult') {
    const latest = snapshot.labResults
      .filter((item) => !item.deletedAt && item.status !== 'unreviewed')
      .sort((left, right) => right.collectedAt - left.collectedAt)[0];
    return latest
      ? Math.max(0, Math.floor((now - latest.collectedAt) / DAY_MS))
      : undefined;
  }
  if (condition.field === 'daysSince.healthEvidence') {
    const latest = latestHealthEvidenceAt(snapshot);
    return latest
      ? Math.max(0, Math.floor((now - latest) / DAY_MS))
      : undefined;
  }
  const updatedAt = plan?.updatedAt;
  return updatedAt === undefined
    ? undefined
    : Math.max(0, Math.floor((now - updatedAt) / DAY_MS));
}

export function evaluateAgentRuleCondition(
  snapshot: HealthSnapshot,
  condition: AgentRuleCondition,
  targetCarePlanLocalId?: string,
  now = Date.now(),
) {
  const actual = conditionValue(
    snapshot,
    condition,
    targetCarePlanLocalId,
    now,
  );
  const expected = condition.value;
  let matched = false;
  if (condition.operator === 'exists') matched = actual !== undefined;
  else if (condition.operator === 'eq') matched = actual === expected;
  else if (condition.operator === 'neq') matched = actual !== expected;
  else if (condition.operator === 'in')
    matched = Array.isArray(expected) && expected.includes(actual as never);
  else if (typeof actual === 'number' && typeof expected === 'number') {
    if (condition.operator === 'gt') matched = actual > expected;
    else if (condition.operator === 'gte') matched = actual >= expected;
    else if (condition.operator === 'lt') matched = actual < expected;
    else if (condition.operator === 'lte') matched = actual <= expected;
    else if (condition.operator === 'daysSince') matched = actual >= expected;
  }
  return condition.negate ? !matched : matched;
}

function triggerConditionsMatch(
  snapshot: HealthSnapshot,
  trigger: AgentTrigger,
  conditions: AgentRuleCondition[],
  now: number,
) {
  if (!conditions.length) return false;
  const outcomes = conditions.map((condition) =>
    evaluateAgentRuleCondition(
      snapshot,
      condition,
      trigger.targetCarePlanLocalId,
      now,
    ),
  );
  const combine =
    conditions === trigger.disengagementConditions
      ? (trigger.disengagementCombine ?? trigger.combine)
      : trigger.combine;
  return combine === 'all' ? outcomes.every(Boolean) : outcomes.some(Boolean);
}

function conditionEquals(
  actual: AgentRuleCondition,
  expected: AgentRuleCondition,
) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

const recommendationOn: AgentRuleCondition = {
  field: 'preferences.medicalRecommendations',
  operator: 'eq',
  value: true,
};
const recommendationOff: AgentRuleCondition = {
  field: 'preferences.medicalRecommendations',
  operator: 'eq',
  value: false,
};

export function validateAgentTrigger(trigger: AgentTrigger) {
  if (
    trigger.templateVersion !== AGENT_TRIGGER_TEMPLATE_VERSION ||
    trigger.policyVersion !== AGENT_POLICY_VERSION ||
    !Number.isFinite(trigger.nextEvaluationAt) ||
    !Number.isFinite(trigger.expiresAt) ||
    trigger.expiresAt <= trigger.nextEvaluationAt ||
    !Number.isInteger(trigger.maxRuns) ||
    !Number.isInteger(trigger.runCount) ||
    trigger.maxRuns < 1 ||
    trigger.maxRuns > 5 ||
    trigger.runCount < 0 ||
    trigger.runCount > trigger.maxRuns ||
    trigger.evidenceRefs.some(
      (ref) =>
        !/^[A-Za-z0-9_-]{1,160}$/.test(ref.localId) ||
        /(?:[a-z][a-z0-9+.-]*:\/\/|www\.|data:|sms:|mailto:|tel:|<\/?[A-Za-z][^>]{0,500}>|\[[^\]]+\]\s*\([^)]*\)|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:^|[^\p{L}\d-])(?:[\p{L}\d-]+\.)+[\p{L}]{2,63}(?![\p{L}\d-])|\+\d[\d\s().-]{7,}\d|\b\d{10,15}\b)/iu.test(
          ref.label,
        ),
    )
  )
    return false;
  if (trigger.combine !== 'all' || trigger.disengagementCombine !== 'any')
    return false;
  const hasExactly = (
    actual: AgentRuleCondition[],
    expected: AgentRuleCondition[],
  ) =>
    actual.length === expected.length &&
    expected.every((condition) =>
      actual.some((item) => conditionEquals(item, condition)),
    );
  if (trigger.templateKey === 'monthly-plan-review')
    return Boolean(
      !trigger.targetCarePlanLocalId &&
      trigger.maxRuns === 5 &&
      hasExactly(trigger.conditions, [recommendationOn]) &&
      hasExactly(trigger.disengagementConditions, [recommendationOff]),
    );
  if (trigger.templateKey === 'data-change-review')
    return Boolean(
      !trigger.targetCarePlanLocalId &&
      trigger.maxRuns === 1 &&
      hasExactly(trigger.conditions, [recommendationOn]) &&
      hasExactly(trigger.disengagementConditions, [recommendationOff]),
    );
  const upcoming: AgentRuleCondition = {
    field: 'plan.status',
    operator: 'eq',
    value: 'upcoming',
  };
  const noLongerUpcoming: AgentRuleCondition = {
    field: 'plan.status',
    operator: 'neq',
    value: 'upcoming',
  };
  const safetyHold: AgentRuleCondition = {
    field: 'plan.safetyHold',
    operator: 'eq',
    value: true,
  };
  return Boolean(
    trigger.targetCarePlanLocalId &&
    trigger.maxRuns === 1 &&
    hasExactly(trigger.conditions, [recommendationOn, upcoming]) &&
    hasExactly(trigger.disengagementConditions, [
      recommendationOff,
      noLongerUpcoming,
      safetyHold,
    ]),
  );
}

export function agentTriggerIsDue(
  snapshot: HealthSnapshot,
  trigger: AgentTrigger,
  now = Date.now(),
) {
  return Boolean(
    validateAgentTrigger(trigger) &&
    !trigger.deletedAt &&
    trigger.status === 'active' &&
    trigger.nextEvaluationAt <= now &&
    trigger.expiresAt > now &&
    (trigger.cooldownUntil ?? 0) <= now &&
    trigger.runCount < trigger.maxRuns &&
    triggerConditionsMatch(snapshot, trigger, trigger.conditions, now) &&
    !triggerConditionsMatch(
      snapshot,
      trigger,
      trigger.disengagementConditions,
      now,
    ),
  );
}

const goalTitles: Record<
  HealthGoal,
  { current: string[]; upcoming: string[] }
> = {
  cycle: {
    current: ['Тест на овуляцию', 'Домашнее измерение давления'],
    upcoming: [
      'Общий анализ крови',
      'Обмен железа',
      'Тиреоидный профиль',
      'Общий анализ мочи',
      'УЗИ органов малого таза',
      'Пап-тест',
      'Домашний тест вагинального pH',
    ],
  },
  planning: {
    current: ['Общий анализ крови', 'Домашнее измерение давления'],
    upcoming: [
      'Обмен железа',
      'Тиреоидный профиль',
      'Общий анализ мочи',
      'УЗИ органов малого таза',
      'Пап-тест',
      'ХГЧ в крови',
      'Самостоятельный забор на HPV или ИППП',
    ],
  },
  pregnancy: {
    current: ['Общий анализ мочи', 'Домашнее измерение давления'],
    upcoming: [
      'Общий анализ крови',
      'Обмен железа',
      'Тиреоидный профиль',
      'УЗИ при беременности',
      'Глюкоза',
      'ХГЧ в крови',
      'Коагулограмма',
    ],
  },
};

function entryByTitle(title: string) {
  return analysisCatalog.find((entry) => entry.title === title);
}

export function agentPlanCatalogCandidates(goal: HealthGoal) {
  const titles = [...goalTitles[goal].current, ...goalTitles[goal].upcoming];
  return titles
    .map(entryByTitle)
    .filter((entry): entry is AnalysisCatalogEntry => Boolean(entry));
}

function endOfCurrentMonth(now: number) {
  const date = new Date(now);
  return new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0,
    18,
    0,
    0,
    0,
  ).getTime();
}

function inFollowingMonth(now: number, offset: number) {
  const date = new Date(now);
  return new Date(
    date.getFullYear(),
    date.getMonth() + offset,
    15,
    18,
    0,
    0,
    0,
  ).getTime();
}

function evidenceForGoal(goal: HealthGoal): AgentSourceRef[] {
  return [
    {
      source: 'care-plan',
      localId: `profile-goal-${goal}`,
      label: 'care-plan',
    },
  ];
}

function recommendationFromEntry({
  confidence,
  entry,
  evidenceRefs,
  goal,
  now,
  rationale,
  status,
  upcomingIndex = 0,
}: {
  confidence?: number;
  entry: AnalysisCatalogEntry;
  evidenceRefs?: AgentSourceRef[];
  goal: HealthGoal;
  now: number;
  rationale?: string;
  status: 'current' | 'upcoming';
  upcomingIndex?: number;
}): CarePlanItem {
  const localId = newLocalId('care-plan');
  const dueAt =
    status === 'current'
      ? endOfCurrentMonth(now)
      : inFollowingMonth(now, 1 + (upcomingIndex % 4));
  return {
    localId,
    catalogKey: entry.key,
    title: entry.title,
    category: entry.category,
    description: entry.specimen,
    status,
    riskTier: entry.riskTier,
    dueAt,
    dueWindowStart: status === 'current' ? now : dueAt - 14 * DAY_MS,
    dueWindowEnd: dueAt + 14 * DAY_MS,
    scheduleBasis: 'model_inference',
    confidence: confidence ?? (status === 'current' ? 0.5 : 0.4),
    provisional: true,
    requiresClinician: entry.requiresClinician,
    evidenceRefs: (evidenceRefs?.length
      ? evidenceRefs
      : evidenceForGoal(goal)
    ).map((ref) => ({ ...ref, label: ref.source })),
    rationale:
      rationale ?? `Предварительный пункт по цели профиля. ${entry.purpose}`,
    policyVersion: AGENT_POLICY_VERSION,
    catalogVersion: ANALYSIS_CATALOG_VERSION,
    illustrationKey: entry.illustrationKey,
    updatedAt: now,
  };
}

function eventFor(
  item: CarePlanItem,
  type: RecommendationEvent['type'],
  reasonCode: string,
  now: number,
  beforeStatus?: CarePlanItem['status'],
  resultInterpretation?: string,
): RecommendationEvent {
  return {
    localId: newLocalId('recommendation-event'),
    carePlanLocalId: item.localId,
    type,
    reasonCode,
    resultInterpretation,
    beforeStatus,
    afterStatus: item.status,
    evidenceRefs: item.evidenceRefs.map((ref) => ({
      ...ref,
      label: ref.source,
    })),
    policyVersion: AGENT_POLICY_VERSION,
    occurredAt: now,
    updatedAt: now,
  };
}

function activeItems(snapshot: HealthSnapshot) {
  return snapshot.carePlanItems.filter(
    (item) =>
      !item.deletedAt &&
      (item.status === 'current' || item.status === 'upcoming'),
  );
}

function recentlyDeclinedCatalogKeys(snapshot: HealthSnapshot, now: number) {
  return new Set(
    snapshot.carePlanItems
      .filter(
        (item) =>
          !item.deletedAt &&
          item.status === 'declined' &&
          item.declinedAt &&
          now - item.declinedAt < DECLINE_COOLDOWN_MS,
      )
      .map((item) => item.catalogKey),
  );
}

export function completedCarePlanBlocksModelRecommendation(
  items: CarePlanItem[],
  catalogKey: string,
  proposedDueAt: number,
) {
  const latest = items
    .filter(
      (item) =>
        !item.deletedAt &&
        item.status === 'completed' &&
        item.catalogKey === catalogKey,
    )
    .sort(
      (left, right) =>
        (right.performedAt ?? right.updatedAt) -
        (left.performedAt ?? left.updatedAt),
    )[0];
  if (!latest) return false;
  if (latest.nextDueAt !== undefined) return proposedDueAt < latest.nextDueAt;
  if (latest.validUntil !== undefined)
    return proposedDueAt <= latest.validUntil;
  return true;
}

export type CarePlanReconciliation = {
  items: CarePlanItem[];
  events: RecommendationEvent[];
  triggers: AgentTrigger[];
  reminders: Reminder[];
};

const currentImmutableKeys: Array<keyof CarePlanItem> = [
  'catalogKey',
  'title',
  'category',
  'description',
  'riskTier',
  'dueAt',
  'dueWindowStart',
  'dueWindowEnd',
  'validUntil',
  'nextDueAt',
  'scheduleBasis',
  'confidence',
  'provisional',
  'requiresClinician',
  'rationale',
  'policyVersion',
  'catalogVersion',
  'model',
  'illustrationKey',
  'lastModelReplacementAt',
];

function allowsCompletionEvidenceAppend(
  existing: CarePlanItem,
  candidate: CarePlanItem,
) {
  if (candidate.status !== 'completed') return false;
  const additions = candidate.evidenceRefs.filter(
    (candidateRef) =>
      !existing.evidenceRefs.some(
        (existingRef) =>
          existingRef.source === candidateRef.source &&
          existingRef.localId === candidateRef.localId,
      ),
  );
  if (
    additions.length !== 1 ||
    additions[0].source !== 'test' ||
    !Number.isFinite(additions[0].occurredAt)
  )
    return false;
  return (
    JSON.stringify(candidate.evidenceRefs) ===
    JSON.stringify([...existing.evidenceRefs, additions[0]].slice(-8))
  );
}

export function isAllowedCarePlanMutation(
  existing: CarePlanItem,
  candidate: CarePlanItem,
) {
  if (existing.status !== 'current') return true;
  if (candidate.deletedAt) return false;
  if (
    candidate.status !== 'current' &&
    candidate.status !== 'completed' &&
    candidate.status !== 'declined'
  )
    return false;
  const evidenceUnchanged =
    JSON.stringify(existing.evidenceRefs) ===
    JSON.stringify(candidate.evidenceRefs);
  return (
    currentImmutableKeys.every(
      (key) => JSON.stringify(existing[key]) === JSON.stringify(candidate[key]),
    ) &&
    (evidenceUnchanged || allowsCompletionEvidenceAppend(existing, candidate))
  );
}

export function carePlanHasRequiredRanges(items: CarePlanItem[]) {
  const active = items.filter(
    (item) =>
      !item.deletedAt &&
      (item.status === 'current' || item.status === 'upcoming'),
  );
  const current = active.filter((item) => item.status === 'current').length;
  const upcoming = active.filter((item) => item.status === 'upcoming').length;
  return (
    current >= CARE_PLAN_CURRENT_MIN &&
    current <= CARE_PLAN_CURRENT_MAX &&
    upcoming >= CARE_PLAN_UPCOMING_MIN &&
    upcoming <= CARE_PLAN_UPCOMING_MAX
  );
}

export function isAllowedAgentTriggerMutation(
  existing: AgentTrigger,
  candidate: AgentTrigger,
) {
  const sameRunCount = candidate.runCount === existing.runCount;
  const recordedRun = candidate.runCount > existing.runCount;
  const statusTransitionAllowed =
    existing.status === 'active'
      ? candidate.status === 'active' ||
        candidate.status === 'suspended' ||
        candidate.status === 'completed' ||
        candidate.status === 'expired'
      : candidate.status === existing.status;
  const runMetadataAllowed = sameRunCount
    ? candidate.nextEvaluationAt === existing.nextEvaluationAt &&
      candidate.cooldownUntil === existing.cooldownUntil &&
      candidate.lastRunAt === existing.lastRunAt
    : existing.status === 'active' &&
      (candidate.status === 'active' || candidate.status === 'completed') &&
      candidate.nextEvaluationAt >= existing.nextEvaluationAt &&
      candidate.lastRunAt !== undefined &&
      candidate.lastRunAt >= (existing.lastRunAt ?? 0) &&
      candidate.lastRunAt <= candidate.updatedAt &&
      (candidate.status !== 'active' ||
        (candidate.cooldownUntil !== undefined &&
          candidate.cooldownUntil >= candidate.lastRunAt));
  return Boolean(
    !candidate.deletedAt &&
    existing.templateKey === candidate.templateKey &&
    existing.templateVersion === candidate.templateVersion &&
    existing.combine === candidate.combine &&
    existing.disengagementCombine === candidate.disengagementCombine &&
    existing.targetCarePlanLocalId === candidate.targetCarePlanLocalId &&
    JSON.stringify(existing.conditions) ===
      JSON.stringify(candidate.conditions) &&
    JSON.stringify(existing.disengagementConditions) ===
      JSON.stringify(candidate.disengagementConditions) &&
    existing.expiresAt === candidate.expiresAt &&
    existing.maxRuns === candidate.maxRuns &&
    existing.policyVersion === candidate.policyVersion &&
    JSON.stringify(existing.evidenceRefs) ===
      JSON.stringify(candidate.evidenceRefs) &&
    candidate.runCount >= existing.runCount &&
    statusTransitionAllowed &&
    runMetadataAllowed &&
    (sameRunCount || recordedRun),
  );
}

function preparationReminders(
  snapshot: HealthSnapshot,
  planItems: CarePlanItem[],
  now: number,
) {
  const reminders: Reminder[] = [];
  const activeIds = new Set(
    planItems
      .filter(
        (item) =>
          (item.status === 'current' || item.status === 'upcoming') &&
          !item.safetyHoldAt &&
          (item.dueAt ?? 0) > now,
      )
      .map((item) => item.localId),
  );
  for (const item of planItems) {
    if (!activeIds.has(item.localId)) continue;
    const localId = `agent-prep_${item.localId}`;
    const plannedDueAt =
      item.dueWindowStart ?? (item.dueAt ?? now) - 2 * DAY_MS;
    const existing = snapshot.reminders.find(
      (reminder) => reminder.localId === localId && !reminder.deletedAt,
    );
    if (existing && item.updatedAt <= existing.updatedAt) continue;
    const dueAt = Math.max(now + 60_000, plannedDueAt);
    if (existing && existing.dueAt === dueAt) continue;
    reminders.push({
      localId,
      type: 'checkup',
      title: 'План здоровья',
      body: 'Проверьте подготовку к ближайшему пункту плана в приложении.',
      dueAt,
      updatedAt: now,
    });
  }
  for (const reminder of snapshot.reminders.filter(
    (item) => !item.deletedAt && item.localId.startsWith('agent-prep_'),
  )) {
    const planId = reminder.localId.slice('agent-prep_'.length);
    if (!activeIds.has(planId))
      reminders.push({ ...reminder, deletedAt: now, updatedAt: now });
  }
  return reminders;
}

function monthStart(timestamp: number) {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
}

function completionEvidence(
  snapshot: HealthSnapshot,
  item: CarePlanItem,
  now: number,
): AgentSourceRef | undefined {
  const result = snapshot.labResults
    .filter(
      (candidate) =>
        !candidate.deletedAt &&
        candidate.status !== 'unreviewed' &&
        candidate.catalogKey === item.catalogKey &&
        candidate.collectedAt >=
          (item.dueWindowStart ?? monthStart(item.dueAt ?? now)) &&
        candidate.collectedAt <=
          (item.dueWindowEnd ?? endOfCurrentMonth(item.dueAt ?? now)),
    )
    .sort((left, right) => right.collectedAt - left.collectedAt)[0];
  return result
    ? {
        source: 'test',
        localId: result.localId,
        label: result.title,
        occurredAt: result.collectedAt,
      }
    : undefined;
}

function deterministicSafetyHoldReason(
  snapshot: HealthSnapshot,
  item: CarePlanItem,
) {
  const entry = analysisCatalogByKey.get(item.catalogKey);
  if (!entry) return 'CATALOG_ENTRY_UNAVAILABLE';
  if (
    item.status === 'current' &&
    (entry.riskTier !== 'low' ||
      entry.requiresClinician ||
      entry.riskFlags.length > 0)
  )
    return 'CURRENT_ITEM_REQUIRES_CLINICIAN_REVIEW';
  if (
    snapshot.profile?.goal === 'pregnancy' &&
    entry.riskFlags.some((flag) => flag === 'radiation' || flag === 'contrast')
  )
    return 'PREGNANCY_REQUIRES_CLINICIAN_SAFETY_REVIEW';
  const severeAllergy = snapshot.allergyRisks.some(
    (allergy) =>
      !allergy.deletedAt &&
      allergy.severity === 'severe' &&
      /контраст|йод|гадолин/i.test(
        `${allergy.allergen} ${allergy.reaction ?? ''} ${allergy.notes ?? ''}`,
      ),
  );
  if (severeAllergy && entry.riskFlags.includes('contrast'))
    return 'CONFIRMED_CONTRAST_ALLERGY_REQUIRES_CLINICIAN_REVIEW';
  return undefined;
}

function nextMonthlyReview(now: number) {
  return inFollowingMonth(now, 1);
}

function baseTrigger({
  evidenceRefs,
  expiresAt,
  localId = newLocalId('agent-trigger'),
  nextEvaluationAt,
  now,
  templateKey,
}: {
  evidenceRefs: AgentSourceRef[];
  expiresAt: number;
  localId?: string;
  nextEvaluationAt: number;
  now: number;
  templateKey: AgentTrigger['templateKey'];
}): AgentTrigger {
  return {
    localId,
    templateKey,
    templateVersion: AGENT_TRIGGER_TEMPLATE_VERSION,
    status: 'active',
    combine: 'all',
    disengagementCombine: 'any',
    conditions: [recommendationOn],
    disengagementConditions: [recommendationOff],
    nextEvaluationAt,
    expiresAt,
    maxRuns: templateKey === 'monthly-plan-review' ? 5 : 1,
    runCount: 0,
    evidenceRefs: evidenceRefs.map((ref) => ({ ...ref, label: ref.source })),
    policyVersion: AGENT_POLICY_VERSION,
    updatedAt: now,
  };
}

function sourceRefForLatestEvidence(
  snapshot: HealthSnapshot,
): AgentSourceRef | undefined {
  const confirmedLabIds = new Set(
    snapshot.labResults
      .filter((item) => !item.deletedAt && item.status !== 'unreviewed')
      .map((item) => item.localId),
  );
  const confirmedScanIds = new Set(
    snapshot.scanResults
      .filter((item) => !item.deletedAt && item.confirmedByUser)
      .map((item) => item.localId),
  );
  const assistantConversationIds = new Set(
    snapshot.chatConversations
      .filter(
        (conversation) =>
          !conversation.deletedAt && conversation.mode === 'assistant',
      )
      .map((conversation) => conversation.localId),
  );
  const candidates: AgentSourceRef[] = [
    ...snapshot.journalEntries
      .filter(
        (item) =>
          !item.deletedAt &&
          (item.source !== 'lab' ||
            Boolean(
              item.sourceLocalId && confirmedLabIds.has(item.sourceLocalId),
            )) &&
          (item.source !== 'scan' ||
            Boolean(
              item.sourceLocalId && confirmedScanIds.has(item.sourceLocalId),
            )),
      )
      .map((item) => ({
        source: 'journal' as const,
        localId: item.localId,
        label: item.label,
        occurredAt: item.occurredAt,
      })),
    ...snapshot.labResults
      .filter((item) => !item.deletedAt && item.status !== 'unreviewed')
      .map((item) => ({
        source: 'test' as const,
        localId: item.localId,
        label: item.title,
        occurredAt: item.collectedAt,
      })),
    ...snapshot.scanResults
      .filter((item) => !item.deletedAt && item.confirmedByUser)
      .map((item) => ({
        source: 'test' as const,
        localId: item.localId,
        label: item.testSystemKey,
        occurredAt: item.capturedAt,
      })),
    ...snapshot.carePlanItems
      .filter((item) => !item.deletedAt)
      .map((item) => ({
        source: 'care-plan' as const,
        localId: item.localId,
        label: item.title,
        occurredAt: item.updatedAt,
      })),
    ...snapshot.chatMessages
      .filter(
        (item) =>
          !item.deletedAt &&
          item.role === 'user' &&
          assistantConversationIds.has(item.conversationLocalId),
      )
      .map((item) => ({
        source: 'chat' as const,
        localId: item.localId,
        label: 'Сообщение пользователя в Ассистенте',
        occurredAt: item.sentAt,
        unverified: true,
      })),
    ...snapshot.documents
      .filter((item) => !item.deletedAt)
      .map((item) => ({
        source: 'document' as const,
        localId: item.localId,
        label: 'Метаданные нового документа',
        occurredAt: item.documentDate,
        unverified: true,
      })),
  ];
  return candidates.sort(
    (left, right) => (right.occurredAt ?? 0) - (left.occurredAt ?? 0),
  )[0];
}

function desiredTriggers(
  snapshot: HealthSnapshot,
  activePlan: CarePlanItem[],
  now: number,
) {
  const goal = snapshot.profile!.goal;
  const triggers: AgentTrigger[] = [];
  const reusableMonthly = snapshot.agentTriggers.find(
    (trigger) =>
      !trigger.deletedAt &&
      trigger.templateKey === 'monthly-plan-review' &&
      trigger.status === 'active' &&
      trigger.expiresAt > now &&
      trigger.runCount < trigger.maxRuns,
  );
  if (!reusableMonthly) {
    triggers.push(
      baseTrigger({
        evidenceRefs: evidenceForGoal(goal),
        expiresAt: inFollowingMonth(now, 5),
        nextEvaluationAt: nextMonthlyReview(now),
        now,
        templateKey: 'monthly-plan-review',
      }),
    );
  }

  const latestEvidenceAt = latestPlanningInputAt(snapshot);
  const lastSuccessfulRunAt =
    snapshot.preferences.find((item) => !item.deletedAt)
      ?.agentLastSuccessfulRunAt ?? 0;
  const activeDataTrigger = snapshot.agentTriggers.some(
    (trigger) =>
      !trigger.deletedAt &&
      trigger.templateKey === 'data-change-review' &&
      trigger.status === 'active' &&
      trigger.expiresAt > now,
  );
  if (latestEvidenceAt > lastSuccessfulRunAt && !activeDataTrigger) {
    const latestRef = sourceRefForLatestEvidence(snapshot);
    triggers.push(
      baseTrigger({
        evidenceRefs: latestRef ? [latestRef] : evidenceForGoal(goal),
        expiresAt: now + 30 * DAY_MS,
        nextEvaluationAt: now,
        now,
        templateKey: 'data-change-review',
      }),
    );
  }

  const existingDueTargets = new Set(
    snapshot.agentTriggers
      .filter(
        (trigger) =>
          !trigger.deletedAt &&
          trigger.templateKey === 'due-window' &&
          trigger.status === 'active' &&
          trigger.expiresAt > now,
      )
      .map((trigger) => trigger.targetCarePlanLocalId),
  );
  for (const item of activePlan.filter(
    (candidate) =>
      candidate.status === 'upcoming' &&
      candidate.dueWindowStart &&
      candidate.dueWindowEnd &&
      candidate.dueWindowEnd > now &&
      !existingDueTargets.has(candidate.localId),
  )) {
    const trigger = baseTrigger({
      evidenceRefs: item.evidenceRefs,
      expiresAt: item.dueWindowEnd!,
      nextEvaluationAt: Math.max(now, item.dueWindowStart!),
      now,
      templateKey: 'due-window',
    });
    trigger.targetCarePlanLocalId = item.localId;
    trigger.conditions.push({
      field: 'plan.status',
      operator: 'eq',
      value: 'upcoming',
    });
    trigger.disengagementConditions.push(
      { field: 'plan.status', operator: 'neq', value: 'upcoming' },
      { field: 'plan.safetyHold', operator: 'eq', value: true },
    );
    triggers.push(trigger);
  }
  return triggers;
}

export function reconcileCarePlan(
  snapshot: HealthSnapshot,
  now = Date.now(),
): CarePlanReconciliation {
  const preferences = snapshot.preferences.find((item) => !item.deletedAt);
  if (!preferences?.medicalRecommendations || !snapshot.profile) {
    const triggers = snapshot.agentTriggers
      .filter((trigger) => !trigger.deletedAt && trigger.status === 'active')
      .map((trigger) => ({
        ...trigger,
        status: 'suspended' as const,
        updatedAt: now,
      }));
    const reminders = snapshot.reminders
      .filter(
        (item) => !item.deletedAt && item.localId.startsWith('agent-prep_'),
      )
      .map((item) => ({ ...item, deletedAt: now, updatedAt: now }));
    return { items: [], events: [], triggers, reminders };
  }

  const existing = activeItems(snapshot);
  const items: CarePlanItem[] = [];
  const events: RecommendationEvent[] = [];
  const byId = new Map(existing.map((item) => [item.localId, item]));
  const duplicateIds = new Set<string>();

  const schedulePriority: Record<CarePlanItem['scheduleBasis'], number> = {
    clinician: 0,
    user: 1,
    confirmed_data: 2,
    model_inference: 3,
  };
  const itemsByCatalog = new Map<string, CarePlanItem[]>();
  for (const item of existing) {
    const matches = itemsByCatalog.get(item.catalogKey) ?? [];
    matches.push(item);
    itemsByCatalog.set(item.catalogKey, matches);
  }
  for (const matches of itemsByCatalog.values()) {
    if (matches.length < 2) continue;
    const ordered = [...matches].sort((left, right) => {
      if (left.status !== right.status)
        return left.status === 'current' ? -1 : 1;
      const basis =
        schedulePriority[left.scheduleBasis] -
        schedulePriority[right.scheduleBasis];
      if (basis !== 0) return basis;
      return left.updatedAt - right.updatedAt;
    });
    for (const duplicate of ordered.slice(1)) {
      duplicateIds.add(duplicate.localId);
      if (duplicate.status === 'upcoming') {
        const superseded: CarePlanItem = {
          ...duplicate,
          status: 'superseded',
          supersededAt: now,
          updatedAt: now,
        };
        byId.set(duplicate.localId, superseded);
        items.push(superseded);
        events.push(
          eventFor(
            superseded,
            'replaced',
            'DUPLICATE_ACTIVE_ITEM_SUPERSEDED',
            now,
            duplicate.status,
          ),
        );
      } else {
        const held: CarePlanItem = {
          ...duplicate,
          safetyHoldAt: duplicate.safetyHoldAt ?? now,
          safetyHoldReason: 'DUPLICATE_CURRENT_ITEM_REQUIRES_REVIEW',
          updatedAt: now,
        };
        byId.set(duplicate.localId, held);
        items.push(held);
        events.push(
          eventFor(
            held,
            'safety_hold',
            'DUPLICATE_CURRENT_ITEM_REQUIRES_REVIEW',
            now,
            duplicate.status,
          ),
        );
      }
    }
  }

  for (const original of existing) {
    if (duplicateIds.has(original.localId)) continue;
    const completedBy = completionEvidence(snapshot, original, now);
    if (completedBy) {
      const completed: CarePlanItem = {
        ...original,
        status: 'completed',
        performedAt: completedBy.occurredAt ?? now,
        safetyHoldAt: undefined,
        safetyHoldReason: undefined,
        evidenceRefs: [
          ...original.evidenceRefs,
          { ...completedBy, label: completedBy.source },
        ].slice(-8),
        updatedAt: now,
      };
      byId.set(original.localId, completed);
      items.push(completed);
      events.push(
        eventFor(
          completed,
          'completed',
          'CONFIRMED_RESULT_MATCHED_DUE_WINDOW',
          now,
          original.status,
        ),
      );
      continue;
    }
    const holdReason = deterministicSafetyHoldReason(snapshot, original);
    if (holdReason && original.safetyHoldReason !== holdReason) {
      const held = {
        ...original,
        safetyHoldAt: now,
        safetyHoldReason: holdReason,
        updatedAt: now,
      };
      byId.set(original.localId, held);
      items.push(held);
      events.push(
        eventFor(held, 'safety_hold', holdReason, now, original.status),
      );
    } else if (!holdReason && original.safetyHoldAt) {
      const cleared = {
        ...original,
        safetyHoldAt: undefined,
        safetyHoldReason: undefined,
        updatedAt: now,
      };
      byId.set(original.localId, cleared);
      items.push(cleared);
      events.push(
        eventFor(
          cleared,
          'reviewed',
          'CONFIRMED_SAFETY_HOLD_CLEARED',
          now,
          original.status,
        ),
      );
    }
  }

  const reconciled = [...byId.values()].filter(
    (item) => item.status === 'current' || item.status === 'upcoming',
  );
  const current = reconciled.filter((item) => item.status === 'current');
  const upcoming = reconciled.filter((item) => item.status === 'upcoming');

  const promotionCandidates = upcoming
    .filter(
      (item) =>
        item.riskTier === 'low' &&
        !item.requiresClinician &&
        (analysisCatalogByKey.get(item.catalogKey)?.riskFlags.length ?? 1) ===
          0 &&
        !item.safetyHoldAt &&
        (item.dueAt ?? Infinity) <= endOfCurrentMonth(now),
    )
    .sort(
      (left, right) => (left.dueAt ?? Infinity) - (right.dueAt ?? Infinity),
    );
  while (current.length < CARE_PLAN_CURRENT_MAX && promotionCandidates.length) {
    const candidate = promotionCandidates.shift();
    if (!candidate) break;
    const promoted: CarePlanItem = {
      ...candidate,
      status: 'current',
      updatedAt: now,
    };
    byId.set(candidate.localId, promoted);
    items.push(promoted);
    current.push(promoted);
    events.push(
      eventFor(promoted, 'promoted', 'DUE_WINDOW_REACHED', now, 'upcoming'),
    );
  }

  const effectiveSnapshot: HealthSnapshot = {
    ...snapshot,
    carePlanItems: snapshot.carePlanItems.map(
      (item) => byId.get(item.localId) ?? item,
    ),
  };
  const disengagedTriggers = snapshot.agentTriggers
    .filter((trigger) => !trigger.deletedAt && trigger.status === 'active')
    .flatMap((trigger) => {
      const nextStatus =
        trigger.expiresAt <= now
          ? 'expired'
          : trigger.runCount >= trigger.maxRuns
            ? 'completed'
            : triggerConditionsMatch(
                  effectiveSnapshot,
                  trigger,
                  trigger.disengagementConditions,
                  now,
                )
              ? 'suspended'
              : undefined;
      return nextStatus
        ? [
            {
              ...trigger,
              status: nextStatus as AgentTrigger['status'],
              updatedAt: now,
            },
          ]
        : [];
    });
  const finalPlan = effectiveSnapshot.carePlanItems.filter(
    (item) =>
      !item.deletedAt &&
      (item.status === 'current' || item.status === 'upcoming'),
  );
  const triggers = desiredTriggers(effectiveSnapshot, finalPlan, now);
  const reminders = preparationReminders(effectiveSnapshot, finalPlan, now);

  return {
    items,
    events,
    triggers: [...disengagedTriggers, ...triggers],
    reminders,
  };
}

export function markAgentTriggersRun(
  triggers: AgentTrigger[],
  localIds: string[],
  now = Date.now(),
) {
  const selected = new Set(localIds);
  return triggers.flatMap((trigger) => {
    if (
      !selected.has(trigger.localId) ||
      !agentTriggerIsDueForTime(trigger, now)
    )
      return [];
    const runCount = trigger.runCount + 1;
    const completed =
      trigger.templateKey !== 'monthly-plan-review' ||
      runCount >= trigger.maxRuns ||
      trigger.expiresAt <= nextMonthlyReview(now);
    return [
      {
        ...trigger,
        status: completed ? ('completed' as const) : ('active' as const),
        runCount,
        lastRunAt: now,
        nextEvaluationAt: completed
          ? trigger.nextEvaluationAt
          : nextMonthlyReview(now),
        cooldownUntil: completed ? undefined : now + 25 * DAY_MS,
        updatedAt: now,
      },
    ];
  });
}

function agentTriggerIsDueForTime(trigger: AgentTrigger, now: number) {
  return (
    trigger.status === 'active' &&
    trigger.nextEvaluationAt <= now &&
    trigger.expiresAt > now &&
    (trigger.cooldownUntil ?? 0) <= now &&
    trigger.runCount < trigger.maxRuns
  );
}

export type AgentPlanProposal = {
  recommendations: Array<{
    catalogKey: string;
    monthOffset: 0 | 1 | 2 | 3 | 4;
    confidence: number;
    rationale: string;
    evidenceSourceIds: string[];
  }>;
  model: string;
};

function availableEvidence(snapshot: HealthSnapshot, now: number) {
  const refs: AgentSourceRef[] = [evidenceForGoal(snapshot.profile!.goal)[0]];
  const confirmedLabIds = new Set(
    snapshot.labResults
      .filter((item) => !item.deletedAt && item.status !== 'unreviewed')
      .map((item) => item.localId),
  );
  const confirmedScanIds = new Set(
    snapshot.scanResults
      .filter((item) => !item.deletedAt && item.confirmedByUser)
      .map((item) => item.localId),
  );
  for (const entry of snapshot.journalEntries.filter(
    (item) =>
      !item.deletedAt &&
      item.occurredAt <= now &&
      (item.source !== 'lab' ||
        Boolean(
          item.sourceLocalId && confirmedLabIds.has(item.sourceLocalId),
        )) &&
      (item.source !== 'scan' ||
        Boolean(
          item.sourceLocalId && confirmedScanIds.has(item.sourceLocalId),
        )),
  )) {
    refs.push({
      source: 'journal',
      localId: entry.localId,
      label: entry.label,
      occurredAt: entry.occurredAt,
    });
  }
  for (const result of snapshot.labResults.filter(
    (item) =>
      !item.deletedAt &&
      item.status !== 'unreviewed' &&
      item.collectedAt <= now,
  )) {
    refs.push({
      source: 'test',
      localId: result.localId,
      label: result.title,
      occurredAt: result.collectedAt,
    });
  }
  for (const result of snapshot.scanResults.filter(
    (item) => !item.deletedAt && item.confirmedByUser && item.capturedAt <= now,
  )) {
    refs.push({
      source: 'test',
      localId: result.localId,
      label: result.testSystemKey,
      occurredAt: result.capturedAt,
    });
  }
  for (const item of snapshot.carePlanItems.filter(
    (entry) => !entry.deletedAt,
  )) {
    refs.push({
      source: 'care-plan',
      localId: item.localId,
      label: item.title,
      occurredAt: item.dueAt ?? item.updatedAt,
    });
  }
  const assistantConversationIds = new Set(
    snapshot.chatConversations
      .filter(
        (conversation) =>
          !conversation.deletedAt && conversation.mode === 'assistant',
      )
      .map((conversation) => conversation.localId),
  );
  for (const message of snapshot.chatMessages.filter(
    (item) =>
      !item.deletedAt &&
      item.role === 'user' &&
      item.sentAt <= now &&
      assistantConversationIds.has(item.conversationLocalId),
  )) {
    refs.push({
      source: 'chat',
      localId: message.localId,
      label: 'Сообщение пользователя в Ассистенте',
      occurredAt: message.sentAt,
      unverified: true,
    });
  }
  for (const document of snapshot.documents.filter(
    (item) => !item.deletedAt && item.documentDate <= now,
  )) {
    refs.push({
      source: 'document',
      localId: document.localId,
      label: 'Метаданные нового документа',
      occurredAt: document.documentDate,
      unverified: true,
    });
  }
  return new Map(refs.map((ref) => [ref.localId, ref]));
}

export function applyAgentPlanProposal(
  snapshot: HealthSnapshot,
  proposal: AgentPlanProposal,
  now = Date.now(),
) {
  if (!snapshot.profile) return { items: [], events: [] };
  const preferences = snapshot.preferences.find((item) => !item.deletedAt);
  if (!preferences?.medicalRecommendations) return { items: [], events: [] };
  const allowed = new Map(
    agentPlanCatalogCandidates(snapshot.profile.goal).map((entry) => [
      entry.key,
      entry,
    ]),
  );
  const evidence = availableEvidence(snapshot, now);
  const existing = activeItems(snapshot);
  const existingKeys = new Set(existing.map((item) => item.catalogKey));
  const declinedKeys = recentlyDeclinedCatalogKeys(snapshot, now);
  let currentCount = existing.filter(
    (item) => item.status === 'current',
  ).length;
  let upcomingCount = existing.filter(
    (item) => item.status === 'upcoming',
  ).length;
  const items: CarePlanItem[] = [];
  const events: RecommendationEvent[] = [];

  const recommendations = proposal.recommendations.flatMap(
    (recommendation, index, all) => {
      const entry = allowed.get(recommendation.catalogKey);
      if (
        !entry ||
        declinedKeys.has(entry.key) ||
        all.findIndex((candidate) => candidate.catalogKey === entry.key) !==
          index ||
        !Number.isInteger(recommendation.monthOffset) ||
        recommendation.monthOffset < 0 ||
        recommendation.monthOffset > 4 ||
        recommendation.confidence < 0 ||
        recommendation.confidence > 1
      )
        return [];
      const refs = recommendation.evidenceSourceIds
        .map((id) => evidence.get(id))
        .filter((ref): ref is AgentSourceRef => Boolean(ref));
      return [{ recommendation, entry, refs }];
    },
  );

  const desiredKeys = new Set(recommendations.map((item) => item.entry.key));
  const unused = recommendations.filter(
    (item) =>
      !existingKeys.has(item.entry.key) && item.recommendation.monthOffset > 0,
  );
  for (const original of existing
    .filter(
      (item) =>
        item.status === 'upcoming' &&
        item.scheduleBasis === 'model_inference' &&
        !desiredKeys.has(item.catalogKey) &&
        now - (item.lastModelReplacementAt ?? 0) >=
          MODEL_REPLACEMENT_COOLDOWN_MS,
    )
    .sort((left, right) => left.confidence - right.confidence)) {
    const candidateIndex = unused.findIndex(
      ({ entry, recommendation, refs }) =>
        recommendation.confidence > original.confidence &&
        !completedCarePlanBlocksModelRecommendation(
          snapshot.carePlanItems,
          entry.key,
          inFollowingMonth(now, recommendation.monthOffset),
        ) &&
        refs.some(
          (ref) =>
            (ref.source === 'journal' ||
              ref.source === 'test' ||
              ref.source === 'chat' ||
              ref.source === 'document') &&
            (ref.occurredAt ?? 0) > original.updatedAt,
        ),
    );
    if (candidateIndex < 0) continue;
    const [{ entry, recommendation, refs }] = unused.splice(candidateIndex, 1);
    const replacement = recommendationFromEntry({
      entry,
      evidenceRefs: refs,
      goal: snapshot.profile.goal,
      now,
      status: 'upcoming',
      upcomingIndex: Math.max(0, recommendation.monthOffset - 1),
      confidence: recommendation.confidence,
      rationale: recommendation.rationale.slice(0, 700),
    });
    replacement.model = proposal.model;
    replacement.lastModelReplacementAt = now;
    if (!validateCarePlanItem(replacement)) continue;
    const superseded: CarePlanItem = {
      ...original,
      status: 'superseded',
      supersededAt: now,
      lastModelReplacementAt: now,
      updatedAt: now,
    };
    items.push(superseded, replacement);
    events.push(
      eventFor(
        superseded,
        'replaced',
        'NEW_EVIDENCE_SUPPORTED_BETTER_CANDIDATE',
        now,
        'upcoming',
      ),
      eventFor(replacement, 'created', 'MODEL_REPLACEMENT_VALIDATED', now),
    );
    existingKeys.delete(original.catalogKey);
    existingKeys.add(entry.key);
  }

  for (const { entry, recommendation, refs } of recommendations) {
    if (existingKeys.has(entry.key)) continue;
    const requestedCurrent = recommendation.monthOffset === 0;
    const hasStructuredCurrentBasis =
      refs.length === 0 || refs.some((ref) => ref.source === 'test');
    const canBeCurrent =
      requestedCurrent &&
      hasStructuredCurrentBasis &&
      entry.riskTier === 'low' &&
      !entry.requiresClinician &&
      entry.riskFlags.length === 0 &&
      currentCount < CARE_PLAN_CURRENT_MAX;
    const status = canBeCurrent ? 'current' : 'upcoming';
    if (status === 'upcoming' && upcomingCount >= CARE_PLAN_UPCOMING_MAX)
      continue;
    if (status === 'current') currentCount += 1;
    else upcomingCount += 1;
    const monthOffset =
      status === 'current' ? 0 : Math.max(1, recommendation.monthOffset);
    const item = recommendationFromEntry({
      entry,
      evidenceRefs: refs,
      goal: snapshot.profile.goal,
      now,
      status,
      upcomingIndex: Math.max(0, monthOffset - 1),
      confidence: recommendation.confidence,
      rationale: recommendation.rationale.slice(0, 700),
    });
    const duplicateCompletion = completedCarePlanBlocksModelRecommendation(
      snapshot.carePlanItems,
      item.catalogKey,
      item.dueAt ?? now,
    );
    if (duplicateCompletion) {
      if (status === 'current') currentCount -= 1;
      else upcomingCount -= 1;
      continue;
    }
    item.model = proposal.model;
    if (!validateCarePlanItem(item)) {
      if (status === 'current') currentCount -= 1;
      else upcomingCount -= 1;
      continue;
    }
    items.push(item);
    existingKeys.add(entry.key);
    events.push(
      eventFor(item, 'created', 'MODEL_PLAN_PROPOSAL_VALIDATED', now),
    );
  }
  if (
    currentCount < CARE_PLAN_CURRENT_MIN ||
    currentCount > CARE_PLAN_CURRENT_MAX ||
    upcomingCount < CARE_PLAN_UPCOMING_MIN ||
    upcomingCount > CARE_PLAN_UPCOMING_MAX
  )
    return { items: [], events: [] };
  return { items, events };
}

export function applyConfirmedCarePlanSchedule(
  item: CarePlanItem,
  input: {
    basis: 'clinician' | 'user' | 'confirmed_data';
    dueAt: number;
    validUntil?: number;
    evidenceRefs: AgentSourceRef[];
  },
  now = Date.now(),
) {
  const currentDate = new Date(now);
  const startOfToday = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    currentDate.getDate(),
  ).getTime();
  const endOfFourthFollowingMonth = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth() + 5,
    0,
    23,
    59,
    59,
    999,
  ).getTime();
  if (
    item.status !== 'upcoming' ||
    !['clinician', 'user', 'confirmed_data'].includes(input.basis) ||
    !Number.isFinite(input.dueAt) ||
    input.dueAt < startOfToday ||
    input.dueAt > endOfFourthFollowingMonth ||
    (input.validUntil !== undefined && !Number.isFinite(input.validUntil)) ||
    !input.evidenceRefs.length
  )
    throw new Error('INVALID_CONFIRMED_SCHEDULE');
  const dueAt = input.dueAt;
  const updated: CarePlanItem = {
    ...item,
    dueAt,
    dueWindowStart: dueAt - 14 * DAY_MS,
    dueWindowEnd: dueAt + 14 * DAY_MS,
    validUntil: input.validUntil,
    scheduleBasis: input.basis,
    confidence: 1,
    provisional: false,
    evidenceRefs: input.evidenceRefs
      .slice(0, 8)
      .map((ref) => ({ ...ref, label: ref.source })),
    updatedAt: now,
  };
  if (!validateCarePlanItem(updated))
    throw new Error('INVALID_CONFIRMED_SCHEDULE');
  return {
    item: updated,
    event: eventFor(
      updated,
      'reviewed',
      'CONFIRMED_SCHEDULE_TAKES_PRECEDENCE',
      now,
      item.status,
    ),
  };
}

export function applyCarePlanUserAction(
  item: CarePlanItem,
  action: 'complete' | 'decline' | 'restore',
  now = Date.now(),
  resultInterpretation?: string,
) {
  if (action === 'restore' && item.status !== 'completed')
    throw new Error('INVALID_CARE_PLAN_RESTORE');
  const normalizedInterpretation = resultInterpretation?.trim();
  if (normalizedInterpretation && normalizedInterpretation.length > 2000)
    throw new Error('INVALID_CARE_PLAN_RESULT_INTERPRETATION');
  const catalog = analysisCatalogByKey.get(item.catalogKey);
  const restoredStatus =
    item.riskTier === 'low' &&
    !item.requiresClinician &&
    (catalog?.riskFlags.length ?? 1) === 0
      ? 'current'
      : 'upcoming';
  const next: CarePlanItem =
    action === 'complete'
      ? {
          ...item,
          status: 'completed',
          performedAt: now,
          safetyHoldAt: undefined,
          safetyHoldReason: undefined,
          updatedAt: now,
        }
      : action === 'decline'
        ? {
            ...item,
            status: 'declined',
            declinedAt: now,
            safetyHoldAt: undefined,
            safetyHoldReason: undefined,
            updatedAt: now,
          }
        : {
            ...item,
            status: restoredStatus,
            dueAt: now,
            dueWindowStart: now,
            dueWindowEnd: now + 14 * DAY_MS,
            performedAt: undefined,
            declinedAt: undefined,
            safetyHoldAt: undefined,
            safetyHoldReason: undefined,
            updatedAt: now,
          };
  return {
    item: next,
    event: eventFor(
      next,
      action === 'complete'
        ? 'completed'
        : action === 'decline'
          ? 'declined'
          : 'reviewed',
      action === 'complete'
        ? 'USER_RECORDED_COMPLETION'
        : action === 'decline'
          ? 'USER_DECLINED'
          : 'USER_RESTORED_TO_PLAN',
      now,
      item.status,
      action === 'complete' ? normalizedInterpretation : undefined,
    ),
  };
}

export function validateCarePlanItem(item: CarePlanItem) {
  const entry = analysisCatalogByKey.get(item.catalogKey);
  if (
    !entry ||
    entry.title !== item.title ||
    entry.category !== item.category ||
    entry.specimen !== item.description ||
    entry.riskTier !== item.riskTier ||
    entry.requiresClinician !== item.requiresClinician ||
    entry.illustrationKey !== item.illustrationKey ||
    !/^[A-Za-z0-9_-]{1,180}$/.test(item.localId) ||
    !Number.isFinite(item.confidence) ||
    item.confidence < 0 ||
    item.confidence > 1 ||
    !item.rationale ||
    item.rationale.length > 700 ||
    /(?:[a-z][a-z0-9+.-]*:\/\/|www\.|data:|sms:|mailto:|tel:|<\/?[A-Za-z][^>]{0,500}>|\[[^\]]+\]\s*\([^)]*\)|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:^|[^\p{L}\d-])(?:[\p{L}\d-]+\.)+[\p{L}]{2,63}(?![\p{L}\d-])|\+\d[\d\s().-]{7,}\d|\b\d{10,15}\b)/iu.test(
      item.rationale,
    ) ||
    item.evidenceRefs.length > 8 ||
    item.evidenceRefs.some(
      (ref) =>
        !/^[A-Za-z0-9_-]{1,160}$/.test(ref.localId) ||
        ref.label.length > 240 ||
        /(?:[a-z][a-z0-9+.-]*:\/\/|www\.|data:|sms:|mailto:|tel:|<\/?[A-Za-z][^>]{0,500}>|\[[^\]]+\]\s*\([^)]*\)|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:^|[^\p{L}\d-])(?:[\p{L}\d-]+\.)+[\p{L}]{2,63}(?![\p{L}\d-])|\+\d[\d\s().-]{7,}\d|\b\d{10,15}\b)/iu.test(
          ref.label,
        ),
    )
  )
    return false;
  if (
    item.status === 'current' &&
    (entry.riskTier !== 'low' ||
      entry.requiresClinician ||
      entry.riskFlags.length > 0)
  )
    return false;
  if (
    (item.status === 'completed') !== Number.isFinite(item.performedAt) ||
    (item.status === 'declined') !== Number.isFinite(item.declinedAt) ||
    (item.status === 'superseded') !== Number.isFinite(item.supersededAt)
  )
    return false;
  if (
    item.status !== 'current' &&
    item.status !== 'upcoming' &&
    (item.safetyHoldAt !== undefined || item.safetyHoldReason !== undefined)
  )
    return false;
  if (
    item.scheduleBasis === 'model_inference' &&
    (item.validUntil !== undefined || item.nextDueAt !== undefined)
  )
    return false;
  if (
    item.scheduleBasis === 'model_inference' &&
    (!item.provisional ||
      item.validUntil !== undefined ||
      item.dueAt === undefined ||
      item.dueWindowStart === undefined ||
      item.dueWindowEnd === undefined)
  )
    return false;
  if (
    item.scheduleBasis !== 'model_inference' &&
    (item.provisional || item.confidence !== 1)
  )
    return false;
  if (
    item.dueAt !== undefined &&
    item.dueWindowStart !== undefined &&
    item.dueWindowEnd !== undefined &&
    (item.dueWindowStart > item.dueAt || item.dueWindowEnd < item.dueAt)
  )
    return false;
  return (
    item.policyVersion === AGENT_POLICY_VERSION &&
    item.catalogVersion === ANALYSIS_CATALOG_VERSION
  );
}

export function validateRecommendationEvent(event: RecommendationEvent) {
  return Boolean(
    event.policyVersion === AGENT_POLICY_VERSION &&
    /^[A-Z0-9_]{3,100}$/.test(event.reasonCode) &&
    (event.resultInterpretation === undefined ||
      (event.type === 'completed' &&
        event.resultInterpretation.trim() === event.resultInterpretation &&
        event.resultInterpretation.length > 0 &&
        event.resultInterpretation.length <= 2000)) &&
    Number.isFinite(event.occurredAt) &&
    event.evidenceRefs.length <= 8 &&
    event.evidenceRefs.every(
      (ref) =>
        ref.label === ref.source && /^[A-Za-z0-9_-]{1,160}$/.test(ref.localId),
    ),
  );
}
