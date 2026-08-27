import * as SecureStore from 'expo-secure-store';
import * as Updates from 'expo-updates';
import { usePathname } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PropsWithChildren } from 'react';
import {
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type UpdateChannel = 'preview' | 'production';
export type UpdateState =
  | 'disabled'
  | 'checking'
  | 'downloading'
  | 'ready'
  | 'current'
  | 'error';

type UpdateManagerValue = {
  channel: UpdateChannel;
  state: UpdateState;
  safeErrorCode?: string;
  isRestartBlocked: boolean;
  checkNow: () => Promise<boolean>;
  restart: () => Promise<boolean>;
  setChannel: (channel: UpdateChannel) => Promise<boolean>;
};

const CHANNEL_SETTING = 'artificiallabs.ota-channel.v1';
const UpdateManagerContext = createContext<UpdateManagerValue | undefined>(
  undefined,
);

function safeUpdateError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('disabled') || message.includes('development'))
    return 'UPDATES_DISABLED';
  if (message.includes('timeout')) return 'UPDATES_TIMEOUT';
  if (message.includes('network') || message.includes('connect'))
    return 'UPDATES_OFFLINE';
  if (message.includes('runtime')) return 'UPDATES_INCOMPATIBLE';
  return 'UPDATES_FAILED';
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs = 10_000) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('UPDATES_TIMEOUT')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function UpdateManagerProvider({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const [channel, setChannelState] = useState<UpdateChannel>('production');
  const [state, setState] = useState<UpdateState>(
    Platform.OS === 'web' || !Updates.isEnabled ? 'disabled' : 'current',
  );
  const [safeErrorCode, setSafeErrorCode] = useState<string>();
  const checking = useRef<Promise<boolean> | undefined>(undefined);
  const isRestartBlocked = pathname === '/scan' || pathname.startsWith('/scan/');

  const applyChannel = useCallback((next: UpdateChannel) => {
    if (Updates.isEnabled && !__DEV__) {
      Updates.setUpdateRequestHeadersOverride({ 'expo-channel-name': next });
    }
    setChannelState(next);
  }, []);

  const checkNow = useCallback(() => {
    if (Platform.OS === 'web' || !Updates.isEnabled || __DEV__) {
      setState('disabled');
      return Promise.resolve(false);
    }
    if (checking.current) return checking.current;
    const operation = (async () => {
      setSafeErrorCode(undefined);
      setState('checking');
      try {
        const result = await withTimeout(Updates.checkForUpdateAsync());
        if (!result.isAvailable) {
          setState('current');
          return false;
        }
        setState('downloading');
        const fetched = await withTimeout(Updates.fetchUpdateAsync(), 60_000);
        const ready = 'isNew' in fetched ? fetched.isNew : true;
        setState(ready ? 'ready' : 'current');
        return ready;
      } catch (error) {
        setSafeErrorCode(safeUpdateError(error));
        setState('error');
        return false;
      } finally {
        checking.current = undefined;
      }
    })();
    checking.current = operation;
    return operation;
  }, []);

  const setChannel = useCallback(
    async (next: UpdateChannel) => {
      try {
        await SecureStore.setItemAsync(CHANNEL_SETTING, next);
      } catch {
        setSafeErrorCode('UPDATES_CHANNEL_NOT_SAVED');
      }
      applyChannel(next);
      return checkNow();
    },
    [applyChannel, checkNow],
  );

  const restart = useCallback(async () => {
    if (state !== 'ready' || isRestartBlocked) return false;
    await Updates.reloadAsync();
    return true;
  }, [isRestartBlocked, state]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void (async () => {
      let stored: string | null = null;
      try {
        stored = await SecureStore.getItemAsync(CHANNEL_SETTING);
      } catch {
        setSafeErrorCode('UPDATES_CHANNEL_NOT_LOADED');
      }
      const next = stored === 'preview' ? 'preview' : 'production';
      applyChannel(next);
      void checkNow();
    })();
  }, [applyChannel, checkNow]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void checkNow();
    });
    return () => subscription.remove();
  }, [checkNow]);

  const value = useMemo(
    () => ({
      channel,
      state,
      safeErrorCode,
      isRestartBlocked,
      checkNow,
      restart,
      setChannel,
    }),
    [channel, checkNow, isRestartBlocked, restart, safeErrorCode, setChannel, state],
  );

  return (
    <UpdateManagerContext.Provider value={value}>
      {children}
      <UpdateReadyBanner />
    </UpdateManagerContext.Provider>
  );
}

export function useUpdateManager() {
  const value = useContext(UpdateManagerContext);
  if (!value) throw new Error('UpdateManagerProvider is missing');
  return value;
}

function UpdateReadyBanner() {
  const manager = useUpdateManager();
  const insets = useSafeAreaInsets();
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (manager.state === 'ready') setDismissed(false);
  }, [manager.state]);
  if (manager.state !== 'ready' || dismissed || Platform.OS === 'web') return null;
  return (
    <View style={[styles.banner, { bottom: Math.max(insets.bottom, 12) + 76 }]}>
      <View style={styles.copy}>
        <Text style={styles.title}>Обновление готово</Text>
        <Text style={styles.message}>
          {manager.isRestartBlocked
            ? 'Завершите текущую операцию, затем перезапустите приложение.'
            : 'Можно применить сейчас или при следующем холодном запуске.'}
        </Text>
      </View>
      <Pressable onPress={() => setDismissed(true)} style={styles.secondary}>
        <Text style={styles.secondaryText}>Позже</Text>
      </Pressable>
      <Pressable
        disabled={manager.isRestartBlocked}
        onPress={() => void manager.restart()}
        style={[styles.primary, manager.isRestartBlocked && styles.disabled]}
      >
        <Text style={styles.primaryText}>Перезапустить</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    zIndex: 1100,
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(234,64,135,0.24)',
    backgroundColor: 'rgba(255,250,252,0.98)',
    padding: 12,
    shadowColor: '#2F151B',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  copy: { flex: 1, minWidth: 0 },
  title: { color: '#2F292C', fontFamily: 'SFProDisplay-Semibold', fontSize: 13 },
  message: { color: '#736E6C', fontFamily: 'SFProDisplay-Regular', fontSize: 11, lineHeight: 14 },
  secondary: { paddingHorizontal: 8, paddingVertical: 8 },
  secondaryText: { color: '#736E6C', fontFamily: 'SFProDisplay-Medium', fontSize: 12 },
  primary: { borderRadius: 14, backgroundColor: '#EA4087', paddingHorizontal: 12, paddingVertical: 9 },
  primaryText: { color: '#FFFFFF', fontFamily: 'SFProDisplay-Semibold', fontSize: 12 },
  disabled: { opacity: 0.45 },
});
