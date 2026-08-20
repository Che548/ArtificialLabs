import type { ChatConversation, ChatMessage } from './health-types';

export function createChatTombstones(
  conversation: ChatConversation,
  messages: ChatMessage[],
  deletedAt = Date.now(),
) {
  return {
    conversation: { ...conversation, deletedAt, updatedAt: deletedAt },
    messages: messages.map((message) => ({
      ...message,
      deletedAt,
      updatedAt: deletedAt,
    })),
  };
}
