import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useConvexAuth } from 'convex/react';
import { useFonts } from 'expo-font';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs as RouterTabs } from 'expo-router';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import '../global.css';
import { AppGate } from '../components/AppGate';
import { AuthScreen } from '../components/AuthScreen';
import { convex } from '../lib/convex';
import { HealthStoreProvider } from '../lib/health-store';
import { authTokenStorage } from '../lib/secure-storage';
import {
  androidMaterials,
  androidTabBarBaseStyle,
} from '../design-system/tokens';
import AndroidAnalysisIcon from '../assets/android-icons/analysis.svg';
import AndroidChatIcon from '../assets/android-icons/chat.svg';
import AndroidProfileIcon from '../assets/android-icons/profile.svg';
import AndroidScanIcon from '../assets/android-icons/scan.svg';
import AndroidTodayIcon from '../assets/android-icons/today.svg';
import AndroidActiveAnalysisIcon from '../assets/android-icons/active/analysis.svg';
import AndroidActiveChatIcon from '../assets/android-icons/active/chat.svg';
import AndroidActiveProfileIcon from '../assets/android-icons/active/profile.svg';
import AndroidActiveScanIcon from '../assets/android-icons/active/scan.svg';
import AndroidActiveTodayIcon from '../assets/android-icons/active/today.svg';

const activeTint = '#EA4087';
const activeCapsuleTint = '#FBE7F0';
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

function IOSNativeTabs() {
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

const androidTabIcons = {
  chat: AndroidChatIcon,
  analyses: AndroidAnalysisIcon,
  index: AndroidTodayIcon,
  scan: AndroidScanIcon,
  profile: AndroidProfileIcon,
} as const;

const androidActiveTabIcons = {
  chat: AndroidActiveChatIcon,
  analyses: AndroidActiveAnalysisIcon,
  index: AndroidActiveTodayIcon,
  scan: AndroidActiveScanIcon,
  profile: AndroidActiveProfileIcon,
} as const;

function AndroidTabIcon({
  focused,
  route,
}: {
  focused: boolean;
  route: keyof typeof androidTabIcons;
}) {
  const TabIcon = focused
    ? androidActiveTabIcons[route]
    : androidTabIcons[route];

  return <TabIcon width={24} height={24} />;
}

function AndroidTabLabel({ focused, label }: { focused: boolean; label: string }) {
  const progress = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: focused ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [focused, progress]);

  return (
    <View style={styles.androidLabelSlot}>
      <Animated.Text
        numberOfLines={1}
        style={[
          styles.androidTabLabel,
          styles.androidTabLabelInactive,
          { opacity: Animated.subtract(1, progress) },
        ]}
      >
        {label}
      </Animated.Text>
      <Animated.Text
        numberOfLines={1}
        style={[
          styles.androidTabLabel,
          styles.androidTabLabelActive,
          { opacity: progress },
        ]}
      >
        {label}
      </Animated.Text>
    </View>
  );
}

type AndroidTabButtonProps = Omit<
  React.ComponentProps<typeof Pressable>,
  'children' | 'ref'
> & {
  children?: ReactNode;
};

function AndroidTabButton({
  accessibilityLabel,
  accessibilityState,
  children,
  style,
  ...pressableProps
}: AndroidTabButtonProps) {
  const selected = Boolean(accessibilityState?.selected);
  const edgeOffset =
    accessibilityLabel === 'Сферка'
      ? 7
      : accessibilityLabel === 'Профиль'
        ? -7
        : 0;
  const progress = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: selected ? 1 : 0,
      duration: 210,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress, selected]);

  return (
    <Pressable
      {...pressableProps}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      style={style}
    >
      <View
        pointerEvents="none"
        style={[
          styles.androidTabButtonContent,
          { transform: [{ translateX: edgeOffset }] },
        ]}
      >
        <Animated.View
          style={[
            styles.androidActiveTabSurface,
            {
              opacity: progress,
              transform: [
                {
                  scale: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.92, 1],
                  }),
                },
              ],
            },
          ]}
        />
        {children}
      </View>
    </Pressable>
  );
}

function AndroidTabs() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 8);

  return (
    <ThemeProvider value={DefaultTheme}>
      <RouterTabs
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          transitionSpec: {
            animation: 'timing',
            config: {
              duration: 220,
              easing: Easing.out(Easing.cubic),
            },
          },
          tabBarActiveTintColor: activeTint,
          tabBarInactiveTintColor: inactiveTint,
          tabBarActiveBackgroundColor: activeCapsuleTint,
          tabBarHideOnKeyboard: true,
          tabBarLabelPosition: 'below-icon',
          tabBarStyle: [
            androidTabBarBaseStyle,
            {
              height: 60 + bottomInset,
              paddingBottom: bottomInset,
            },
          ],
          tabBarItemStyle: styles.androidTabItem,
          tabBarButton: ({ ref: _ref, ...props }) => (
            <AndroidTabButton {...props} />
          ),
          tabBarIconStyle: styles.androidTabIconSlot,
          tabBarLabelStyle: styles.androidTabLabelSlot,
          tabBarBackground: () => <AndroidTabBarMaterial />,
        }}
      >
        <RouterTabs.Screen
          name="chat"
          options={{
            title: 'Сферка',
            tabBarItemStyle: [styles.androidTabItem, styles.androidFirstTab],
            tabBarIcon: ({ focused }) => (
              <AndroidTabIcon focused={focused} route="chat" />
            ),
            tabBarLabel: ({ focused }) => (
              <AndroidTabLabel focused={focused} label="Сферка" />
            ),
          }}
        />
        <RouterTabs.Screen
          name="analyses"
          options={{
            title: 'Анализы',
            tabBarIcon: ({ focused }) => (
              <AndroidTabIcon focused={focused} route="analyses" />
            ),
            tabBarLabel: ({ focused }) => (
              <AndroidTabLabel focused={focused} label="Анализы" />
            ),
          }}
        />
        <RouterTabs.Screen
          name="index"
          options={{
            title: 'Сегодня',
            tabBarIcon: ({ focused }) => (
              <AndroidTabIcon focused={focused} route="index" />
            ),
            tabBarLabel: ({ focused }) => (
              <AndroidTabLabel focused={focused} label="Сегодня" />
            ),
          }}
        />
        <RouterTabs.Screen
          name="scan"
          options={{
            title: 'Скан',
            tabBarIcon: ({ focused }) => (
              <AndroidTabIcon focused={focused} route="scan" />
            ),
            tabBarLabel: ({ focused }) => (
              <AndroidTabLabel focused={focused} label="Скан" />
            ),
          }}
        />
        <RouterTabs.Screen
          name="profile"
          options={{
            title: 'Профиль',
            tabBarItemStyle: [styles.androidTabItem, styles.androidLastTab],
            tabBarIcon: ({ focused }) => (
              <AndroidTabIcon focused={focused} route="profile" />
            ),
            tabBarLabel: ({ focused }) => (
              <AndroidTabLabel focused={focused} label="Профиль" />
            ),
          }}
        />
        <RouterTabs.Screen name="design-system" options={{ href: null }} />
      </RouterTabs>
    </ThemeProvider>
  );
}

function AndroidTabBarMaterial() {
  return (
    <View pointerEvents="none" style={styles.androidTabBarMaterial}>
      <BlurView
        tint="light"
        intensity={42}
        experimentalBlurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={[
          'rgba(255,255,255,0.92)',
          'rgba(255,244,249,0.72)',
          'rgba(255,255,255,0.82)',
        ]}
        locations={[0, 0.62, 1]}
        start={{ x: 0.08, y: 0 }}
        end={{ x: 0.92, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.androidTabBarStroke} />
    </View>
  );
}

function Tabs() {
  if (Platform.OS === 'android') return <AndroidTabs />;
  return <IOSNativeTabs />;
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
  const [authLoadingTimedOut, setAuthLoadingTimedOut] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setAuthLoadingTimedOut(false);
      return undefined;
    }

    const timeout = setTimeout(() => setAuthLoadingTimedOut(true), 8000);
    return () => clearTimeout(timeout);
  }, [isLoading]);

  if (devMode) {
    return (
      <HealthStoreProvider mode="local">
        <AppGate allowEmptyProfile>
          <Tabs />
        </AppGate>
      </HealthStoreProvider>
    );
  }

  if (isLoading && !authLoadingTimedOut) {
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
  const [fontsLoaded, fontError] = useFonts({
    'SFProDisplay-Regular': require('../assets/fonts/SF-Pro-Display-Regular.otf'),
    'SFProDisplay-Medium': require('../assets/fonts/SF-Pro-Display-Medium.otf'),
    'SFProDisplay-Semibold': require('../assets/fonts/SF-Pro-Display-Semibold.otf'),
    'SFProDisplay-Bold': require('../assets/fonts/SF-Pro-Display-Bold.otf'),
    YaroRg: require('../assets/fonts/Yaro-Rg-Regular.otf'),
  });

  if (fontError) throw fontError;
  if (!fontsLoaded) return <LoadingAuth />;

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

const styles = StyleSheet.create({
  androidTabItem: {
    minHeight: 52,
    marginVertical: 5,
    borderRadius: 26,
    overflow: 'hidden',
    paddingVertical: 0,
  },
  androidFirstTab: {
    marginLeft: 7,
  },
  androidLastTab: {
    marginRight: 7,
  },
  androidActiveTabSurface: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 26,
    backgroundColor: activeCapsuleTint,
  },
  androidTabButtonContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  androidTabBarMaterial: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    borderRadius: 32,
  },
  androidTabBarStroke: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
  },
  androidTabIconSlot: {
    height: 28,
    marginBottom: 1,
  },
  androidLabelSlot: {
    width: 58,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  androidTabLabel: {
    position: 'absolute',
    fontSize: 10,
    lineHeight: 12,
    textAlign: 'center',
  },
  androidTabLabelInactive: {
    color: inactiveTint,
    fontFamily: 'SFProDisplay-Regular',
  },
  androidTabLabelActive: {
    color: activeTint,
    fontFamily: 'SFProDisplay-Medium',
  },
  androidTabLabelSlot: {
    height: 12,
    marginTop: 0,
  },
});
