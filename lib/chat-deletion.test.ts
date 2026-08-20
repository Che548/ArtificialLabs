import assert from 'node:assert/strict';
import test from 'node:test';

import { createChatTombstones } from './chat-deletion';
import type { ChatConversation, ChatMessage } from './health-types';

test('conversation deletion creates one atomic timestamp for the chat and every message', () => {
  const conversation: ChatConversation = {
    localId: 'conversation-1',
    title: 'Чат',
    createdAt: 1,
    lastMessageAt: 2,
    updatedAt: 2,
  };
  const messages: ChatMessage[] = [
    {
      localId: 'message-1',
      conversationLocalId: conversation.localId,
      role: 'user',
      source: 'user',
      text: 'Текст',
      sentAt: 2,
      attachments: [],
      updatedAt: 2,
    },
  ];

  const tombstones = createChatTombstones(conversation, messages, 100);
  assert.equal(tombstones.conversation.deletedAt, 100);
  assert.equal(tombstones.conversation.updatedAt, 100);
  assert.equal(tombstones.messages[0]?.deletedAt, 100);
  assert.equal(tombstones.messages[0]?.updatedAt, 100);
});
