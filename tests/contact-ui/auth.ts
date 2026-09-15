export function useAuthActions() {
  return {
    signIn: async (_provider: string, args: any) => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (_provider === 'phone-password' && args.flow === 'signUp') {
        if (args.password === 'NetworkFailure123!') throw new Error('Network request failed');
        return { signingIn: true };
      }
      if (args.code !== '123456') throw new Error('CONTACT_INVALID_CODE');
      return { signingIn: true };
    },
  };
}
