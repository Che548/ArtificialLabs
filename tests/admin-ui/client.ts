// Browser-only test double. Never imported by admin/ or deployed.
import { useTodayFixture, todayQuery, todayRows, todayMutation } from './today-fixture';
import { useState } from 'react';
import { getFunctionName } from 'convex/server';
const mode = () => new URL(location.href).searchParams.get('fixture') ?? 'ready';
export const useConvexAuth = () => ({ isAuthenticated: !['guest'].includes(mode()), isLoading: false });
export const useConvexConnectionState = () => ({ isWebSocketConnected: mode() !== 'offline' });
export function useQuery(ref: any, args: any) {
  useTodayFixture();
  const name = getFunctionName(ref);
  if (args === 'skip') return undefined;
  if (name.startsWith('todayContent:')) return todayQuery(name);
  if (name === 'admin:viewer') return { isAdmin: mode() !== 'ordinary', email: 'operator@example.test' };
  if (mode() === 'error') throw new Error('Test server unavailable');
  if (mode() === 'loading') return undefined;
  if (name === 'adminUsers:overview') return { complete: mode() !== 'migration', total: mode() === 'empty' ? 0 : 63, registrations: mode() === 'empty' ? 0 : 12, daily: [] };
  if (name === 'telemetry:overview') return { buckets: [], activeUsers: [] };
  if (name === 'monitoringData:smsOverview') return { balance: { status: 'idle', successfulSendsSinceRefresh: 0 }, todayUtc: { requested: 0, sent: 0, failed: 0, successPercent: null } };
  if (/Overview/.test(name)) return {};
  return [];
}
export function usePaginatedQuery(ref: any, args: any, options: any) {
  useTodayFixture();
  const [count, setCount] = useState(options.initialNumItems);
  if (mode() === 'error') throw new Error('Test server unavailable');
  const rows = getFunctionName(ref) === 'todayContent:list' ? todayRows() : getFunctionName(ref) === 'adminUsers:list' && mode() !== 'empty'
    ? Array.from({ length: 63 }, (_, i) => ({ id: `fixture-${i}`, email: `reader${String(i).padStart(2, '0')}@example.test`, registeredAt: 1788000000000 + i * 3600000, status: i === 2 ? 'pending_deletion' : 'active' })).filter(x => !args.email || x.email.startsWith(args.email)) : [];
  return { results: mode() === 'loading' ? [] : rows.slice(0, count), status: mode() === 'loading' ? 'LoadingFirstPage' : count < rows.length ? 'CanLoadMore' : 'Exhausted', loadMore: (n: number) => setCount(count + n) };
}
export const useMutation = (ref: any) => async (args: any) => todayMutation(getFunctionName(ref), args);
