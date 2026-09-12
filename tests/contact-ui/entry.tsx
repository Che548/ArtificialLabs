import { createRoot } from 'react-dom/client';
import { Text } from 'react-native';
import { ProfileContacts } from '../../components/ProfileContacts';
createRoot(document.getElementById('root')!).render(
  <div style={{ maxWidth: 700, margin: 'auto', padding: 20 }}>
    <h1>Данные профиля</h1>
    <ProfileContacts
      email="fixture@example.test"
      disabled={false}
      renderPhone={() => <Text>Стенд: SMS не отправляются</Text>}
    />
  </div>,
);
