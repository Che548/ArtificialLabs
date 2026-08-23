import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildChatTranscript,
  CHAT_CONTEXT_MAX_CHARACTERS,
  CHAT_CONTEXT_MAX_MESSAGES,
  chatTimestampIsInPeriod,
  findUnansweredUserMessage,
} from './chat-context';
import type { ChatMessage } from './health-types';

function message(
  index: number,
  role: ChatMessage['role'],
  text = `${role}-${index}`,
  overrides: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    localId: `message-${index}`,
    conversationLocalId: 'conversation-1',
    role,
    source: role === 'user' ? 'user' : 'model',
    text,
    sentAt: index,
    attachments: [],
    updatedAt: index,
    ...overrides,
  };
}

test('buildChatTranscript orders visible text and always ends with the latest user message', () => {
  const latest = message(4, 'user', 'latest');
  const transcript = buildChatTranscript(
    [
      message(3, 'assistant', 'assistant-3', {
        attachments: [
          {
            localId: 'attachment-1',
            kind: 'document',
            name: 'private.pdf',
            localUri: 'file:///private/private.pdf',
            availableLocally: true,
          },
        ],
      }),
      message(1, 'user'),
      message(2, 'assistant', 'deleted', { deletedAt: 3 }),
      message(5, 'assistant', 'other chat', {
        conversationLocalId: 'conversation-2',
      }),
    ],
    'conversation-1',
    latest,
  );

  assert.deepEqual(transcript, [
    { role: 'user', content: 'user-1' },
    { role: 'assistant', content: 'assistant-3' },
    { role: 'user', content: 'latest' },
  ]);
});

test('buildChatTranscript caps messages and characters without removing the latest user text', () => {
  const historical = Array.from({ length: 30 }, (_, index) =>
    message(index, index % 2 ? 'assistant' : 'user', 'x'.repeat(1_200)),
  );
  const latest = message(31, 'user', 'latest');
  const transcript = buildChatTranscript(historical, 'conversation-1', latest);

  assert.ok(transcript.length <= CHAT_CONTEXT_MAX_MESSAGES);
  assert.ok(
    transcript.reduce((total, item) => total + item.content.length, 0) <=
      CHAT_CONTEXT_MAX_CHARACTERS,
  );
  assert.deepEqual(transcript.at(-1), { role: 'user', content: 'latest' });
});

test('findUnansweredUserMessage recognizes a conversation ending in a user turn', () => {
  const user = message(2, 'user');
  assert.equal(
    findUnansweredUserMessage([message(1, 'assistant'), user], 'conversation-1')
      ?.localId,
    user.localId,
  );
  assert.equal(
    findUnansweredUserMessage(
      [message(1, 'user'), message(2, 'assistant')],
      'conversation-1',
    ),
    undefined,
  );
});

test('chat history periods use local calendar boundaries', () => {
  const now = new Date(2026, 7, 23, 18).getTime();
  assert.equal(
    chatTimestampIsInPeriod(new Date(2026, 7, 23, 0).getTime(), 'today', now),
    true,
  );
  assert.equal(
    chatTimestampIsInPeriod(
      new Date(2026, 7, 22, 23, 59).getTime(),
      'today',
      now,
    ),
    false,
  );
  assert.equal(
    chatTimestampIsInPeriod(new Date(2026, 7, 17, 0).getTime(), '7-days', now),
    true,
  );
  assert.equal(
    chatTimestampIsInPeriod(
      new Date(2026, 7, 16, 23, 59).getTime(),
      '7-days',
      now,
    ),
    false,
  );
  assert.equal(chatTimestampIsInPeriod(0, 'all', now), true);
});
