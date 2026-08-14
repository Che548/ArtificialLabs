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
const androidTabBackground = '#FFF5F1';
const androidTabIndicator = '#F7DDEA';

const tabIcons = {
  chat: {
    default: require('../assets/tab-icons/chat.png'),
    selected: require('../assets/tab-icons/chat_selected.png'),
  },
  analyses: {
    default: require('../assets/tab-icons/analyses.png'),
    selected: require('../assets/tab-icons/analyses_selected.png'),
  },
  today: {
    default: require('../assets/tab-icons/today.png'),
    selected: require('../assets/tab-icons/today_selected.png'),
  },
  scan: {
    default: require('../assets/tab-icons/scan.png'),
    selected: require('../assets/tab-icons/scan_selected.png'),
  },
  profile: {
    default: require('../assets/tab-icons/profile.png'),
    selected: require('../assets/tab-icons/profile_selected.png'),
  },
} as const;

function Tabs() {
  return (
    <ThemeProvider value={DefaultTheme}>
      <NativeTabs
        tintColor={activeTint}
        iconColor={{ default: inactiveTint, selected: activeTint }}
        backgroundColor={
          Platform.OS === 'android'
            ? androidTabBackground
            : 'rgba(255,255,255,0.20)'
        }
        blurEffect="systemUltraThinMaterialLight"
        shadowColor="rgba(0,0,0,0.18)"
        indicatorColor={androidTabIndicator}
        labelVisibilityMode={Platform.OS === 'android' ? 'labeled' : undefined}
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
            androidSrc={tabIcons.chat}
          />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="analyses">
          <Label>Анализы</Label>
          <Icon
            sf={{ default: 'stethoscope', selected: 'stethoscope' }}
            androidSrc={tabIcons.analyses}
          />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="index">
          <Label>Сегодня</Label>
          <Icon
            sf={{
              default: 'heart.circle',
              selected: 'heart.circle.fill',
            }}
            androidSrc={tabIcons.today}
          />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="scan">
          <Label>Скан</Label>
          <Icon
            sf={{ default: 'viewfinder', selected: 'viewfinder' }}
            androidSrc={tabIcons.scan}
          />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="profile">
          <Label>Профиль</Label>
          <Icon
            sf={{
              default: 'person.crop.circle',
              selected: 'person.crop.circle.fill',
            }}
            androidSrc={tabIcons.profile}
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
        onDevLogin={() => setDevMode(true)}
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
