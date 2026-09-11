import { filterInput } from '../lib/input-format';
import { AppSheet, sheetStyles } from './AppSheet';
import { EmptyStateIcon, emptyStateColor } from './EmptyStateIcon';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Svg, { Path } from 'react-native-svg';

import { AppText } from '../design-system/components';
import { ProfileDateRow, ProfileSettingsGroup } from '../design-system/profile';
import { colors, fonts } from '../design-system/tokens';
import type { HealthGoal, LocalProfile } from '../lib/health-types';
import { profileGoalPatch } from '../lib/profile-goal';
import { PermissionAction } from './ProfilePermissionDetails';
import { ProfileCollapse, useProfileReducedMotion } from './ProfileMotion';
import { ProfileEmailEditor } from './ProfileEmailEditor';

const goals: ReadonlyArray<{
  value: HealthGoal;
  title: string;
  description: string;
}> = [
  {
    value: 'planning',
    title: 'Планирование',
    description: 'Подготовка к беременности',
  },
  {
    value: 'pregnancy',
    title: 'Беременность',
    description: 'Наблюдение во время беременности',
  },
  { value: 'cycle', title: 'Мониторинг', description: 'Цикл и самочувствие' },
];

export function ProfileAccountDetails({
  profile,
  readOnly,
  saveProfile,
}: {
  profile: LocalProfile | null;
  readOnly: boolean;
  saveProfile: (
    input: Partial<Omit<LocalProfile, 'updatedAt'>>,
  ) => Promise<void>;
}) {
  const accountQueue = useRef(Promise.resolve());
  const accountEdits = useRef<Partial<Omit<LocalProfile, 'updatedAt'>>>({});
  const latestAccountSave = useRef(saveProfile);
  latestAccountSave.current = saveProfile;
  const persistAccount = (patch: Partial<Omit<LocalProfile, 'updatedAt'>>) => {
    if (readOnly) return Promise.resolve();
    const operation = accountQueue.current.then(async () => {
      const next = { ...accountEdits.current, ...patch };
      await latestAccountSave.current(next);
      accountEdits.current = next;
    });
    accountQueue.current = operation.catch(() => {});
    return operation;
  };
  return (
    <>
      {profile ? (
        <PersonalDetails
          profile={profile}
          readOnly={readOnly}
          saveProfile={persistAccount}
        />
      ) : null}
      {!profile ? (
        <View style={{ alignItems: 'center', paddingVertical: 24 }}>
          <EmptyStateIcon kind="profile" />
          <AppText style={styles.caption} color={emptyStateColor}>
            Данные профиля пока недоступны.
          </AppText>
        </View>
      ) : null}
    </>
  );
}

export function ProfileContacts({
  email,
  phone,
  phoneEditor,
  readOnly,
}: {
  email?: string;
  phone?: string;
  phoneEditor: ReactNode;
  readOnly: boolean;
}) {
  const [editingPhone, setEditingPhone] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [updatedEmail, setUpdatedEmail] = useState<string>();
  return (
    <ProfileSettingsGroup title="Контакты для входа">
      <PermissionAction
        label="Электронная почта"
        subtitle={updatedEmail ?? email ?? 'Не указана'}
        expanded={editingEmail}
        disabled={readOnly}
        onPress={() => {
          setEditingEmail(!editingEmail);
          setEditingPhone(false);
        }}
        isLast={editingEmail}
      />
      <ProfileCollapse open={editingEmail}>
        <ProfileEmailEditor
          currentEmail={updatedEmail ?? email}
          disabled={readOnly}
          onDone={(value) => {
            setUpdatedEmail(value);
            setEditingEmail(false);
          }}
        />
      </ProfileCollapse>
      {phone ? (
        <View style={styles.securityContact}>
          <AppText style={styles.caption} color={colors.text.secondary}>
            Телефон
          </AppText>
          <Text selectable style={[styles.value, styles.contactValue]}>
            {phone}
          </Text>
        </View>
      ) : (
        <>
          <PermissionAction
            label="Добавить телефон"
            subtitle="Для входа и восстановления доступа"
            expanded={editingPhone}
            disabled={readOnly}
            onPress={() => {
              setEditingPhone(!editingPhone);
              setEditingEmail(false);
            }}
            isLast
          />
          <ProfileCollapse open={editingPhone}>{phoneEditor}</ProfileCollapse>
        </>
      )}
    </ProfileSettingsGroup>
  );
}

function PersonalDetails({
  profile,
  readOnly,
  saveProfile,
}: {
  profile: LocalProfile;
  readOnly: boolean;
  saveProfile: (
    patch: Partial<Omit<LocalProfile, 'updatedAt'>>,
  ) => Promise<void>;
}) {
  const [birthDate, setBirthDate] = useState(profile.birthDate);
  const [dateError, setDateError] = useState<string>();
  return (
    <ProfileSettingsGroup title="Личные данные">
      <PersonalField
        label="Имя или псевдоним"
        initialValue={profile.displayName}
        disabled={readOnly}
        validate={(value) =>
          value.trim() ? undefined : 'Укажите имя или псевдоним.'
        }
        onSave={(value) => saveProfile({ displayName: value.trim() })}
      />
      <View style={styles.divider} />
      <ProfileDateRow
        stacked
        compact
        label="Дата рождения"
        value={birthDate}
        minimumDate={new Date(1900, 0, 1)}
        maximumDate={new Date()}
        disabled={readOnly}
        isLast
        onChange={(value) => {
          setBirthDate(value);
          setDateError(undefined);
          void saveProfile({ birthDate: value }).catch(() => {
            setDateError('Не удалось сохранить дату. Выберите её ещё раз.');
          });
        }}
      />
      {dateError ? (
        <View style={styles.fieldError} accessibilityRole="alert">
          <AppText style={styles.caption} color={colors.state.error}>
            {dateError}
          </AppText>
        </View>
      ) : null}
      <View style={styles.divider} />
      <PersonalField
        label="Рост"
        suffix="см"
        initialValue={
          profile.heightCm === undefined ? '' : String(profile.heightCm)
        }
        disabled={readOnly}
        validate={(value) =>
          /^\d+(?:[.,]\d+)?$/.test(value) &&
          Number(value.replace(',', '.')) >= 80 &&
          Number(value.replace(',', '.')) <= 250
            ? undefined
            : 'Укажите рост от 80 до 250 см.'
        }
        onSave={(value) =>
          saveProfile({ heightCm: Number(value.replace(',', '.')) })
        }
      />
      <View style={styles.divider} />
      <PersonalField
        label="Вес"
        suffix="кг"
        initialValue={
          profile.weightKg === undefined ? '' : String(profile.weightKg)
        }
        disabled={readOnly}
        validate={(value) =>
          /^\d+(?:[.,]\d+)?$/.test(value) &&
          Number(value.replace(',', '.')) >= 20 &&
          Number(value.replace(',', '.')) <= 400
            ? undefined
            : 'Укажите вес от 20 до 400 кг.'
        }
        onSave={(value) =>
          saveProfile({ weightKg: Number(value.replace(',', '.')) })
        }
      />
    </ProfileSettingsGroup>
  );
}

function PersonalField({
  label,
  suffix,
  initialValue,
  disabled,
  validate,
  onSave,
}: {
  label: string;
  suffix?: string;
  initialValue: string;
  disabled: boolean;
  validate: (value: string) => string | undefined;
  onSave: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string>();
  const saved = useRef(initialValue);
  const revision = useRef(0);
  const persist = async () => {
    const next = value.trim();
    if (disabled || next === saved.current) return;
    const currentRevision = ++revision.current;
    const issue = validate(next);
    setError(issue);
    if (issue) return;
    try {
      await onSave(next);
      saved.current = next;
    } catch {
      if (currentRevision === revision.current)
        setError('Не удалось сохранить. Попробуйте ещё раз.');
    }
  };
  return (
    <View style={styles.compactField}>
      <AppText style={styles.caption} color={colors.text.secondary}>
        {label}
      </AppText>
      <View
        style={[
          styles.inputRow,
          !error && styles.unlinedInputRow,
          error && styles.inputError,
        ]}
      >
        <TextInput
          accessibilityLabel={label}
          editable={!disabled}
          value={value}
          onChangeText={(next) => {
            ++revision.current;
            setValue(filterInput(next, suffix ? 'decimal' : 'name'));
            setError(undefined);
          }}
          onEndEditing={() => void persist()}
          keyboardType={suffix ? 'decimal-pad' : 'default'}
          autoCapitalize={suffix ? 'none' : 'words'}
          placeholder="Не указано"
          placeholderTextColor={colors.text.secondary}
          style={styles.input}
        />
        {suffix ? (
          <AppText style={styles.value} color={colors.text.secondary}>
            {suffix}
          </AppText>
        ) : null}
      </View>
      {error ? (
        <View accessibilityRole="alert">
          <AppText style={styles.caption} color={colors.state.error}>
            {error}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

export function ProfileGoalSettings({
  profile,
  readOnly,
  saveProfile,
}: {
  profile: LocalProfile;
  readOnly: boolean;
  saveProfile: (
    input: Partial<Omit<LocalProfile, 'updatedAt'>>,
  ) => Promise<void>;
}) {
  const [goal, setGoal] = useState(profile.goal);
  const [pendingGoal, setPendingGoal] = useState<HealthGoal>();
  const [activeGoal, setActiveGoal] = useState(profile.goal);
  const [cycleLength, setCycleLength] = useState(
    String(profile.cycleLengthDays ?? ''),
  );
  const [periodDate, setPeriodDate] = useState(profile.lastPeriodStartAt);
  const [pregnancyDate, setPregnancyDate] = useState(profile.pregnancyStartAt);
  const [error, setError] = useState<string>();
  const [cycleError, setCycleError] = useState<string>();
  const pregnancy = goal === 'pregnancy';
  const disabled = readOnly;
  const saveQueue = useRef(Promise.resolve());
  const latestSave = useRef(saveProfile);
  latestSave.current = saveProfile;
  const edits = useRef<Partial<Omit<LocalProfile, 'updatedAt'>>>({});
  const revision = useRef(0);

  // Only complete goals enter the write queue. A newer choice cancels writes
  // that have not started; successful earlier fields survive later writes.
  const persistGoal = (
    target: HealthGoal,
    length = cycleLength,
    period = periodDate,
    start = pregnancyDate,
  ) => {
    if (readOnly) return;
    const currentRevision = ++revision.current;
    setError(undefined);
    const patch = profileGoalPatch(target, length, period, start);
    if (!patch) return;
    saveQueue.current = saveQueue.current.then(async () => {
      if (currentRevision !== revision.current) return;
      const next = { ...edits.current, ...patch };
      try {
        await latestSave.current(next);
        edits.current = next;
        setActiveGoal(target);
        if (currentRevision === revision.current) setError(undefined);
      } catch {
        if (currentRevision === revision.current) {
          setError(
            'Не удалось сохранить изменение. Выберите или введите значение ещё раз.',
          );
        }
      }
    });
  };

  const changeCycleLength = (value: string) => {
    const digits = filterInput(value, 'integer');
    setCycleLength(digits);
    setCycleError(undefined);
    persistGoal(goal, digits);
  };

  const validateCycleLength = () => {
    if (readOnly) return;
    const days = Number(cycleLength);
    if (!/^\d+$/.test(cycleLength) || days < 20 || days > 45) {
      setCycleError('Введите целое число от 20 до 45 дней.');
    }
  };

  return (
    <>
      {pendingGoal ? (
        <GoalChangeModal
          key={pendingGoal}
          goal={pendingGoal}
          onCancel={() => setPendingGoal(undefined)}
          onActivate={async (patch) => {
            if (readOnly) throw new Error('Read-only profile');
            ++revision.current;
            await saveQueue.current;
            const next = { ...edits.current, ...patch };
            await latestSave.current(next);
            edits.current = next;
            setGoal(pendingGoal);
            setActiveGoal(pendingGoal);
            if (patch.pregnancyStartAt !== undefined)
              setPregnancyDate(patch.pregnancyStartAt);
            if (patch.lastPeriodStartAt !== undefined)
              setPeriodDate(patch.lastPeriodStartAt);
            if (patch.cycleLengthDays !== undefined)
              setCycleLength(String(patch.cycleLengthDays));
            setCycleError(undefined);
            setError(undefined);
          }}
        />
      ) : null}
      <ProfileSettingsGroup title="Цель использования">
        {goals.map((option, index) => (
          <View key={option.value}>
            {index > 0 ? <View style={styles.divider} /> : null}
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{
                checked: activeGoal === option.value,
                disabled,
              }}
              accessibilityLabel={`${option.title}. ${option.description}`}
              disabled={disabled}
              onPress={() => {
                if (option.value !== activeGoal) setPendingGoal(option.value);
              }}
              style={styles.goalRow}
            >
              <View style={styles.copy}>
                <AppText weight="regular" style={styles.value}>
                  {option.title}
                </AppText>
                <AppText style={styles.caption} color={colors.text.secondary}>
                  {option.description}
                </AppText>
              </View>
              <View
                style={[
                  styles.radio,
                  activeGoal === option.value && styles.radioSelected,
                ]}
              >
                {activeGoal === option.value ? (
                  <Svg width={16} height={16} viewBox="0 0 16 16">
                    <Path
                      d="m3.5 8 3 3 6-6"
                      stroke="white"
                      strokeWidth={1.8}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </Svg>
                ) : null}
              </View>
            </Pressable>
          </View>
        ))}
      </ProfileSettingsGroup>
      <ProfileSettingsGroup
        title={
          pregnancy
            ? 'Беременность'
            : goal === 'planning'
              ? 'Планирование'
              : 'Мониторинг'
        }
        footer={
          !profileGoalPatch(goal, cycleLength, periodDate, pregnancyDate)
            ? pregnancy
              ? 'Чтобы включить эту цель, укажите дату начала беременности.'
              : 'Чтобы включить эту цель, укажите первый день последней менструации и среднюю длину цикла.'
            : undefined
        }
      >
        {!pregnancy ? (
          <>
            <View style={styles.compactField}>
              <AppText style={styles.caption} color={colors.text.secondary}>
                Средняя длина цикла
              </AppText>
              <View
                style={[
                  styles.inputRow,
                  !cycleError && styles.unlinedInputRow,
                  cycleError && styles.inputError,
                ]}
              >
                <TextInput
                  accessibilityLabel="Средняя длина цикла, дней"
                  editable={!disabled}
                  inputMode="numeric"
                  keyboardType="number-pad"
                  value={cycleLength}
                  onChangeText={changeCycleLength}
                  onEndEditing={validateCycleLength}
                  placeholder="Не указана"
                  placeholderTextColor={colors.text.secondary}
                  maxLength={3}
                  style={styles.input}
                />
                <AppText style={styles.value} color={colors.text.secondary}>
                  дней
                </AppText>
              </View>
              {cycleError ? (
                <View accessibilityRole="alert">
                  <AppText style={styles.caption} color={colors.state.error}>
                    {cycleError}
                  </AppText>
                </View>
              ) : null}
            </View>
            <View style={styles.divider} />
          </>
        ) : null}
        <ProfileDateRow
          stacked
          compact
          label={
            pregnancy
              ? 'Дата начала беременности'
              : 'Первый день последней менструации'
          }
          value={pregnancy ? pregnancyDate : periodDate}
          maximumDate={new Date()}
          disabled={disabled}
          isLast
          onChange={(date) => {
            if (pregnancy) {
              setPregnancyDate(date);
              persistGoal(goal, cycleLength, periodDate, date);
            } else {
              setPeriodDate(date);
              persistGoal(goal, cycleLength, date, pregnancyDate);
            }
          }}
        />
      </ProfileSettingsGroup>
      {error ? (
        <View accessibilityRole="alert">
          <AppText style={styles.caption} color={colors.state.error}>
            {error}
          </AppText>
        </View>
      ) : null}
    </>
  );
}

function GoalChangeModal({
  goal,
  onCancel,
  onActivate,
}: {
  goal: HealthGoal;
  onCancel: () => void;
  onActivate: (
    patch: Partial<Omit<LocalProfile, 'updatedAt'>>,
  ) => Promise<void>;
}) {
  const [visible, setVisible] = useState(true);
  const closeModal = () => setVisible(false);
  const pregnancy = goal === 'pregnancy';
  // Every switch starts with fresh input, including a return to an earlier goal.
  const [date, setDate] = useState<number>();
  const [length, setLength] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submitting = useRef(false);
  const dismissed = useRef(false);
  const cancel = () => {
    if (submitting.current) return;
    dismissed.current = true;
    closeModal();
  };
  const activate = async (
    selectedDate: number | undefined,
    selectedLength: string,
  ) => {
    const patch = profileGoalPatch(
      goal,
      selectedLength,
      pregnancy ? undefined : selectedDate,
      pregnancy ? selectedDate : undefined,
    );
    if (!patch || submitting.current || dismissed.current) return;
    submitting.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await onActivate(patch);
      dismissed.current = true;
      closeModal();
    } catch {
      setError('Не удалось изменить цель. Попробуйте ещё раз.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  const draftDate = date ?? new Date().setHours(0, 0, 0, 0);
  const validLength =
    /^\d+$/.test(length) && Number(length) >= 20 && Number(length) <= 45;
  const canActivate = !busy && (pregnancy || validLength);
  return (
    <AppSheet
      visible={visible}
      onClosed={onCancel}
      title={
        goals.find((option) => option.value === goal)?.title ??
        'Цель использования'
      }
      onClose={cancel}
      dismissDisabled={busy}
      footer={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Подтвердить цель использования"
          accessibilityState={{ disabled: !canActivate, busy }}
          disabled={!canActivate}
          onPress={() => void activate(draftDate, length)}
          style={[
            sheetStyles.primary,
            !canActivate && styles.goalConfirmDisabled,
          ]}
        >
          <AppText
            style={styles.value}
            color={canActivate ? '#FFFFFF' : colors.text.secondary}
          >
            {busy ? 'Сохраняем…' : 'Готово'}
          </AppText>
        </Pressable>
      }
    >
      <View pointerEvents={busy ? 'none' : 'auto'} style={styles.modalFields}>
        <AppText style={styles.caption} color={colors.text.secondary}>
          {pregnancy
            ? 'Дата начала беременности'
            : 'Первый день последней менструации'}
        </AppText>
        <DateTimePicker
          value={new Date(draftDate)}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          locale="ru-RU"
          themeVariant="light"
          maximumDate={new Date()}
          style={styles.goalDatePicker}
          onChange={(event, value) => {
            if (event.type === 'set' && value) {
              setDate(value.getTime());
              setError(undefined);
            }
          }}
        />
        {!pregnancy ? (
          <View style={styles.goalCycleField}>
            <AppText style={styles.caption} color={colors.text.secondary}>
              Средняя длина цикла
            </AppText>
            <View style={styles.goalCycleInputRow}>
              <TextInput
                accessibilityLabel="Средняя длина цикла, дней"
                editable={!busy}
                inputMode="numeric"
                keyboardType="number-pad"
                placeholder="20–45"
                placeholderTextColor={colors.text.secondary}
                maxLength={2}
                style={[styles.input, { flex: 1 }]}
                value={length}
                onChangeText={(value) => {
                  setLength(filterInput(value, 'integer'));
                  setError(undefined);
                }}
              />
              <AppText style={styles.value} color={colors.text.secondary}>
                дней
              </AppText>
            </View>
          </View>
        ) : null}
      </View>
      {error ? (
        <View accessibilityRole="alert">
          <AppText style={styles.caption} color={colors.state.error}>
            {error}
          </AppText>
        </View>
      ) : null}
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  fieldError: { paddingHorizontal: 18, paddingBottom: 16 },
  modalFields: {
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 16,
    overflow: 'hidden',
  },
  goalDatePicker: { height: 216, width: '100%' },
  goalCycleField: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.divider,
    paddingVertical: 14,
    gap: 4,
  },
  goalCycleInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    gap: 12,
  },
  goalConfirmDisabled: sheetStyles.disabled,
  securityContact: {
    paddingLeft: 14,
    paddingRight: 18,
    paddingVertical: 16,
    gap: 4,
  },
  securityDivider: {
    marginLeft: 14,
    marginRight: 18,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.surface.divider,
  },
  contact: { paddingHorizontal: 18, paddingVertical: 16, gap: 7 },
  compactField: { paddingHorizontal: 18, paddingVertical: 12, gap: 2 },
  unlinedInputRow: { borderBottomWidth: 0 },
  contactAction: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  contactValue: { fontFamily: fonts.sfRegular, color: colors.text.primary },
  value: { fontSize: 17, lineHeight: 23 },
  caption: { fontSize: 14, lineHeight: 20 },
  actionText: { fontSize: 16, lineHeight: 22 },
  divider: {
    marginHorizontal: 18,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#DEDADA',
  },
  goalRow: {
    minHeight: 80,
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#D6D0D2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    backgroundColor: colors.brand.primary,
    borderColor: colors.brand.primary,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface.divider,
  },
  inputError: { borderBottomColor: colors.state.error },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    paddingVertical: 8,
    fontSize: 20,
    lineHeight: 26,
    fontFamily: fonts.sfMedium,
    color: colors.text.primary,
  },
});
