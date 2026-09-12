import { useProfileAppearance } from '../lib/profile-appearance';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { comfortaaLicense } from '../lib/font-license';

export function FontLicenses() {
  const { colors } = useProfileAppearance();
  const [visible, setVisible] = useState(false);
  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => setVisible(true)} style={{ padding: 16, alignItems: 'center' }}>
        <Text style={{ color: colors.text.secondary }}>Лицензии шрифтов</Text>
      </Pressable>
      <Modal visible={visible} animationType="slide" onRequestClose={() => setVisible(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface.canvas }}>
          <View style={{ padding: 20 }}>
            <Pressable accessibilityRole="button" onPress={() => setVisible(false)} style={{ paddingVertical: 12 }}>
              <Text style={{ color: colors.brand.primary, fontSize: 18 }}>Закрыть</Text>
            </Pressable>
            <Text style={{ fontSize: 24, fontWeight: '600', color: colors.text.primary }}>Comfortaa</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Text selectable style={{ fontSize: 15, lineHeight: 23, color: colors.text.primary }}>{comfortaaLicense}</Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}
