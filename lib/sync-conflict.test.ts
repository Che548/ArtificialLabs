import { expect, test } from 'vitest';
import { conflictValue, hasRecordConflict, preserveConflictSources, sameConflictValue } from './sync-conflict';

test('review equality is order independent and detects nested edits', () => {
  expect(sameConflictValue({ a: 1, b: undefined }, { a: 1 })).toBe(true);
  expect(sameConflictValue({ a: 1, b: [2] }, { b: [2], a: 1 })).toBe(true);
  expect(sameConflictValue({ a: [1] }, { a: [2] })).toBe(false);
});
test('review excludes local source paths and detects revisions, deletion and clock ties', () => {
  const local = { localId: 'qa', label: 'A', updatedAt: 10, syncRevision: 1 };
  expect(conflictValue('journalEntries', { ...local, localImageUri: '/private/qa' })).not.toHaveProperty('localImageUri');
  expect(hasRecordConflict(local, { ...local, syncRevision: 2 })).toBe(false);
  expect(hasRecordConflict(local, { ...local, label: 'B', syncRevision: 2 })).toBe(true);
  expect(hasRecordConflict(local, { ...local, deletedAt: 9 })).toBe(true);
  expect(hasRecordConflict(local, { ...local, label: 'B' })).toBe(true);
  expect(hasRecordConflict({ ...local, updatedAt: 11 }, { ...local, label: 'B' })).toBe(false);
});

test('choosing remote keeps matching local attachment files without inventing missing ones', () => {
  const selected = { attachments: [{ localId: 'present', caption: 'Remote caption' }, { localId: 'missing' }] };
  const original = { localFileUri: 'file:///synthetic', attachments: [{ localId: 'present', localUri: 'file:///synthetic-attachment', caption: 'Old caption' }] };
  expect(preserveConflictSources(selected, original)).toEqual({ localFileUri: original.localFileUri, attachments: [
    { localId: 'present', caption: 'Remote caption', localUri: 'file:///synthetic-attachment', availableLocally: true }, { localId: 'missing' },
  ] });
  expect(selected.attachments[0]).not.toHaveProperty('localUri');
  const cloud = conflictValue('chatMessages', preserveConflictSources(selected, original));
  expect(JSON.stringify(cloud)).not.toContain('file:///');
});
