import { getFunctionName } from 'convex/server';
export const calls: string[] = [];
export function useAction(ref: any) {
  return async (args: any) => {
    const name = getFunctionName(ref);
    calls.push(name);
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (name === 'phoneRegistration:confirm') {
      if (args.code !== '123456') throw new Error('CONTACT_INVALID_CODE');
      return { verified: true };
    }
    if (args.currentPassword === 'NetworkFailure123!')
      throw new Error('Network request failed');
    if (
      name === 'emailChange:request' &&
      args.currentPassword !== 'FixturePassword123!'
    )
      throw new Error('EMAIL_CHANGE_INVALID_PASSWORD');
    if (name === 'emailChange:confirm') {
      if (args.code !== '123456') throw new Error('EMAIL_CHANGE_INVALID_CODE');
      return { changed: true };
    }
    return {
      challengeId: 'fixture',
      expiresAt: Date.now() + 600000,
      retryAt: Date.now() + 60000,
    };
  };
}
