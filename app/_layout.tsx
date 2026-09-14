import { AppThemeProvider, useAppTheme, ThemeStatusBar } from '../lib/theme';
import { bundledFonts } from '../lib/bundled-fonts';
import { fontStyle } from '../lib/font-style';
import { nativeTabTopInset } from '../lib/native-tab-insets';
import { ConvexAuthProvider, useAuthToken } from '@convex-dev/auth/react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useConvexAuth } from 'convex/react';
import { useFonts } from 'expo-font';
import { Tabs as RouterTabs } from 'expo-router';
import {
  Badge,
  Icon,
  Label,
  NativeTabs,
} from 'expo-router/unstable-native-tabs';
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
  useWindowDimensions,
} from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

import '../global.css';
import { AppGate } from '../components/AppGate';
import { AuthScreen } from '../components/AuthScreen';
import { convex } from '../lib/convex';
import { useAssistantUnread } from '../lib/assistant-inbox';
import { AgentAutomationManager } from '../lib/agent-automation-manager';
import { ConnectivityBanner, ConnectivityProvider } from '../lib/connectivity';
import { DocumentOcrManager } from '../lib/document-ocr-manager';
import { HealthStoreProvider } from '../lib/health-store';
import { NotificationManagerProvider } from '../lib/notification-manager';
import { TelemetryManager } from '../lib/telemetry-manager';
import { authTokenStorage } from '../lib/secure-storage';
import { UpdateManagerProvider } from '../lib/update-manager';
import {
  androidTabBarBaseStyle,
  androidTabBarContentHeight,
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
  const { mode, colors } = useAppTheme();
  const assistantUnread = useAssistantUnread();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const top = nativeTabTopInset(
    insets.top,
    width,
    Platform.OS === 'ios' && Platform.isPad && Number.parseInt(String(Platform.Version), 10) >= 18,
  );
  return (
    <SafeAreaInsetsContext.Provider value={{ ...insets, top }}>
    <ThemeProvider value={mode === 'dark' ? DarkTheme : DefaultTheme}>
      <NativeTabs
        tintColor={activeTint}
        badgeBackgroundColor={activeTint}
        iconColor={{ default: inactiveTint, selected: activeTint }}
        backgroundColor={
          Platform.OS === 'android'
            ? androidTabBackground
            : colors.surface.glassWash
        }
        blurEffect={mode === "dark" ? "systemUltraThinMaterialDark" : "systemUltraThinMaterialLight"}
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
          {assistantUnread ? <Badge>1</Badge> : null}
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
    </SafeAreaInsetsContext.Provider>
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

function AndroidTabLabel({
  focused,
  label,
}: {
  focused: boolean;
  label: string;
}) {
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
        maxFontSizeMultiplier={1.3}
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
        maxFontSizeMultiplier={1.3}
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
  'aria-label': ariaLabel,
  'aria-selected': ariaSelected,
  accessibilityLabel,
  accessibilityState,
  children,
  style,
  testID: providedTestID,
  ...pressableProps
}: AndroidTabButtonProps) {
  const navigationLabel = accessibilityLabel ?? ariaLabel;
  const inferredTestID =
    navigationLabel?.split(',')[0]?.trim() === 'Сферка'
      ? 'e2e-tab-chat'
      : navigationLabel?.split(',')[0]?.trim() === 'Анализы'
        ? 'e2e-tab-analyses'
        : navigationLabel?.split(',')[0]?.trim() === 'Сегодня'
          ? 'e2e-tab-today'
          : navigationLabel?.split(',')[0]?.trim() === 'Скан'
            ? 'e2e-tab-scan'
            : navigationLabel?.split(',')[0]?.trim() === 'Профиль'
              ? 'e2e-tab-profile'
              : undefined;
  const testID = providedTestID ?? inferredTestID;
  const tabLabel =
    testID === 'e2e-tab-chat'
      ? 'Сферка'
      : testID === 'e2e-tab-analyses'
        ? 'Анализы'
        : testID === 'e2e-tab-today'
          ? 'Сегодня'
          : testID === 'e2e-tab-scan'
            ? 'Скан'
            : testID === 'e2e-tab-profile'
              ? 'Профиль'
              : navigationLabel?.split(',')[0]?.trim();
  const fallbackTestID =
    tabLabel === 'Сферка'
      ? 'e2e-tab-chat'
      : tabLabel === 'Анализы'
        ? 'e2e-tab-analyses'
        : tabLabel === 'Сегодня'
          ? 'e2e-tab-today'
          : tabLabel === 'Скан'
            ? 'e2e-tab-scan'
            : tabLabel === 'Профиль'
              ? 'e2e-tab-profile'
              : undefined;
  const resolvedTestID = testID ?? fallbackTestID;
  const selected = ariaSelected ?? accessibilityState?.selected ?? false;

  return (
    <Pressable
      cssInterop={false}
      {...pressableProps}
      accessibilityLabel={tabLabel ?? navigationLabel}
      accessibilityState={{ ...accessibilityState, selected }}
      aria-selected={selected}
      nativeID={resolvedTestID}
      style={(state) => [
        typeof style === 'function' ? style(state) : style,
        styles.androidTabPressTarget,
      ]}
      testID={resolvedTestID}
    >
      <View pointerEvents="none" style={styles.androidTabButtonContent}>
        {children}
      </View>
    </Pressable>
  );
}

function AndroidTabs() {
  const { mode, colors } = useAppTheme();
  const assistantUnread = useAssistantUnread();
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 8);
  const tabMetadata: Record<string, { label: string; testID: string }> = {
    chat: { label: 'Сферка', testID: 'e2e-tab-chat' },
    analyses: { label: 'Анализы', testID: 'e2e-tab-analyses' },
    index: { label: 'Сегодня', testID: 'e2e-tab-today' },
    scan: { label: 'Скан', testID: 'e2e-tab-scan' },
    profile: { label: 'Профиль', testID: 'e2e-tab-profile' },
  };

  return (
    <ThemeProvider value={mode === 'dark' ? DarkTheme : DefaultTheme}>
      <RouterTabs
        screenOptions={({ route }) => ({
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
          tabBarActiveBackgroundColor: 'transparent',
          tabBarHideOnKeyboard: true,
          tabBarLabelPosition: 'below-icon',
          tabBarStyle: [
            androidTabBarBaseStyle,
            {
              height: androidTabBarContentHeight + bottomInset,
              paddingBottom: bottomInset,
            },
          ],
          tabBarItemStyle: styles.androidTabItem,
          tabBarButton: ({ ref: _ref, ...props }) => {
            const metadata = tabMetadata[route.name];
            return (
              <AndroidTabButton
                {...props}
                accessibilityLabel={metadata?.label}
                testID={metadata?.testID}
              />
            );
          },
          tabBarIconStyle: styles.androidTabIconSlot,
          tabBarLabelStyle: styles.androidTabLabelSlot,
          tabBarBackground: () => <AndroidTabBarMaterial />,
        })}
      >
        <RouterTabs.Screen
          name="chat"
          options={{
            title: 'Сферка',
            tabBarBadge: assistantUnread ? 1 : undefined,
            tabBarBadgeStyle: styles.androidTabBadge,
            tabBarButtonTestID: 'e2e-tab-chat',
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
            tabBarButtonTestID: 'e2e-tab-analyses',
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
            tabBarButtonTestID: 'e2e-tab-today',
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
            tabBarButtonTestID: 'e2e-tab-scan',
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
            tabBarButtonTestID: 'e2e-tab-profile',
            tabBarIcon: ({ focused }) => (
              <AndroidTabIcon focused={focused} route="profile" />
            ),
            tabBarLabel: ({ focused }) => (
              <AndroidTabLabel focused={focused} label="Профиль" />
            ),
          }}
        />
      </RouterTabs>
    </ThemeProvider>
  );
}

function AndroidTabBarMaterial() {
  const { mode } = useAppTheme();
  return (
    <View
      pointerEvents="none"
      style={[
        styles.androidTabBarMaterial,
        {
          backgroundColor: mode === 'dark' ? 'rgba(28,26,29,0.96)' : 'rgba(250,249,249,0.96)',
          borderTopColor: mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(60,45,50,0.12)',
        },
      ]}
    />
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
      <NotificationManagerProvider>
        <AppGate allowEmptyProfile>
          <View className="flex-1">
            <View
              testID="web-demo-notice"
              pointerEvents="none"
              className="items-center bg-ink/90 px-4 py-2"
            >
              <Text className="font-sf-medium text-[12px] text-white">
                Web demo · медицинские данные не сохраняются
              </Text>
            </View>
            <View testID="web-demo-content" className="flex-1">
              <Tabs />
            </View>
          </View>
        </AppGate>
      </NotificationManagerProvider>
    </HealthStoreProvider>
  );
}

function NativeApp() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const authToken = useAuthToken();
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
        <NotificationManagerProvider>
          <AppGate allowEmptyProfile>
            <Tabs />
          </AppGate>
        </NotificationManagerProvider>
      </HealthStoreProvider>
    );
  }

  if (isLoading && !authLoadingTimedOut) {
    return <LoadingAuth />;
  }

  // Convex confirms `isAuthenticated` only after a websocket handshake. Keep
  // an already signed-in native user inside the encrypted local app when the
  // backend is unreachable; an invalid token is still removed by Convex Auth
  // as soon as the server can answer.
  if (!isAuthenticated && !authToken) {
    return <AuthScreen onDevLogin={() => setDevMode(true)} />;
  }

  return (
    <HealthStoreProvider>
      <DocumentOcrManager>
      <NotificationManagerProvider>
        <TelemetryManager />
        <AgentAutomationManager>
          <AppGate>
            <Tabs />
          </AppGate>
        </AgentAutomationManager>
      </NotificationManagerProvider>
      </DocumentOcrManager>
    </HealthStoreProvider>
  );
}

export default function RootLayout() {
  return <AppThemeProvider><TabLayout /></AppThemeProvider>;
}

function TabLayout() {
  const webDemo = Platform.OS === 'web';
  const [fontsLoaded, fontError] = useFonts(bundledFonts);

  if (fontError) throw fontError;
  if (!fontsLoaded) return <LoadingAuth />;

  return (
    <ConvexAuthProvider
      client={convex}
      storage={webDemo ? undefined : authTokenStorage}
      shouldHandleCode={false}
    >
      <ConnectivityProvider>
        <UpdateManagerProvider>
          <ThemeStatusBar hidden={false} />
          {webDemo ? <WebDemo /> : <NativeApp />}
          <ConnectivityBanner />
        </UpdateManagerProvider>
      </ConnectivityProvider>
    </ConvexAuthProvider>
  );
}

const styles = StyleSheet.create({
  androidTabBadge: {
    backgroundColor: activeTint,
    color: '#FFFFFF',
    height: 16,
    minWidth: 16,
    borderRadius: 8,
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: 3,
    includeFontPadding: false,
    top: 0,
  },
  androidTabItem: {
    minHeight: 44,
    marginVertical: 0,
    borderRadius: 0,
    overflow: 'hidden',
    paddingVertical: 0,
  },
  androidTabPressTarget: {
    padding: 0,
    minHeight: 44,
    width: '100%',
    alignItems: 'stretch',
  },
  androidTabButtonContent: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  androidTabBarMaterial: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    borderRadius: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  androidTabIconSlot: {
    height: 28,
    marginBottom: 1,
  },
  androidLabelSlot: {
    width: 58,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  androidTabLabel: {
    position: 'absolute',
    includeFontPadding: false,
    fontSize: 10,
    lineHeight: 12,
    textAlign: 'center',
  },
  androidTabLabelInactive: {
    color: inactiveTint,
    ...fontStyle('SFProDisplay-Regular'),
  },
  androidTabLabelActive: {
    color: activeTint,
    ...fontStyle('SFProDisplay-Medium'),
  },
  androidTabLabelSlot: {
    height: 16,
    marginTop: 0,
  },
});
