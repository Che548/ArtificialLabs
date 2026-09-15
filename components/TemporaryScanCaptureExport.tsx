import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet } from 'react-native';
import { Directory, File } from 'expo-file-system';
import { cacheDirectory, copyAsync, deleteAsync, makeDirectoryAsync } from 'expo-file-system/legacy';
import { AppText } from '../design-system/components';
import { useAppTheme } from '../lib/theme';
import { ENABLE_TEMPORARY_CAPTURE_EXPORT, TemporaryCaptureExportStore, type TemporaryCapture } from '../services/scanning/temporary-capture-export';

// All temporary integration lives here and in temporary-capture-export.ts.
const store = Platform.OS !== 'web' && cacheDirectory ? new TemporaryCaptureExportStore(
  `${cacheDirectory}temporary-scan-capture-export/`, {
    remove: uri => deleteAsync(uri, { idempotent: true }),
    mkdir: uri => makeDirectoryAsync(uri, { intermediates: true }),
    copy: (from, to) => copyAsync({ from, to }),
  },
) : null;

export function useTemporaryScanCaptureExport(visible: boolean) {
  const [capture, setCapture] = useState<TemporaryCapture | null>(null);
  useEffect(() => {
    setCapture(null);
    void store?.clear();
    return () => { void store?.clear(); };
  }, [visible]);
  const preserve = async (frames: readonly { uri: string }[], cancelled: () => boolean) => {
    if (!ENABLE_TEMPORARY_CAPTURE_EXPORT || !store) return;
    setCapture(null);
    const next = await store.replace(frames, cancelled);
    if (!cancelled()) setCapture(next);
  };
  return { capture, preserve };
}

export function TemporaryScanCaptureExportButton({ capture }: { capture?: TemporaryCapture | null }) {
  const { colors } = useAppTheme();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  if (!ENABLE_TEMPORARY_CAPTURE_EXPORT || !capture || Platform.OS === 'web') return null;

  const save = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    let created: Directory | undefined;
    let completed = false;
    try {
      const parent = await Directory.pickDirectoryAsync();
      if (!mounted.current) return;
      // Create a fresh folder: never replace any file chosen by the user.
      const destination = new Directory(parent.createDirectory(`Sfera-capture-${Date.now()}`).uri);
      created = destination;
      for (const name of capture.names) {
        if (!mounted.current) return;
        new File(capture.directoryUri + name).copy(new File(destination, name));
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      completed = true;
      Alert.alert('Снимки сохранены', 'Оригиналы последней съёмки находятся в выбранной папке.');
    } catch (error) {
      const code = (error as { code?: string })?.code ?? '';
      if (mounted.current && !/cancel/i.test(code)) {
        Alert.alert('Не удалось сохранить снимки', 'Попробуйте выбрать другую папку.');
      }
    } finally {
      // Only the new export folder is ours; the user's chosen folder is untouched.
      if (!completed && created) { try { created.delete(); } catch {} }
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Скачать снимки последней съёмки"
      accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => { void save(); }}
      style={[styles.button, { backgroundColor: colors.surface.raised }]}>
      <AppText role="label" weight="medium" color={colors.brand.primary}>
        {busy ? 'Сохраняем снимки…' : 'Скачать снимки'}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { position: 'absolute', left: 16, right: 16, bottom: 38, height: 44,
    borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
