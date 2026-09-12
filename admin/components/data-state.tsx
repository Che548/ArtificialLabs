'use client';
import { Component, type ReactNode, useEffect, useState } from 'react';

export class DataBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <section className="panel data-state" role="alert">
      <h2>Не удалось загрузить данные</h2>
      <p>Проверьте подключение и права администратора. Возможно, серверная версия ещё не обновлена.</p>
      <button onClick={() => this.setState({ failed: false })}>Повторить загрузку</button>
    </section> : this.props.children;
  }
}

export function useUrlValue(key: string, fallback: string) {
  const [value, setValue] = useState(fallback);
  useEffect(() => {
    const read = () => setValue(new URL(location.href).searchParams.get(key) ?? fallback);
    read(); window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, [key, fallback]);
  const update = (next: string) => {
    const url = new URL(location.href);
    if (next === fallback) url.searchParams.delete(key); else url.searchParams.set(key, next);
    history.pushState(null, '', url); setValue(next);
  };
  return [value, update] as const;
}

export function LoadingState() {
  return <p className="data-state" role="status">Загрузка данных… Если ожидание затянулось, проверьте соединение.</p>;
}
