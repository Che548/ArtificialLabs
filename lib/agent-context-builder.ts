import type { AgentSourceRef, HealthSnapshot } from './health-types';
import {
  AGENT_RECENT_JOURNAL_DAYS,
  journalAgeMetadata,
} from './agent-context-policy';

export const AGENT_CONTEXT_VERSION = '2026-08-20-v1' as const;
export const AGENT_CONTEXT_MAX_CHARS = 24_000;
export const AGENT_TOOL_RESULTS_MAX_CHARS = 12_000;
export { AGENT_RECENT_JOURNAL_DAYS } from './agent-context-policy';

const DAY_MS = 24 * 60 * 60 * 1000;

export type AssistantDataScope =
  'profile' | 'journal' | 'tests' | 'documents' | 'chats' | 'care_plan';

export const assistantDataScopes: AssistantDataScope[] = [
  'profile',
  'journal',
  'tests',
  'documents',
  'chats',
  'care_plan',
];

export type AgentContextEnvelope = {
  version: typeof AGENT_CONTEXT_VERSION;
  generatedAt: number;
  profile?: {
    ageYears?: number;
    goal: 'cycle' | 'planning' | 'pregnancy';
    heightCm?: number;
    weightKg?: number;
    postpartum?: boolean;
    postContraception?: boolean;
    pregnancyWeeks?: number;
    lastPeriodAgeDays?: number;
    cycleLengthDays?: number;
    conditions: Array<{ title: string; notes?: string }>;
    medications: Array<{
      name: string;
      dosage?: string;
      frequency?: string;
    }>;
    allergies: Array<{
      allergen: string;
      reaction?: string;
      severity: string;
    }>;
  };
  recentJournal: Array<{
    sourceRef: AgentSourceRef;
    kind: string;
    label: string;
    value?: string;
  }>;
  confirmedTests: Array<{
    sourceRef: AgentSourceRef;
    title: string;
    collectedAt: number;
    values: string[];
  }>;
  carePlan: Array<{
    sourceRef: AgentSourceRef;
    title: string;
    status: string;
    dueAt?: number;
    provisional: boolean;
    safetyHold: boolean;
  }>;
  planningSignals: Array<{
    sourceRef: AgentSourceRef;
    kind: 'assistant_chat' | 'document_metadata';
    label: string;
    value?: string;
  }>;
  omitted: {
    profile: number;
    journal: number;
    tests: number;
    carePlan: number;
    planningSignals: number;
  };
};

export function safeAgentText(value: string | undefined, max = 500) {
  if (!value) return undefined;
  return value
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(
      /(?:[a-z][a-z0-9+.-]*:\/\/|www\.|data:)[^\s]+/gi,
      '[ссылка скрыта]',
    )
    .replace(/<\/?[A-Za-z][^>]{0,500}>/g, '[разметка скрыта]')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[контакт скрыт]')
    .replace(
      /(^|[^\p{L}\d-])(?:[\p{L}\d-]+\.)+[\p{L}]{2,63}(?![\p{L}\d-])/giu,
      '$1[ссылка скрыта]',
    )
    .replace(/(?:sms:|mailto:|tel:)[^\s]+/gi, '[контакт скрыт]')
    .replace(/\+\d[\d\s().-]{7,}\d/g, '[контакт скрыт]')
    .replace(/\b\d{10,15}\b/g, '[контакт скрыт]')
    .replace(/\/(?:private|var|users)\/[^\s]*/gi, '[путь скрыт]')
    .trim()
    .slice(0, max);
}

function ageDays(at: number, now: number) {
  return journalAgeMetadata(at, now).ageDays;
}

function ageYears(birthDate: number | undefined, now: number) {
  if (!birthDate || birthDate > now) return undefined;
  return Math.max(0, Math.floor((now - birthDate) / (365.2425 * DAY_MS)));
}

function fitNewest<T>(items: T[], maxCharacters: number) {
  const selected: T[] = [];
  let characters = 0;
  for (const item of items) {
    const length = JSON.stringify(item).length;
    if (characters + length > maxCharacters) break;
    selected.push(item);
    characters += length;
  }
  return { selected, omitted: items.length - selected.length };
}

export function buildAgentContextEnvelope(
  snapshot: HealthSnapshot,
  now = Date.now(),
  options: {
    includeBodyMetrics?: boolean;
    includePlanningSignals?: boolean;
  } = {},
): AgentContextEnvelope {
  const profile = snapshot.profile;
  const activeConditions = snapshot.medicalConditions
    .filter((item) => !item.deletedAt && item.status === 'active')
    .sort((left, right) => right.updatedAt - left.updatedAt);
  const activeMedications = snapshot.medications
    .filter((item) => !item.deletedAt && item.active)
    .sort((left, right) => right.updatedAt - left.updatedAt);
  const activeAllergies = snapshot.allergyRisks
    .filter((item) => !item.deletedAt)
    .sort((left, right) => right.updatedAt - left.updatedAt);
  const conditions = activeConditions.slice(0, 20).map((item) => ({
    title: safeAgentText(item.title, 160) ?? '',
    notes: safeAgentText(item.notes, 300),
  }));
  const medications = activeMedications.slice(0, 20).map((item) => ({
    name: safeAgentText(item.name, 160) ?? '',
    dosage: safeAgentText(item.dosage, 120),
    frequency: safeAgentText(item.frequency, 120),
  }));
  const allergies = activeAllergies.slice(0, 20).map((item) => ({
    allergen: safeAgentText(item.allergen, 160) ?? '',
    reaction: safeAgentText(item.reaction, 200),
    severity: item.severity,
  }));

  const confirmedLabIds = new Set(
    snapshot.labResults
      .filter((result) => !result.deletedAt && result.status !== 'unreviewed')
      .map((result) => result.localId),
  );
  const confirmedScanIds = new Set(
    snapshot.scanResults
      .filter((result) => !result.deletedAt && result.confirmedByUser)
      .map((result) => result.localId),
  );
  const journalCandidates = snapshot.journalEntries
    .filter(
      (entry) =>
        !entry.deletedAt &&
        entry.occurredAt <= now &&
        (entry.source !== 'lab' ||
          Boolean(
            entry.sourceLocalId && confirmedLabIds.has(entry.sourceLocalId),
          )) &&
        (entry.source !== 'scan' ||
          Boolean(
            entry.sourceLocalId && confirmedScanIds.has(entry.sourceLocalId),
          )) &&
        ageDays(entry.occurredAt, now) <= AGENT_RECENT_JOURNAL_DAYS,
    )
    .sort((left, right) => right.occurredAt - left.occurredAt)
    .map((entry) => {
      const entryAgeDays = ageDays(entry.occurredAt, now);
      return {
        sourceRef: {
          source: 'journal' as const,
          localId: entry.localId,
          label: safeAgentText(entry.label, 160) ?? 'Запись дневника',
          occurredAt: entry.occurredAt,
          ageDays: entryAgeDays,
          stale: false,
        },
        kind: entry.kind,
        label: safeAgentText(entry.label, 160) ?? '',
        value:
          safeAgentText(entry.textValue, 600) ??
          (entry.numericValue === undefined
            ? undefined
            : `${entry.numericValue}${entry.unit ? ` ${safeAgentText(entry.unit, 40)}` : ''}`),
      };
    });
  const journal = fitNewest(journalCandidates, 10_000);

  const labCandidates = snapshot.labResults
    .filter(
      (result) =>
        !result.deletedAt &&
        result.status !== 'unreviewed' &&
        result.collectedAt <= now,
    )
    .map((result) => ({
      sourceRef: {
        source: 'test' as const,
        localId: result.localId,
        label: safeAgentText(result.title, 160) ?? 'Результат анализа',
        occurredAt: result.collectedAt,
        ageDays: ageDays(result.collectedAt, now),
      },
      title: safeAgentText(result.title, 160) ?? '',
      collectedAt: result.collectedAt,
      values: result.analytes
        .slice(0, 20)
        .map((analyte) =>
          [
            safeAgentText(analyte.name, 100),
            safeAgentText(analyte.value, 100),
            safeAgentText(analyte.unit, 40),
            analyte.reference
              ? `(референс: ${safeAgentText(analyte.reference, 100)})`
              : undefined,
          ]
            .filter(Boolean)
            .join(' '),
        ),
    }));
  const scanCandidates = snapshot.scanResults
    .filter(
      (result) =>
        !result.deletedAt && result.confirmedByUser && result.capturedAt <= now,
    )
    .map((result) => {
      const title =
        safeAgentText(
          result.testSystemKey === 'ovulation-strip'
            ? 'Тест на овуляцию'
            : result.testSystemKey === 'pregnancy-strip'
              ? 'Тест на беременность'
              : result.testSystemKey,
          160,
        ) ?? 'Подтверждённый домашний тест';
      return {
        sourceRef: {
          source: 'test' as const,
          localId: result.localId,
          label: title,
          occurredAt: result.capturedAt,
          ageDays: ageDays(result.capturedAt, now),
        },
        title,
        collectedAt: result.capturedAt,
        values: [`Подтверждённый результат: ${result.confirmedValue}`],
      };
    });
  const tests = fitNewest(
    [...labCandidates, ...scanCandidates].sort(
      (left, right) => right.collectedAt - left.collectedAt,
    ),
    5_000,
  );

  const planCandidates = snapshot.carePlanItems
    .filter(
      (item) =>
        !item.deletedAt &&
        (item.status === 'current' || item.status === 'upcoming'),
    )
    .sort((left, right) => (left.dueAt ?? Infinity) - (right.dueAt ?? Infinity))
    .map((item) => ({
      sourceRef: {
        source: 'care-plan' as const,
        localId: item.localId,
        label: safeAgentText(item.title, 160) ?? 'Пункт плана',
        occurredAt: item.dueAt ?? item.updatedAt,
      },
      title: safeAgentText(item.title, 160) ?? '',
      status: item.status,
      dueAt: item.dueAt,
      provisional: item.provisional,
      safetyHold: Boolean(item.safetyHoldAt),
    }));
  const plan = fitNewest(planCandidates, 5_000);

  const lastSuccessfulRunAt = snapshot.preferences.find(
    (item) => !item.deletedAt,
  )?.agentLastSuccessfulRunAt;
  const planningCutoff = Math.max(
    now - AGENT_RECENT_JOURNAL_DAYS * DAY_MS,
    Math.min(lastSuccessfulRunAt ?? 0, now),
  );
  const assistantConversationIds = new Set(
    snapshot.chatConversations
      .filter(
        (conversation) =>
          !conversation.deletedAt && conversation.mode === 'assistant',
      )
      .map((conversation) => conversation.localId),
  );
  const planningSignalCandidates = options.includePlanningSignals
    ? [
        ...snapshot.chatMessages
          .filter(
            (message) =>
              !message.deletedAt &&
              message.role === 'user' &&
              assistantConversationIds.has(message.conversationLocalId) &&
              message.sentAt > planningCutoff &&
              message.sentAt <= now,
          )
          .map((message) => ({
            freshness: message.updatedAt,
            sourceRef: {
              source: 'chat' as const,
              localId: message.localId,
              label: 'Сообщение пользователя в Ассистенте',
              occurredAt: message.sentAt,
              unverified: true,
            },
            kind: 'assistant_chat' as const,
            label: 'Новые данные из режима «Ассистент»',
            value: safeAgentText(message.text, 700),
          })),
        ...snapshot.documents
          .filter(
            (document) =>
              !document.deletedAt &&
              document.updatedAt > planningCutoff &&
              document.documentDate <= now,
          )
          .map((document) => ({
            freshness: document.updatedAt,
            sourceRef: {
              source: 'document' as const,
              localId: document.localId,
              label: 'Метаданные нового документа',
              occurredAt: document.documentDate,
              unverified: true,
            },
            kind: 'document_metadata' as const,
            label: 'Новый документ без доступного содержимого',
            value: `Категория: ${document.category}`,
          })),
      ]
        .sort((left, right) => right.freshness - left.freshness)
        .map(({ freshness: _freshness, ...signal }) => signal)
    : [];
  const planningSignals = fitNewest(planningSignalCandidates, 4_000);

  const envelope: AgentContextEnvelope = {
    version: AGENT_CONTEXT_VERSION,
    generatedAt: now,
    profile: profile
      ? {
          ageYears: ageYears(profile.birthDate, now),
          goal: profile.goal,
          heightCm: options.includeBodyMetrics ? profile.heightCm : undefined,
          weightKg: options.includeBodyMetrics ? profile.weightKg : undefined,
          postpartum: profile.postpartum,
          postContraception: profile.postContraception,
          pregnancyWeeks:
            profile.pregnancyStartAt && profile.pregnancyStartAt <= now
              ? Math.max(
                  0,
                  Math.floor((now - profile.pregnancyStartAt) / (7 * DAY_MS)),
                )
              : undefined,
          lastPeriodAgeDays:
            profile.lastPeriodStartAt && profile.lastPeriodStartAt <= now
              ? ageDays(profile.lastPeriodStartAt, now)
              : undefined,
          cycleLengthDays: profile.cycleLengthDays,
          conditions,
          medications,
          allergies,
        }
      : undefined,
    recentJournal: journal.selected,
    confirmedTests: tests.selected,
    carePlan: plan.selected,
    planningSignals: planningSignals.selected,
    omitted: {
      profile:
        Math.max(0, activeConditions.length - conditions.length) +
        Math.max(0, activeMedications.length - medications.length) +
        Math.max(0, activeAllergies.length - allergies.length),
      journal: journal.omitted,
      tests: tests.omitted,
      carePlan: plan.omitted,
      planningSignals: planningSignals.omitted,
    },
  };

  while (JSON.stringify(envelope).length > AGENT_CONTEXT_MAX_CHARS) {
    if (envelope.planningSignals.length) {
      envelope.planningSignals.pop();
      envelope.omitted.planningSignals += 1;
    } else if (envelope.recentJournal.length > 1) {
      envelope.recentJournal.pop();
      envelope.omitted.journal += 1;
    } else if (envelope.confirmedTests.length > 1) {
      envelope.confirmedTests.pop();
      envelope.omitted.tests += 1;
    } else if (envelope.carePlan.length > 1) {
      envelope.carePlan.pop();
      envelope.omitted.carePlan += 1;
    } else {
      const profileLists = envelope.profile
        ? [
            envelope.profile.conditions,
            envelope.profile.medications,
            envelope.profile.allergies,
          ].sort((left, right) => right.length - left.length)
        : [];
      if (!profileLists[0]?.length) break;
      profileLists[0].pop();
      envelope.omitted.profile += 1;
    }
  }
  return envelope;
}
