import type { HealthEntityName, LocalProfile } from './health-types';
import { sanitizeCloudRecord } from './cloud-sync';
import { portableProfile } from '../shared/profile-merge';

export type SyncConflictSelection = {
  entity: HealthEntityName | 'profile';
  local: Record<string, unknown>;
  remote: Record<string, unknown>;
  ownerId: string;
};

export function conflictValue(entity: SyncConflictSelection['entity'], value: Record<string, unknown>) {
  return entity === 'profile' ? portableProfile(value) : sanitizeCloudRecord(entity, value);
}

export function sameConflictValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => sameConflictValue(v, b[i]));
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every(key => sameConflictValue(left[key], right[key]));
}

export function hasRecordConflict(local: Record<string, unknown>, remote: Record<string, unknown>) {
  const { syncRevision: a, updatedAt: at, ...left } = local;
  const { syncRevision: b, updatedAt: bt, ...right } = remote;
  return !sameConflictValue(left, right) && (Boolean(remote.deletedAt) || (a ?? 0) !== (b ?? 0) || Number(at) <= Number(bt));
}

export function resolvedProfile(selection: SyncConflictSelection, choice: 'local' | 'remote'): LocalProfile {
  return { ...portableProfile(choice === 'local' ? selection.local : selection.remote),
    updatedAt: choice === 'local' ? Date.now() : selection.remote.updatedAt } as LocalProfile;
}

export function preserveConflictSources(selected: Record<string, unknown>, original: Record<string, unknown>) {
  const result = { ...selected };
  for (const key of ['localImageUri', 'localDocumentUri', 'localFileUri']) if (original[key]) result[key] = original[key];
  if (Array.isArray(selected.attachments) && Array.isArray(original.attachments)) {
    const local = new Map(original.attachments.map((item: Record<string, unknown>) => [item.localId, item]));
    result.attachments = selected.attachments.map((item: Record<string, unknown>) => {
      const source = local.get(item.localId);
      return source?.localUri ? { ...item, localUri: source.localUri, availableLocally: true } : item;
    });
  }
  return result;
}
