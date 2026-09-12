import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Pressable, Text, View } from 'react-native';
import { AuthScreen } from '../../components/AuthScreen';
import { AppSheet } from '../../components/AppSheet';
import { LegalDocumentsButton } from '../../components/LegalDocumentsModal';
function Fixture() {
  const [consent, setConsent] = useState(false);
  return <View style={{ flex: 1 }}>
    <AuthScreen preview />
    <View style={{ position: 'absolute', bottom: 0, left: 8, flexDirection: 'row', gap: 12 }}>
      <LegalDocumentsButton />
      <Pressable testID="open-consent" onPress={() => setConsent(true)}><Text>ИИ: тест</Text></Pressable>
    </View>
    <AppSheet visible={consent} onClose={() => setConsent(false)} title="Доступ к ИИ">
      <LegalDocumentsButton documentId="ai" label="Правила ИИ" />
    </AppSheet>
  </View>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
