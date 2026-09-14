import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useUpdateManager, type UpdateManagerValue } from '../lib/update-manager';

/** Feature-local: never overlays or disables unrelated screens. */
export function UpdateRequiredNotice({ localChangesSaved = false }: { localChangesSaved?: boolean }) {
  const manager = useUpdateManager();
  return <UpdateRequiredContent manager={manager} localChangesSaved={localChangesSaved} />;
}

export function UpdateRequiredContent({ manager, localChangesSaved = false }: {
  manager: Pick<UpdateManagerValue, 'state' | 'isRestartBlocked' | 'checkNow' | 'restart'>;
  localChangesSaved?: boolean;
}) {
  const [attempted, setAttempted] = useState(false);
  const [restartError, setRestartError] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const working = busy || manager.state === 'checking' || manager.state === 'downloading';
  const disabled = working || (manager.state === 'ready' && manager.isRestartBlocked);
  async function act(restart: boolean) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setRestartError(false);
    try {
      if (restart) setRestartError(!(await manager.restart()));
      else { setAttempted(true); await manager.checkNow(); }
    } catch { setRestartError(true); }
    finally { lock.current = false; setBusy(false); }
  }
  return <View style={styles.box} testID="client-update-required" accessibilityLiveRegion="polite">
    <Text style={styles.title}>Для этой функции нужно обновить приложение.</Text>
    {localChangesSaved && <Text style={styles.text}>Изменения сохранены на устройстве.</Text>}
    <Text style={styles.text}>{restartError
      ? 'Не удалось безопасно перезапустить приложение. Черновики не очищены. Попробуйте снова.'
      : manager.state === 'ready'
        ? manager.isRestartBlocked ? 'Завершите текущую операцию перед перезапуском.' : 'Обновление загружено. Перед перезапуском сохраним черновики.'
        : manager.state === 'checking' ? 'Проверяем обновления…'
        : manager.state === 'downloading' ? 'Загружаем обновление…'
        : manager.state === 'error' ? 'Не удалось проверить обновление. Попробуйте позже.'
        : manager.state === 'disabled' ? 'Обновление внутри этой сборки недоступно. Проверьте новую версию в магазине или у администратора тестирования.'
        : attempted ? 'Совместимое обновление в текущем канале пока не найдено. Проверьте магазин или попробуйте позже.'
        : 'Остальные функции остаются доступны.'}</Text>
    <Pressable accessibilityRole="button" testID="client-update-action"
      disabled={disabled} accessibilityState={{ disabled }}
      style={[styles.button, disabled && styles.disabled]}
      onPress={() => void act(manager.state === 'ready')}>
      <Text style={styles.buttonText}>{manager.state === 'ready' ? 'Перезапустить' : 'Проверить обновление'}</Text>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  box: { padding: 16, gap: 10, borderRadius: 16, backgroundColor: '#FFF3F8' },
  title: { fontSize: 16, fontWeight: '600', color: '#30252C' },
  text: { fontSize: 14, lineHeight: 20, color: '#5F4B58' },
  button: { minHeight: 44, padding: 12, borderRadius: 12, backgroundColor: '#AC225D', alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 15 },
  disabled: { opacity: 0.5 },
});
