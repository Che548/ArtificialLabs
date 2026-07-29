import {
  Icon,
  Label,
  NativeTabs,
} from 'expo-router/unstable-native-tabs';
import { DefaultTheme, ThemeProvider } from '@react-navigation/native';

const activeTint = '#D31471';
const inactiveTint = '#9A9593';

export default function TabLayout() {
  return (
    <ThemeProvider value={DefaultTheme}>
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
          <Label>Чат</Label>
          <Icon
            sf={{
              default: 'bubble.left.and.bubble.right',
              selected: 'bubble.left.and.bubble.right.fill',
            }}
          />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="analyses">
          <Label>Анализы</Label>
          <Icon
            sf={{ default: 'cross.case', selected: 'cross.case.fill' }}
          />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="index">
          <Label>Сегодня</Label>
          <Icon
            sf={{
              default: 'heart.text.clipboard',
              selected: 'heart.text.clipboard.fill',
            }}
          />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="scan">
          <Label>Скан</Label>
          <Icon
            sf={{ default: 'viewfinder', selected: 'viewfinder' }}
          />
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

        <NativeTabs.Trigger name="design-system">
          <Label>UI-kit</Label>
          <Icon
            sf={{
              default: 'square.grid.2x2',
              selected: 'square.grid.2x2.fill',
            }}
          />
        </NativeTabs.Trigger>
      </NativeTabs>
    </ThemeProvider>
  );
}
