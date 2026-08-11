// @refresh reset

import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useConvexAuth } from 'convex/react';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';

import '../global.css';
import { AppGate } from '../components/AppGate';
import { AuthScreen } from '../components/AuthScreen';
import { convex } from '../lib/convex';
import { HealthStoreProvider } from '../lib/health-store';
import { authTokenStorage } from '../lib/secure-storage';

const activeTint = '#D31471';
const inactiveTint = '#736E6C';

function Tabs() {
  return (
    <ThemeProvider value={DefaultTheme}>
      <NativeTabs
        tintColor={activeTint}
        iconColor={{ default: inactiveTint, selected: activeTint }}
        backgroundColor="rgba(255,255,255,0.20)"
        blurEffect="systemUltraThinMaterialLight"
        shadowColor="rgba(0,0,0,0.18)"
        disableTransparentOnScrollEdge
        labelStyle={{
          default: { color: inactiveTint, fontSize: 10 },
          selected: { color: activeTint, fontSize: 10, fontWeight: '600' },
        }}
        minimizeBehavior="never"
      >
        <NativeTabs.Trigger name="chat">
          <Label>Сферка</Label>
          <Icon
            sf={{
              default: 'waveform.and.person.filled',
              selected: 'waveform.and.person.filled',
            }}
          />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="analyses">
          <Label>Анализы</Label>
          <Icon sf={{ default: 'stethoscope', selected: 'stethoscope' }} />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="index">
          <Label>Сегодня</Label>
          <Icon
            sf={{
              default: 'heart.circle',
              selected: 'heart.circle.fill',
            }}
          />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="scan">
          <Label>Скан</Label>
          <Icon sf={{ default: 'viewfinder', selected: 'viewfinder' }} />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="profile">
          <Label>Профиль</Label>
          <Icon
            sf={{
              default: 'person.crop.circle',
              selected: 'person.crop.circle.fill',
            }}
          />
        </NativeTabs.Trigger>
      </NativeTabs>
    </ThemeProvider>
  );
}

function LoadingAuth() {
  return (
    <View className="flex-1 items-center justify-center bg-surface-canvas">
      <ActivityIndicator color={activeTint} />
    </View>
  );
}

function WebDemo() {
  const [registrationComplete, setRegistrationComplete] = useState(false);

  if (!registrationComplete) {
    return (
      <AuthScreen
        preview
        onPreviewComplete={() => setRegistrationComplete(true)}
      />
    );
  }

  return (
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
  );
}

function NativeApp() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [devMode, setDevMode] = useState(false);

  if (devMode) {
    return (
      <HealthStoreProvider mode="local">
        <AppGate allowEmptyProfile>
          <Tabs />
        </AppGate>
      </HealthStoreProvider>
    );
  }

  if (isLoading) {
    return <LoadingAuth />;
  }

  if (!isAuthenticated) {
    return (
      <AuthScreen
        onAuthenticated={() => setRegistrationComplete(true)}
        onDevLogin={() => setDevMode(true)}
      />
    );
  }

  if (!registrationComplete) {
    return (
      <AuthScreen
        preview
        onDevLogin={() => setRegistrationComplete(true)}
        onPreviewComplete={() => setRegistrationComplete(true)}
      />
    );
  }

  return (
    <HealthStoreProvider>
      <AppGate>
        <Tabs />
      </AppGate>
    </HealthStoreProvider>
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
      <StatusBar style="dark" hidden={false} />
      {webDemo ? <WebDemo /> : <NativeApp />}
    </ConvexAuthProvider>
  );
}
