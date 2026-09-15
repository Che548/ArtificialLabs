import { useMemo, useState } from 'react';
import { useConvexAuth, useMutation, useQueries, type RequestForQueries } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Platform, View } from 'react-native';
import { AppText, ProfileSettingsGroup } from '../design-system';
import { useAppTheme } from '../lib/theme';
import { useHealthStore } from '../lib/health-store';
import { OCR_CONSENT, OCR_POLICY_VERSION } from '../shared/document-ocr';
import { AppSheet } from './AppSheet';
import { PermissionAction, PermissionToggle } from './ProfilePermissionDetails';

/** Document processing lives alongside the other app permissions. */
export function ProfileDocumentPermissions() {
  const { colors } = useAppTheme();
  const { readOnly, cloudSyncEnabled, accountDeletion } = useHealthStore();
  const { isAuthenticated } = useConvexAuth();
  const canRead = Platform.OS !== 'web' && !readOnly && isAuthenticated && cloudSyncEnabled && !accountDeletion.pendingDeletion;
  const queries = useMemo((): RequestForQueries => canRead
    ? { status: { query: api.documentOcr.status, args: {} } }
    : {}, [canRead]);
  const result = useQueries(queries).status;
  const status = result instanceof Error ? undefined : result;
  const setConsent = useMutation(api.documentOcr.setConsent);
  const ocr = {
    enabled: canRead && !!status?.enabled,
    accepted: !!status?.accepted,
    reason: !cloudSyncEnabled ? 'Сначала включите облачную синхронизацию'
      : result instanceof Error ? 'Не удалось загрузить настройку'
      : !canRead ? 'Доступно в приложении после входа'
      : status === undefined ? 'Загрузка…' : 'Сервис временно недоступен',
    consent: (accepted: boolean) => setConsent({ accepted, policyVersion: OCR_POLICY_VERSION }),
  };
  const [details, setDetails] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const change = async (accepted: boolean) => {
    if (busy || readOnly) return;
    setBusy(true);
    setError('');
    try { await ocr.consent(accepted); }
    catch { setError('Не удалось сохранить настройку. Попробуйте ещё раз.'); }
    finally { setBusy(false); }
  };
  return <>
    <ProfileSettingsGroup title="Документы" footer="PDF, JPEG, PNG · до 20 МБ, до 20 страниц.">
      <PermissionToggle
        label="Распознавание документов"
        subtitle={ocr.enabled ? 'PDF и фото через Yandex AI Studio' : ocr.reason}
        testID="document-ocr-permission"
        value={ocr.accepted}
        disabled={busy || readOnly || (!ocr.enabled && !ocr.accepted)}
        onChange={(value) => void change(value)}
      />
      <PermissionAction label="Об обработке документов" onPress={() => setDetails(true)} isLast />
      {error ? <View accessibilityRole="alert" style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
        <AppText role="caption" color={colors.state.error}>{error}</AppText>
      </View> : null}
    </ProfileSettingsGroup>
    <AppSheet visible={details} title="Обработка документов" onClose={() => setDetails(false)}>
      <AppText>{OCR_CONSENT}</AppText>
    </AppSheet>
  </>;
}
