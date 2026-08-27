import { useConvexAuth, useConvexConnectionState } from 'convex/react';
import Constants from 'expo-constants';
import { useNetworkState } from 'expo-network';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getAppVersionInfo } from '../lib/app-version';
import {
  getDeviceDiagnosticsSnapshot,
  type DeviceDiagnosticsSnapshot,
} from '../lib/device-diagnostics';
import { useHealthStore } from '../lib/health-store';
import {
  loadLocalSetting,
  loadLocalStorageDiagnostics,
  quickCheckLocalDatabase,
} from '../lib/local-database';
import { loadLocalFileDiagnostics } from '../lib/local-files';
import { useUpdateManager } from '../lib/update-manager';
import type { UpdateChannel } from '../lib/update-manager';
import type { CloudSyncPreference } from '../lib/health-types';

type ServiceHealth = {
  convex: 'ok' | 'offline' | 'error';
  convexLatencyMs?: number;
  updates: 'ok' | 'offline' | 'error';
  updatesLatencyMs?: number;
  safeErrorCode?: string;
};

type Snapshot = {
  device: DeviceDiagnosticsSnapshot & { processCpuPercent: number; eventLoopDelayMs: number };
  storage: Awaited<ReturnType<typeof loadLocalStorageDiagnostics>>;
  files: Awaited<ReturnType<typeof loadLocalFileDiagnostics>>;
  cloudOptIn: boolean;
  services: ServiceHealth;
};

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 Б';
  const units = ['Б', 'КБ', 'МБ', 'ГБ'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 3);
  return `${(bytes / 1024 ** exponent).toFixed(exponent ? 1 : 0)} ${units[exponent]}`;
};

async function probe(url: string) {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return { ok: response.ok, latency: Date.now() - started };
  } finally {
    clearTimeout(timeout);
  }
}

export function DiagnosticsScreen({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const network = useNetworkState();
  const auth = useConvexAuth();
  const connection = useConvexConnectionState();
  const { cloudSyncEnabled, syncNow, syncStatus } = useHealthStore();
  const updates = useUpdateManager();
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [loading, setLoading] = useState(false);
  const [refreshErrorCode, setRefreshErrorCode] = useState<string>();
  const [quickCheck, setQuickCheck] = useState<'idle' | 'checking' | 'ok' | 'failed' | 'unavailable'>('idle');
  const refreshInFlight = useRef(false);
  const previousDevice = useRef<
    { sample: DeviceDiagnosticsSnapshot; at: number } | undefined
  >(undefined);
  const loopExpectedAt = useRef(Date.now());
  const eventLoopDelayMs = useRef(0);
  const version = getAppVersionInfo({
    updateCreatedAt: updates.currentUpdateCreatedAt,
    updateId: updates.currentUpdateId,
  });

  const refresh = useCallback(async () => {
    if (!visible || Platform.OS === 'web' || refreshInFlight.current) return;
    refreshInFlight.current = true;
    setLoading(true);
    setRefreshErrorCode(undefined);
    try {
      const device = await getDeviceDiagnosticsSnapshot();
      const now = Date.now();
      const previous = previousDevice.current;
      const cpuPercent = previous
        ? Math.max(0, Math.min(100, ((device.processCpuTimeMs - previous.sample.processCpuTimeMs) / Math.max(1, now - previous.at) / Math.max(1, device.cpuCount)) * 100))
        : 0;
      previousDevice.current = { sample: device, at: now };
      const backendUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
      const updatesUrl = Constants.expoConfig?.extra?.updatesHealthUrl;
      const [storage, files, preference, convexProbe, updatesProbe] = await Promise.all([
        loadLocalStorageDiagnostics(),
        loadLocalFileDiagnostics(),
        loadLocalSetting<CloudSyncPreference>('cloudSyncPreference.v1'),
        typeof backendUrl === 'string'
          ? probe(`${backendUrl.replace(/\/$/, '')}/version`).catch(() => ({ ok: false, latency: undefined }))
          : Promise.resolve({ ok: false, latency: undefined }),
        typeof updatesUrl === 'string'
          ? probe(updatesUrl).catch(() => ({ ok: false, latency: undefined }))
          : Promise.resolve({ ok: false, latency: undefined }),
      ]);
      const offline = network.isConnected === false || network.isInternetReachable === false;
      setSnapshot({
        device: { ...device, processCpuPercent: cpuPercent, eventLoopDelayMs: eventLoopDelayMs.current },
        storage,
        files,
        cloudOptIn: preference?.enabled === true,
        services: {
          convex: convexProbe.ok ? 'ok' : offline ? 'offline' : 'error',
          convexLatencyMs: convexProbe.latency,
          updates: updatesProbe.ok ? 'ok' : offline ? 'offline' : 'error',
          updatesLatencyMs: updatesProbe.latency,
          safeErrorCode: updates.safeErrorCode,
        },
      });
    } catch {
      setRefreshErrorCode('DIAGNOSTICS_REFRESH_FAILED');
    } finally {
      refreshInFlight.current = false;
      setLoading(false);
    }
  }, [network.isConnected, network.isInternetReachable, updates.safeErrorCode, visible]);

  useEffect(() => {
    if (!visible) return;
    void refresh();
    loopExpectedAt.current = Date.now() + 1000;
    const loopTimer = setInterval(() => {
      const now = Date.now();
      eventLoopDelayMs.current = Math.max(0, now - loopExpectedAt.current);
      loopExpectedAt.current = now + 1000;
    }, 1000);
    const resourceTimer = setInterval(() => void refresh(), 2000);
    return () => {
      clearInterval(loopTimer);
      clearInterval(resourceTimer);
      previousDevice.current = undefined;
    };
  }, [refresh, visible]);

  const changeChannel = async (channel: UpdateChannel) => {
    await updates.setChannel(channel);
    await refresh();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Text style={styles.heading} testID="diagnostics-title">Диагностика</Text>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.close} testID="diagnostics-close">
            <Text style={styles.closeText}>Готово</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}>
          <Section title="Версия">
            <Row label="Приложение" value={`v${version.appVersion} (${version.buildNumber})`} />
            <Row label="Commit" value={version.gitCommit} />
            <Row label="Runtime" value={version.runtimeVersion.slice(0, 16)} />
            <Row label="Update" value={version.updateId} />
            <Row label="Источник" value={version.isEmbedded ? 'embedded' : 'OTA'} />
            <Row label="Дата update" value={version.updateCreatedAt ? new Date(version.updateCreatedAt).toLocaleString('ru-RU') : '—'} />
          </Section>
          <Section title="Канал">
            <View style={styles.channelRow}>
              {(['production', 'preview'] as UpdateChannel[]).map((channel) => (
                <Pressable key={channel} onPress={() => void changeChannel(channel)} style={[styles.channel, updates.channel === channel && styles.channelActive]} testID={`ota-channel-${channel}`}>
                  <Text style={[styles.channelText, updates.channel === channel && styles.channelTextActive]}>{channel === 'production' ? 'Production' : 'Preview'}</Text>
                </Pressable>
              ))}
            </View>
            <Row label="Updates" value={updates.state} testID="ota-update-state" />
          </Section>
          <Section title="Устройство">
            <Row label="Платформа" value={`${Platform.OS} ${Platform.Version}`} />
            <Row label="CPU" value={`${snapshot?.device.cpuCount ?? 0} ядер · ${(snapshot?.device.processCpuPercent ?? 0).toFixed(1)}% процесса`} />
            <Row label="RAM процесса" value={formatBytes(snapshot?.device.processRssBytes ?? 0)} />
            <Row label="RAM доступно / всего" value={`${formatBytes(snapshot?.device.availableMemoryBytes ?? 0)} / ${formatBytes(snapshot?.device.totalMemoryBytes ?? 0)}`} />
            <Row label="Диск свободно / всего" value={`${formatBytes(snapshot?.device.freeDiskBytes ?? 0)} / ${formatBytes(snapshot?.device.totalDiskBytes ?? 0)}`} />
            <Row label="JS event-loop delay" value={`${snapshot?.device.eventLoopDelayMs ?? 0} мс`} />
          </Section>
          <Section title="SQLCipher">
            <Row label="DB / WAL / SHM" value={`${formatBytes(snapshot?.storage.databaseBytes ?? 0)} / ${formatBytes(snapshot?.storage.walBytes ?? 0)} / ${formatBytes(snapshot?.storage.shmBytes ?? 0)}`} />
            <Row label="Страницы / свободные" value={`${snapshot?.storage.pageCount ?? 0} / ${snapshot?.storage.freelistCount ?? 0}`} />
            <Row label="Записи" value={Object.entries(snapshot?.storage.recordCounts ?? {}).map(([key, value]) => `${key}: ${value}`).join(' · ') || '0'} />
            <Row label="Quick check" value={quickCheck} />
          </Section>
          <Section title="Синхронизация">
            <Row label="Cloud opt-in" value={snapshot?.cloudOptIn ? 'включён' : 'выключен'} />
            <Row label="Статус" value={syncStatus} />
            <Row label="Последний успех" value={snapshot?.storage.lastSuccessfulSyncAt ? new Date(snapshot.storage.lastSuccessfulSyncAt).toLocaleString('ru-RU') : '—'} />
            <Row label="Outbox" value={`${snapshot?.storage.outboxCount ?? 0}; ближайший batch ${snapshot?.storage.nextBatchCount ?? 0}; всего batches ${snapshot?.storage.remainingBatches ?? 0}`} />
            <Row label="Оценка upload JSON" value={`${formatBytes(snapshot?.storage.uploadEstimateBytes ?? 0)} до HTTP compression`} />
          </Section>
          <Section title="Локальные файлы">
            <Row label="Сканы" value={`${snapshot?.files.scanImages.count ?? 0} · ${formatBytes(snapshot?.files.scanImages.bytes ?? 0)}`} />
            <Row label="Документы" value={`${snapshot?.files.labDocuments.count ?? 0} · ${formatBytes(snapshot?.files.labDocuments.bytes ?? 0)}`} />
            <Row label="Вложения чата" value={`${snapshot?.files.chatAttachments.count ?? 0} · ${formatBytes(snapshot?.files.chatAttachments.bytes ?? 0)}`} />
            <Text style={styles.note}>Эти файлы остаются на устройстве и не выгружаются.</Text>
          </Section>
          <Section title="Telemetry queue">
            <Row label="События / байты" value={`${snapshot?.storage.telemetryCount ?? 0} / ${formatBytes(snapshot?.storage.telemetryBytes ?? 0)}`} />
            <Row label="Макс. попыток" value={String(snapshot?.storage.telemetryMaxAttempts ?? 0)} />
          </Section>
          <Section title="Сервисы">
            <Row label="Сеть" value={network.isConnected === false ? 'offline' : 'online'} />
            <Row label="Convex Auth / WS" value={`${auth.isAuthenticated ? 'auth' : 'no auth'} / ${connection.isWebSocketConnected ? 'connected' : 'disconnected'}`} />
            <Row label="Convex /version" value={`${snapshot?.services.convex ?? '—'}${snapshot?.services.convexLatencyMs !== undefined ? ` · ${snapshot.services.convexLatencyMs} мс` : ''}`} />
            <Row label="Update server" value={`${snapshot?.services.updates ?? '—'}${snapshot?.services.updatesLatencyMs !== undefined ? ` · ${snapshot.services.updatesLatencyMs} мс` : ''}`} />
            <Row label="Последний safe error" value={refreshErrorCode ?? snapshot?.services.safeErrorCode ?? '—'} />
          </Section>
          <View style={styles.actions}>
            <Action title="Обновить диагностику" disabled={loading} onPress={() => void refresh()} />
            <Action title="Синхронизировать сейчас" disabled={!cloudSyncEnabled || syncStatus === 'syncing'} onPress={() => void syncNow().then(refresh)} />
            <Action title="Проверить целостность БД" disabled={quickCheck === 'checking'} onPress={() => { setQuickCheck('checking'); void quickCheckLocalDatabase().then((result) => setQuickCheck(result as typeof quickCheck)).catch(() => setQuickCheck('failed')); }} />
          </View>
          {loading ? <ActivityIndicator color="#EA4087" /> : null}
          <Text style={styles.privacy}>Диагностика остаётся на устройстве. Содержимое записей, пути, ключи и токены не показываются и не отправляются.</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>;
}
function Row({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return <View style={styles.row} testID={testID}><Text style={styles.label}>{label}</Text><Text selectable style={styles.value}>{value}</Text></View>;
}
function Action({ title, disabled, onPress }: { title: string; disabled?: boolean; onPress: () => void }) {
  return <Pressable disabled={disabled} onPress={onPress} style={[styles.action, disabled && styles.disabled]}><Text style={styles.actionText}>{title}</Text></Pressable>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F3F1F2' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12, backgroundColor: '#FFFEFE' },
  heading: { color: '#2F292C', fontFamily: 'SFProDisplay-Semibold', fontSize: 24 },
  close: { paddingHorizontal: 12, paddingVertical: 8 },
  closeText: { color: '#EA4087', fontFamily: 'SFProDisplay-Semibold', fontSize: 15 },
  content: { padding: 16, gap: 14 },
  section: { borderRadius: 18, backgroundColor: '#FFFFFF', padding: 15, gap: 9 },
  sectionTitle: { color: '#2F292C', fontFamily: 'SFProDisplay-Semibold', fontSize: 17, marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  label: { width: 126, color: '#736E6C', fontFamily: 'SFProDisplay-Regular', fontSize: 12, lineHeight: 16 },
  value: { minWidth: 0, flex: 1, color: '#2F292C', fontFamily: 'SFProDisplay-Medium', fontSize: 12, lineHeight: 16 },
  note: { color: '#8A737D', fontFamily: 'SFProDisplay-Regular', fontSize: 11, lineHeight: 15 },
  channelRow: { flexDirection: 'row', gap: 8 },
  channel: { flex: 1, alignItems: 'center', borderRadius: 14, backgroundColor: '#F3EFF1', paddingVertical: 10 },
  channelActive: { backgroundColor: '#EA4087' },
  channelText: { color: '#736E6C', fontFamily: 'SFProDisplay-Semibold', fontSize: 13 },
  channelTextActive: { color: '#FFFFFF' },
  actions: { gap: 8 },
  action: { alignItems: 'center', borderRadius: 16, backgroundColor: '#EA4087', paddingVertical: 13 },
  actionText: { color: '#FFFFFF', fontFamily: 'SFProDisplay-Semibold', fontSize: 14 },
  disabled: { opacity: 0.45 },
  privacy: { color: '#8A8386', fontFamily: 'SFProDisplay-Regular', fontSize: 11, lineHeight: 15, textAlign: 'center' },
});
