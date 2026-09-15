import { useProfileAppearance, useProfileStyles } from '../lib/profile-appearance';
import type { ThemeColors } from '../lib/theme';
import { LegalDocumentsModal } from './LegalDocumentsModal';
import type { LegalDocumentSelection } from '../lib/legal-documents';
import { useState } from 'react';
import { ProfileCollapse, ProfileDisclosureArrow } from './ProfileMotion';
import { Platform, Pressable, StyleSheet, Switch, View } from 'react-native';
import { AppText } from '../design-system/components';
import { colors } from '../design-system/tokens';
import Svg, { Path } from 'react-native-svg';

export function PermissionAction({
  label,
  subtitle,
  onPress,
  disabled = false,
  destructive = false,
  isLast = false,
  testID,
  expanded,
}: {
  label: string;
  subtitle?: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
  isLast?: boolean;
  testID?: string;
  expanded?: boolean;
}) {
  const { colors } = useProfileAppearance();
  const styles = useProfileStyles(createStyles);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={subtitle}
        accessibilityState={{ disabled, expanded }}
        testID={testID}
        disabled={disabled}
        onPress={onPress}
        style={styles.row}
      >
        <View style={styles.copy}>
          <AppText
            style={styles.label}
            color={
              disabled
                ? colors.text.secondary
                : destructive
                  ? colors.state.error
                  : colors.text.primary
            }
          >
            {label}
          </AppText>
          {subtitle ? (
            <AppText style={styles.caption} color={colors.text.secondary}>
              {subtitle}
            </AppText>
          ) : null}
        </View>
        {!destructive && !disabled ? (
          <View style={styles.trailing}>
            <ProfileDisclosureArrow expanded={expanded === true}>
              <Svg width={18} height={18} viewBox="0 0 18 18">
                <Path
                  d="m6.5 4 5 5-5 5"
                  fill="none"
                  stroke={colors.text.secondary}
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </ProfileDisclosureArrow>
          </View>
        ) : null}
      </Pressable>
      {!isLast ? <View style={styles.divider} /> : null}
    </>
  );
}

export function AssistantDataDetails({
  accepted,
  disabled,
  onRevoke,
  onDelete,
}: {
  accepted: boolean;
  disabled: boolean;
  onRevoke: () => void;
  onDelete: () => void;
}) {
  const { colors } = useProfileAppearance();
  const styles = useProfileStyles(createStyles);
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <PermissionAction
        label="Доступ к данным здоровья"
        subtitle={accepted ? 'Разрешён' : 'Не предоставлен'}
        expanded={expanded}
        onPress={() => setExpanded(!expanded)}
        isLast
      />
      <ProfileCollapse open={expanded}>
        <View style={styles.details}>
          {[
            [
              'После отдельного согласия',
              'Параметры здоровья из профиля, дневник за последние 30 дней, подтверждённые анализы и домашние тесты, активный план.',
            ],
            [
              'Только по запросу',
              'Старые записи дневника, другие ваши чаты и метаданные документов.',
            ],
            [
              'Для автоматических проверок',
              'Новые сообщения пользователя в чатах с доступом к данным здоровья, категория и дата нового документа.',
            ],
            [
              'Не передаются автоматически',
              'Старые текстовые чаты без доступа к данным здоровья, ответы ИИ, названия и содержимое файлов. Имя, контакты, идентификаторы и пути к файлам Сферке недоступны.',
            ],
          ].map(([title, description]) => (
            <View key={title} style={styles.detailItem}>
              <AppText style={styles.caption} weight="medium">
                {title}
              </AppText>
              <AppText style={styles.caption} color={colors.text.secondary}>
                {description}
              </AppText>
            </View>
          ))}
        </View>
        <>
          {!accepted ? (
            <View style={styles.details}>
              <AppText style={styles.caption} color={colors.text.secondary}>
                Доступ можно предоставить во вкладке «Чат» перед первым ответом.
              </AppText>
            </View>
          ) : null}
          {accepted ? (
            <PermissionAction
              label="Отозвать доступ"
              disabled={disabled}
              onPress={onRevoke}
            />
          ) : null}
          <PermissionAction
            label="Удалить данные проверок плана"
            subtitle="План, правила и история изменений"
            disabled={disabled}
            destructive
            onPress={onDelete}
            isLast
          />
        </>
      </ProfileCollapse>
    </>
  );
}

export function PermissionToggle({
  label,
  subtitle,
  value,
  disabled,
  onChange,
  isLast = false,
  testID,
}: {
  label: string;
  subtitle?: string;
  value: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
  isLast?: boolean;
  testID?: string;
}) {
  const { colors } = useProfileAppearance();
  const styles = useProfileStyles(createStyles);
  return (
    <>
      <View style={styles.row}>
        <View style={styles.copy}>
          <AppText
            style={styles.label}
            color={disabled ? colors.text.secondary : colors.text.primary}
          >
            {label}
          </AppText>
          {subtitle ? (
            <AppText style={styles.caption} color={colors.text.secondary}>
              {subtitle}
            </AppText>
          ) : null}
        </View>
        <View style={styles.trailing}>
          <Switch
            accessibilityLabel={label}
            accessibilityHint={subtitle}
            testID={testID}
            value={value}
            disabled={disabled}
            onValueChange={onChange}
            trackColor={{ false: colors.surface.divider, true: colors.brand.primary }}
            thumbColor={Platform.OS === 'android' ? '#FFFFFF' : undefined}
          />
        </View>
      </View>
      {!isLast ? <View style={styles.divider} /> : null}
    </>
  );
}

export function PermissionPrivacyDetails() {
  const { colors } = useProfileAppearance();
  const styles = useProfileStyles(createStyles);
  const [expanded, setExpanded] = useState(false);
  const [documentSelection, setDocumentSelection] = useState<LegalDocumentSelection>(null);
  return (
    <>
      {([
        ['privacy', 'Политика обработки данных'],
        ['storage', 'Хранение данных и разрешения'],
        ['health', 'Форма согласия на данные о здоровье'],
        ['analytics', 'Согласие на техническую аналитику'],
      ] as const).map(([documentId, label]) => (
        <PermissionAction
          key={documentId}
          label={label}
          testID={`legal-open-${documentId}`}
          onPress={() => setDocumentSelection(documentId)}
        />
      ))}
      <LegalDocumentsModal
        selection={documentSelection}
        onClose={() => setDocumentSelection(null)}
      />
      <PermissionAction
        label="Как используются данные"
        expanded={expanded}
        onPress={() => setExpanded(!expanded)}
        isLast
      />
      <ProfileCollapse open={expanded}>
        <View style={styles.details}>
          <AppText style={styles.caption} color={colors.text.secondary}>
            В облако передаются записи и показатели. Фото и файлы документов
            остаются на устройстве.
          </AppText>
          <AppText style={styles.caption} color={colors.text.secondary}>
            Ответы Сферки включены по умолчанию. Переписку обрабатывает Yandex
            AI Studio. Доступ чата к данным здоровья требует отдельного
            согласия.
          </AppText>
          <AppText style={styles.caption} color={colors.text.secondary}>
            Анонимная аналитика помогает улучшать приложение. Её можно отключить
            независимо от чата и синхронизации.
          </AppText>
          <AppText style={styles.caption} color={colors.text.secondary}>
            Автоматические проверки плана зависят от подключения и могут
            выполняться в фоне нерегулярно. Уведомления не содержат названий
            анализов.
          </AppText>
          <AppText style={styles.caption} color={colors.text.secondary}>
            Удаление данных проверок плана не удаляет дневник, анализы,
            документы и чаты.
          </AppText>
        </View>
      </ProfileCollapse>
      <View style={styles.divider} />
      <PermissionAction
        label="Правовая информация"
        testID="legal-open-index"
        onPress={() => setDocumentSelection('index')}
        isLast
      />
    </>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  row: {
    minHeight: 64,
    paddingLeft: 14,
    paddingRight: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  copy: { flex: 1, minWidth: 0, gap: 5 },
  label: { fontSize: 17, lineHeight: 23 },
  caption: { fontSize: 14, lineHeight: 20 },
  trailing: {
    width: 52,
    minHeight: 32,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 14,
    marginRight: 18,
    backgroundColor: colors.surface.divider,
  },
  details: { paddingLeft: 14, paddingRight: 18, paddingBottom: 18, gap: 16 },
  detailItem: { gap: 4 },
});
