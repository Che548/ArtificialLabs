export function useAuthActions() {
  return {
    signIn: async (_provider: string, args: any) => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (args.code !== '123456') throw new Error('CONTACT_INVALID_CODE');
      return { signingIn: true };
    },
  };
}
