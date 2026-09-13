'use client';
import { usePaginatedQuery, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { LoadingState, useUrlValue } from './data-state';

export function Users() {
  const [email, setEmail] = useUrlValue('email', '');
  const list = usePaginatedQuery(api.adminUsers.list, { email }, { initialNumItems: 25 });
  return <>
    <header className="page-title"><div><h1>Пользователи</h1>
      <p className="muted">Аккаунты платформы. Только просмотр — без медицинских данных и переписки.</p></div></header>
    <section className="panel">
      <form className="inline-form" key={email} onSubmit={e => { e.preventDefault(); setEmail(String(new FormData(e.currentTarget).get('email') ?? '').trim().toLowerCase()); }}>
        <label>Поиск по началу email<input name="email" defaultValue={email} maxLength={254} placeholder="Введите email" autoComplete="off" /></label>
        <button type="submit" className="primary">Найти</button>
        {email && <button type="button" onClick={() => setEmail('')}>Сбросить</button>}
      </form>
    </section>
    <section className="panel">
      {list.status === 'LoadingFirstPage' ? <LoadingState /> : <>
        <div className="table-wrap"><table><thead><tr><th>Email</th><th>Регистрация</th><th>Статус</th><th>ID аккаунта</th></tr></thead>
          <tbody>{list.results.map(user => <tr key={user.id}>
            <td>{user.email ?? 'Email не указан'}</td><td>{new Date(user.registeredAt).toLocaleString('ru-RU')}</td>
            <td><span className={`status ${user.status}`}>{user.status === 'active' ? 'Активен' : 'Ожидает удаления'}</span></td><td><code>{user.id}</code></td>
          </tr>)}</tbody></table></div>
        {!list.results.length && <p className="empty">{email ? 'По этому email аккаунты не найдены. Попробуйте изменить поиск.' : 'Аккаунтов пока нет. Данные появятся после регистрации пользователей.'}</p>}
        {list.status !== 'Exhausted' && <button className="load-more" disabled={list.status === 'LoadingMore'} onClick={() => list.loadMore(25)}>{list.status === 'LoadingMore' ? 'Загрузка…' : 'Показать ещё'}</button>}
        <p className="muted">Показано: {list.results.length}. {list.status !== 'Exhausted' ? 'Это не общее количество аккаунтов.' : ''}</p>
      </>}
    </section>
  </>;
}

export function AccountMetrics({ fromDay, toDay }: { fromDay: string; toDay: string }) {
  const data = useQuery(api.adminUsers.overview, { fromDay, toDay });
  if (!data) return <LoadingState />;
  if (!data.complete) return <section className="panel" role="status"><h2>Статистика аккаунтов ещё не готова</h2>
    <p>Нужен первичный пересчёт существующих аккаунтов. Список пользователей доступен независимо от пересчёта.</p></section>;
  return <><div className="metric-grid account-metrics">
    <div className="metric-card"><span>Всего аккаунтов сейчас</span><strong>{data.total.toLocaleString('ru-RU')}</strong></div>
    <div className="metric-card"><span>Регистрации за период</span><strong>{data.registrations.toLocaleString('ru-RU')}</strong></div>
  </div><p className="muted">Исторические регистрации восстановлены по сохранившимся аккаунтам; удалённые до первого пересчёта в них не входят.</p></>;
}
