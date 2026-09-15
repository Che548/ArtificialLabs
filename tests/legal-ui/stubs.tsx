import type { PropsWithChildren } from 'react';
import { Pressable, Text, View } from 'react-native';
export const useSafeAreaInsets = () => ({ top: 0, bottom: 0, left: 0, right: 0 });
export const useAuthActions = () => ({ signIn: async () => { throw new Error('Live auth is disabled in this fixture'); } });
export const useAction = () => async () => { throw new Error('Live actions are disabled in this fixture'); };
export const useConnectivity = () => ({ isOffline: false, isKnown: true });
export const StatusBar = () => null;
export const SymbolView = ({ fallback }: { fallback: React.ReactNode }) => fallback;
export const BrandLogo = () => <Text>сфера.</Text>;
export const AppText = ({ children, style, color }: PropsWithChildren<{style?: any; color?: string; [key: string]: any}>) => <Text style={[{ color }, style]}>{children}</Text>;
export const SegmentedSwitcher = ({ options, onChange, style }: any) => <View style={style}>{options.map((o: any) => <Pressable key={o.value} onPress={() => onChange(o.value)}><Text>{o.label}</Text></Pressable>)}</View>;
export const listenForSmsOtp = () => () => {};
export const startSmsRetriever = async () => {};
export default { getItemSync: () => null, setItemSync: () => {} };

export const useUpdateManager = () => ({ required: false, status: 'idle' });

export const getRandomBytes = (length: number) => new Uint8Array(length);
export const rememberRegistrationConsent = async () => {};
export const clearRegistrationConsent = async () => {};
