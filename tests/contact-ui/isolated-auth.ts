export const useConnectivity = () => ({ isOffline: false });
export const useUpdateManager = () => ({
  state: 'idle',
  isRestartBlocked: false,
  checkNow: async () => {},
  restart: async () => false,
});
export const getRandomBytes = (count: number) =>
  crypto.getRandomValues(new Uint8Array(count));
export const StatusBar = () => null;
