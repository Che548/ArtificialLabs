import type { ChatMessage } from './health-types';

export const CHAT_CONTEXT_MAX_MESSAGES = 20;
export const CHAT_CONTEXT_MAX_CHARACTERS = 24_000;
export const CHAT_CONTEXT_MAX_MESSAGE_CHARACTERS = 8_000;

export type ChatHistoryPeriod = '7-days' | 'all' | 'today';

export function chatTimestampIsInPeriod(
  timestamp: number,
  period: ChatHistoryPeriod,
  now = Date.now(),
) {
  if (period === 'all') return true;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (period === '7-days') start.setDate(start.getDate() - 6);
  return timestamp >= start.getTime() && timestamp <= now;
}

export type ChatTranscriptMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export function buildChatTranscript(
  messages: ChatMessage[],
  conversationLocalId: string,
  latestUserMessage: ChatMessage,
): ChatTranscriptMessage[] {
  const ordered = messages
    .filter(
      (message) =>
        !message.deletedAt &&
        message.conversationLocalId === conversationLocalId &&
        message.localId !== latestUserMessage.localId &&
        message.text.trim().length > 0 &&
        message.text.length <= CHAT_CONTEXT_MAX_MESSAGE_CHARACTERS,
    )
    .sort((left, right) =>
      left.sentAt === right.sentAt
        ? left.localId.localeCompare(right.localId)
        : left.sentAt - right.sentAt,
    );

  const latestText = latestUserMessage.text.slice(
    0,
    CHAT_CONTEXT_MAX_MESSAGE_CHARACTERS,
  );
  const candidates = [
    ...ordered,
    { ...latestUserMessage, role: 'user' as const, text: latestText },
  ];
  const selected: ChatTranscriptMessage[] = [];
  let characterCount = 0;

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index];
    if (!candidate) continue;
    if (selected.length >= CHAT_CONTEXT_MAX_MESSAGES) break;
    if (
      selected.length > 0 &&
      characterCount + candidate.text.length > CHAT_CONTEXT_MAX_CHARACTERS
    ) {
      continue;
    }
    selected.push({ role: candidate.role, content: candidate.text });
    characterCount += candidate.text.length;
  }

  return selected.reverse();
}

export function findUnansweredUserMessage(
  messages: ChatMessage[],
  conversationLocalId: string,
) {
  const activeMessages = messages
    .filter(
      (message) =>
        !message.deletedAt &&
        message.conversationLocalId === conversationLocalId,
    )
    .sort((left, right) =>
      left.sentAt === right.sentAt
        ? left.localId.localeCompare(right.localId)
        : left.sentAt - right.sentAt,
    );
  const latest = activeMessages.at(-1);
  return latest?.role === 'user' ? latest : undefined;
}
