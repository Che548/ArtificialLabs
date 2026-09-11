import { createRoot } from 'react-dom/client';
import { Text } from 'react-native';
import { ProfileContacts } from '../../components/ProfileContacts';
import { LoginEmailVerification } from '../../components/LoginEmailVerification';
import { useState } from 'react';
function Fixture() {
  const params = new URLSearchParams(location.search);
  const [login, setLogin] = useState(params.has('login'));
  const [done, setDone] = useState(false);
  return (
    <div style={{ maxWidth: 700, margin: 'auto', padding: 20 }}>
      <h1>Данные профиля</h1>
      {done && <p>Вход подтверждён</p>}
      {login && (
        <LoginEmailVerification
          initial={{
            challengeId: 'fixture' as any,
            token: 'fixture-only',
            expiresAt: Date.now() + 600000,
            retryAt: Date.now() + 60000,
          }}
          onClose={() => setLogin(false)}
          onDone={() => {
            setLogin(false);
            setDone(true);
          }}
        />
      )}
      <ProfileContacts
        email="fixture@example.test"
        phone={params.has('phone') ? '+79990000001' : undefined}
        disabled={false}
        renderPhone={() => <Text>Стенд: SMS не отправляются</Text>}
      />
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
