import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { comfortaaLicense } from '../lib/font-license';

export function FontLicenses() {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => setVisible(true)} style={{ padding: 16, alignItems: 'center' }}>
        <Text style={{ color: '#736E6C' }}>Лицензии шрифтов</Text>
      </Pressable>
      <Modal visible={visible} animationType="slide" onRequestClose={() => setVisible(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF5F1' }}>
          <View style={{ padding: 20 }}>
            <Pressable accessibilityRole="button" onPress={() => setVisible(false)} style={{ paddingVertical: 12 }}>
              <Text style={{ color: '#823537', fontSize: 18 }}>Закрыть</Text>
            </Pressable>
            <Text style={{ fontSize: 24, fontWeight: '600' }}>Comfortaa</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Text selectable style={{ fontSize: 15, lineHeight: 23, color: '#302B2C' }}>{comfortaaLicense}</Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}
