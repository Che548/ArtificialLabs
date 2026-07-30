import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { ConvexProvider } from 'convex/react';

import '../global.css';
import { convex } from '../lib/convex';

const activeTint = '#D31471';
const inactiveTint = '#9A9593';

export default function TabLayout() {
  return (
    <ConvexProvider client={convex}>
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

        <NativeTabs.Trigger name="design-system">
          <NativeTabs.Trigger.Label>UI-kit</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf={{
              default: 'square.grid.2x2',
              selected: 'square.grid.2x2.fill',
            }}
          />
        </NativeTabs.Trigger>
      </NativeTabs>
    </ConvexProvider>
  );
}
