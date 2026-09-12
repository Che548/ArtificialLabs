/** A missing preference belongs to an active account, never to the previous user. */
export function localAccountDeletionState(deadline: number | undefined, now: number) {
  const valid = typeof deadline === 'number' && Number.isFinite(deadline) && deadline > 0;
  const expired = valid && deadline <= now;
  return {
    expired,
    pending: valid && !expired,
    deadline: valid && !expired ? deadline : undefined,
  };
}
