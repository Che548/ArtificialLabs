import type { Reminder } from './health-types';

export function assistantMessagesChronologically(reminders: readonly Reminder[]) {
  return [...reminders].sort((a, b) => a.dueAt - b.dueAt || a.localId.localeCompare(b.localId));
}

export function assistantFeedAtEnd(offset: number, viewport: number, content: number) {
  return viewport > 0 && content > 0 && content - viewport - Math.max(0, offset) <= 24;
}

/** A read-through receipt covers only the delivered snapshot actually shown in the feed. */
export function assistantReadCandidates(reminders: readonly Reminder[], deliveredIds: ReadonlySet<string>, now: number) {
  return reminders.filter((reminder) => deliveredIds.has(reminder.localId)
    && !reminder.readAt && !reminder.deletedAt && reminder.dueAt <= now);
}
