import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { Authenticated, AuthLoading, Unauthenticated } from 'convex/react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';

import '../global.css';
import { AppGate } from '../components/AppGate';
import { AuthScreen } from '../components/AuthScreen';
import { convex } from '../lib/convex';
import { HealthStoreProvider } from '../lib/health-store';
import { authTokenStorage } from '../lib/secure-storage';

const activeTint = '#D31471';
const inactiveTint = '#9A9593';

function Tabs() {
  return (
    <NativeTabs
      tintColor={activeTint}
      iconColor={{ default: inactiveTint, selected: activeTint }}
      labelStyle={{
        default: { color: inactiveTint, fontSize: 10 },
        selected: { color: activeTint, fontSize: 10, fontWeight: '600' },
      }}
      minimizeBehavior="never"
    >
      <NativeTabs.Trigger name="chat">
        <NativeTabs.Trigger.Label>Чат</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{
            default: 'bubble.left.and.bubble.right',
            selected: 'bubble.left.and.bubble.right.fill',
          }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="analyses">
        <NativeTabs.Trigger.Label>Анализы</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'cross.case', selected: 'cross.case.fill' }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Сегодня</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{
            default: 'heart.text.clipboard',
            selected: 'heart.text.clipboard.fill',
          }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="scan">
        <NativeTabs.Trigger.Label>Скан</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'viewfinder', selected: 'viewfinder' }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Профиль</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{
            default: 'person.crop.circle',
            selected: 'person.crop.circle.fill',
          }}
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function LoadingAuth() {
  return (
    <View className="flex-1 items-center justify-center bg-surface-canvas">
      <ActivityIndicator color={activeTint} />
    </View>
  );
}

export default function TabLayout() {
  const webDemo = Platform.OS === 'web';
  return (
    <ConvexAuthProvider
      client={convex}
      storage={webDemo ? undefined : authTokenStorage}
      shouldHandleCode={false}
    >
      {webDemo ? (
        <HealthStoreProvider mode="demo">
          <AppGate allowEmptyProfile>
            <View className="flex-1">
              <Tabs />
              <View
                pointerEvents="none"
                className="absolute left-3 right-3 top-3 z-50 items-center rounded-full bg-ink/90 px-4 py-2"
              >
                <Text className="font-sf-medium text-[12px] text-white">
                  Web demo · медицинские данные не сохраняются
                </Text>
              </View>
            </View>
          </AppGate>
        </HealthStoreProvider>
      ) : (
        <>
          <AuthLoading>
            <LoadingAuth />
          </AuthLoading>
          <Unauthenticated>
            <AuthScreen />
          </Unauthenticated>
          <Authenticated>
            <HealthStoreProvider>
              <AppGate>
                <Tabs />
              </AppGate>
            </HealthStoreProvider>
          </Authenticated>
        </>
      )}
    </ConvexAuthProvider>
  );
}
