/** Synchronous lock shared by taps, keyboard submissions and async consent. */
export async function submitConsentOnce(
  lock: { current: boolean },
  save: () => Promise<unknown>,
  continueRequest: () => void,
) {
  if (lock.current) return false;
  lock.current = true;
  try {
    await save();
    continueRequest();
    return true;
  } finally {
    lock.current = false;
  }
}
