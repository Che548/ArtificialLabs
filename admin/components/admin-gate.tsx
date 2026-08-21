'use client';

import { useAuthActions } from '@convex-dev/auth/react';
import { useConvexAuth, useQuery } from 'convex/react';
import { FormEvent, type PropsWithChildren, useState } from 'react';

import { api } from '../../convex/_generated/api';

export function AdminGate({ children }: PropsWithChildren) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn, signOut } = useAuthActions();
  const viewer = useQuery(api.admin.viewer, isAuthenticated ? {} : 'skip');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(undefined);
    try {
      await signIn('password', { email, password, flow: 'signIn' });
    } catch {
      setMessage('Не удалось войти. Проверьте email и пароль.');
    } finally {
      setBusy(false);
    }
  };

  if (isLoading || (isAuthenticated && viewer === undefined)) {
    return (
      <main className="gate">
        <div className="gate-card">Подключение к Convex…</div>
      </main>
    );
  }
  if (!isAuthenticated) {
    return (
      <main className="gate">
        <form className="gate-card login" onSubmit={submit}>
          <div className="brand-mark">AL</div>
          <p className="eyebrow">ArtificialLabs</p>
          <h1>Административная консоль</h1>
          <p className="muted">
            Доступ выдаётся действующим администратором. Саморегистрация
            отключена.
          </p>
          <label>
            Email
            <input
              required
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Пароль
            <input
              required
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {message && (
            <p className="inline-message error" role="alert">
              {message}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? 'Вход…' : 'Войти'}
          </button>
        </form>
      </main>
    );
  }
  if (!viewer?.isAdmin) {
    return (
      <main className="gate">
        <div className="gate-card">
          <h1>Доступ запрещён</h1>
          <p className="muted">
            Аккаунт {viewer?.email ?? 'пользователя'} не имеет роли Admin.
          </p>
          <button onClick={() => void signOut()}>Выйти</button>
        </div>
      </main>
    );
  }
  return <>{children}</>;
}
