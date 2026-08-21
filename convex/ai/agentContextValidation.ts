import { AI_AGENT_CONTEXT_VERSION } from '../aiAgentConfig';

type JsonObject = Record<string, unknown>;

const sourceKinds = new Set([
  'journal',
  'test',
  'document',
  'chat',
  'care-plan',
]);

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value: JsonObject, keys: readonly string[]) {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value);
}

function optionalFiniteNumber(value: unknown) {
  return value === undefined || finiteNumber(value);
}

function safeString(value: unknown, max: number) {
  return (
    typeof value === 'string' &&
    value.length <= max &&
    !/!?\[[^\]]*\]\([^)]*\)/.test(value) &&
    !/(?:[a-z][a-z0-9+.-]*:\/\/|www\.|data:|sms:|mailto:|tel:|\/(?:private|var|users)\/|<\/?[A-Za-z][^>]{0,500}>)/i.test(
      value,
    ) &&
    !/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(value) &&
    !/(?:^|[^\p{L}\d-])(?:[\p{L}\d-]+\.)+[\p{L}]{2,63}(?![\p{L}\d-])/iu.test(
      value,
    ) &&
    !/(?:\+\d[\d\s().-]{7,}\d|\b\d{10,15}\b)/.test(value) &&
    !/(?:device|account|profile|user)[_-]?id/i.test(value)
  );
}

function optionalSafeString(value: unknown, max: number) {
  return value === undefined || safeString(value, max);
}

function validSourceRef(value: unknown) {
  if (!isObject(value)) return false;
  if (
    !hasOnlyKeys(value, [
      'source',
      'localId',
      'label',
      'occurredAt',
      'ageDays',
      'stale',
      'unverified',
    ]) ||
    !sourceKinds.has(value.source as string) ||
    typeof value.localId !== 'string' ||
    !/^[A-Za-z0-9_-]{1,160}$/.test(value.localId) ||
    !safeString(value.label, 240) ||
    !optionalFiniteNumber(value.occurredAt) ||
    !optionalFiniteNumber(value.ageDays) ||
    (value.stale !== undefined && typeof value.stale !== 'boolean') ||
    (value.unverified !== undefined && typeof value.unverified !== 'boolean')
  )
    return false;
  return true;
}

function validProfile(value: unknown) {
  if (!isObject(value)) return false;
  if (
    !hasOnlyKeys(value, [
      'ageYears',
      'goal',
      'heightCm',
      'weightKg',
      'postpartum',
      'postContraception',
      'pregnancyWeeks',
      'lastPeriodAgeDays',
      'cycleLengthDays',
      'conditions',
      'medications',
      'allergies',
    ]) ||
    !['cycle', 'planning', 'pregnancy'].includes(value.goal as string) ||
    !optionalFiniteNumber(value.ageYears) ||
    !optionalFiniteNumber(value.heightCm) ||
    !optionalFiniteNumber(value.weightKg) ||
    !optionalFiniteNumber(value.pregnancyWeeks) ||
    !optionalFiniteNumber(value.lastPeriodAgeDays) ||
    !optionalFiniteNumber(value.cycleLengthDays) ||
    (value.postpartum !== undefined && typeof value.postpartum !== 'boolean') ||
    (value.postContraception !== undefined &&
      typeof value.postContraception !== 'boolean') ||
    !Array.isArray(value.conditions) ||
    value.conditions.length > 20 ||
    !Array.isArray(value.medications) ||
    value.medications.length > 20 ||
    !Array.isArray(value.allergies) ||
    value.allergies.length > 20
  )
    return false;
  return (
    value.conditions.every(
      (item) =>
        isObject(item) &&
        hasOnlyKeys(item, ['title', 'notes']) &&
        safeString(item.title, 160) &&
        optionalSafeString(item.notes, 300),
    ) &&
    value.medications.every(
      (item) =>
        isObject(item) &&
        hasOnlyKeys(item, ['name', 'dosage', 'frequency']) &&
        safeString(item.name, 160) &&
        optionalSafeString(item.dosage, 120) &&
        optionalSafeString(item.frequency, 120),
    ) &&
    value.allergies.every(
      (item) =>
        isObject(item) &&
        hasOnlyKeys(item, ['allergen', 'reaction', 'severity']) &&
        safeString(item.allergen, 160) &&
        optionalSafeString(item.reaction, 200) &&
        safeString(item.severity, 40),
    )
  );
}

function validJournalItem(value: unknown) {
  return (
    isObject(value) &&
    hasOnlyKeys(value, ['sourceRef', 'kind', 'label', 'value']) &&
    validSourceRef(value.sourceRef) &&
    (value.sourceRef as JsonObject).source === 'journal' &&
    finiteNumber((value.sourceRef as JsonObject).ageDays) &&
    ((value.sourceRef as JsonObject).ageDays as number) >= 0 &&
    ((value.sourceRef as JsonObject).ageDays as number) <= 30 &&
    (value.sourceRef as JsonObject).stale === false &&
    safeString(value.kind, 40) &&
    safeString(value.label, 160) &&
    optionalSafeString(value.value, 700)
  );
}

function validTestItem(value: unknown) {
  return (
    isObject(value) &&
    hasOnlyKeys(value, ['sourceRef', 'title', 'collectedAt', 'values']) &&
    validSourceRef(value.sourceRef) &&
    (value.sourceRef as JsonObject).source === 'test' &&
    safeString(value.title, 160) &&
    finiteNumber(value.collectedAt) &&
    Array.isArray(value.values) &&
    value.values.length <= 20 &&
    value.values.every((item) => safeString(item, 360))
  );
}

function validPlanItem(value: unknown) {
  return (
    isObject(value) &&
    hasOnlyKeys(value, [
      'sourceRef',
      'title',
      'status',
      'dueAt',
      'provisional',
      'safetyHold',
    ]) &&
    validSourceRef(value.sourceRef) &&
    (value.sourceRef as JsonObject).source === 'care-plan' &&
    safeString(value.title, 160) &&
    ['current', 'upcoming'].includes(value.status as string) &&
    optionalFiniteNumber(value.dueAt) &&
    typeof value.provisional === 'boolean' &&
    typeof value.safetyHold === 'boolean'
  );
}

function validPlanningSignal(value: unknown) {
  if (
    !isObject(value) ||
    !hasOnlyKeys(value, ['sourceRef', 'kind', 'label', 'value']) ||
    !validSourceRef(value.sourceRef) ||
    !['assistant_chat', 'document_metadata'].includes(value.kind as string) ||
    !safeString(value.label, 160) ||
    !optionalSafeString(value.value, 700)
  )
    return false;
  const ref = value.sourceRef as JsonObject;
  return value.kind === 'assistant_chat'
    ? ref.source === 'chat' && ref.unverified === true
    : ref.source === 'document' && ref.unverified === true;
}

function validOmitted(value: unknown) {
  return (
    isObject(value) &&
    hasOnlyKeys(value, [
      'profile',
      'journal',
      'tests',
      'carePlan',
      'planningSignals',
    ]) &&
    ['profile', 'journal', 'tests', 'carePlan'].every(
      (key) =>
        Number.isInteger(value[key]) &&
        typeof value[key] === 'number' &&
        value[key] >= 0,
    ) &&
    (value.planningSignals === undefined ||
      (Number.isInteger(value.planningSignals) &&
        typeof value.planningSignals === 'number' &&
        value.planningSignals >= 0))
  );
}

export type ValidatedAgentContext = JsonObject & {
  version: typeof AI_AGENT_CONTEXT_VERSION;
  generatedAt: number;
};

export function validatedAgentContextMatchesAccess(
  context: ValidatedAgentContext,
  goal: 'cycle' | 'planning' | 'pregnancy',
  now: number,
  maxClockSkewMs: number,
) {
  const profile = context.profile;
  return Boolean(
    isObject(profile) &&
    profile.goal === goal &&
    Math.abs(context.generatedAt - now) <= maxClockSkewMs,
  );
}

export function parseValidatedAgentContext(
  contextEnvelope: string,
  maxCharacters: number,
): ValidatedAgentContext | null {
  if (!contextEnvelope || contextEnvelope.length > maxCharacters) return null;
  try {
    const parsed: unknown = JSON.parse(contextEnvelope);
    if (
      !isObject(parsed) ||
      !hasOnlyKeys(parsed, [
        'version',
        'generatedAt',
        'profile',
        'recentJournal',
        'confirmedTests',
        'carePlan',
        'planningSignals',
        'omitted',
      ]) ||
      parsed.version !== AI_AGENT_CONTEXT_VERSION ||
      !finiteNumber(parsed.generatedAt) ||
      !validProfile(parsed.profile) ||
      !Array.isArray(parsed.recentJournal) ||
      parsed.recentJournal.length > 100 ||
      !parsed.recentJournal.every(validJournalItem) ||
      !parsed.recentJournal.every((item) => {
        const sourceRef = (item as JsonObject).sourceRef as JsonObject;
        return (
          finiteNumber(sourceRef.occurredAt) &&
          (sourceRef.occurredAt as number) <= (parsed.generatedAt as number) &&
          Math.floor(
            ((parsed.generatedAt as number) -
              (sourceRef.occurredAt as number)) /
              86_400_000,
          ) === sourceRef.ageDays
        );
      }) ||
      !Array.isArray(parsed.confirmedTests) ||
      parsed.confirmedTests.length > 60 ||
      !parsed.confirmedTests.every(validTestItem) ||
      !parsed.confirmedTests.every(
        (item) =>
          ((item as JsonObject).collectedAt as number) <=
          (parsed.generatedAt as number),
      ) ||
      !Array.isArray(parsed.carePlan) ||
      parsed.carePlan.length > 15 ||
      !parsed.carePlan.every(validPlanItem) ||
      (parsed.planningSignals !== undefined &&
        (!Array.isArray(parsed.planningSignals) ||
          parsed.planningSignals.length > 12 ||
          !parsed.planningSignals.every(validPlanningSignal) ||
          !parsed.planningSignals.every((item) => {
            const ref = (item as JsonObject).sourceRef as JsonObject;
            return (
              finiteNumber(ref.occurredAt) &&
              (ref.occurredAt as number) <= (parsed.generatedAt as number)
            );
          }))) ||
      !validOmitted(parsed.omitted)
    )
      return null;
    return parsed as ValidatedAgentContext;
  } catch {
    return null;
  }
}

export function validatedContextSourceRefs(context: ValidatedAgentContext) {
  const refs: Array<{
    source: 'journal' | 'test' | 'document' | 'chat' | 'care-plan';
    localId: string;
    label: string;
    occurredAt?: number;
    ageDays?: number;
    stale?: boolean;
    unverified?: boolean;
  }> = [];
  for (const key of [
    'recentJournal',
    'confirmedTests',
    'carePlan',
    'planningSignals',
  ] as const) {
    const items = (context[key] ?? []) as Array<{
      sourceRef: (typeof refs)[number];
    }>;
    for (const item of items) {
      refs.push(item.sourceRef);
      if (refs.length >= 24) return refs;
    }
  }
  return refs;
}
