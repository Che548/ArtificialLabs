import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from 'expo-symbols';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useRef, useState } from 'react';
import type {
  ComponentType,
  PropsWithChildren,
  ReactNode,
  RefObject,
} from 'react';
import {
  Platform,
  Pressable,
  Modal,
  Animated,
  Easing,
  Image,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Path, type SvgProps } from 'react-native-svg';

import { AppText, SegmentedSwitcher } from './components';
import {
  androidMaterials,
  androidShadows,
  colors,
  fonts,
  profileTones,
  radii,
  shadows,
  spacing,
} from './tokens';

const profileAvatarImage = require('../assets/profile/avatar.png');

export type ProfileTab = 'profile' | 'notifications';

type ProfileSymbolProps = {
  fallback: string;
  name: SFSymbol;
  size?: number;
  tintColor: string;
};

function ProfileSymbol({
  fallback,
  name,
  size = 19,
  tintColor,
}: ProfileSymbolProps) {
  return (
    <SymbolView
      name={name}
      size={size}
      weight="medium"
      tintColor={tintColor}
      fallback={
        <AppText
          role="label"
          weight="semibold"
          color={tintColor}
          style={styles.symbolFallback}
        >
          {fallback}
        </AppText>
      }
    />
  );
}

function ProfileChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20">
      <Path
        d={
          expanded ? 'M5.5 12.25 10 7.75l4.5 4.5' : 'M5.5 7.75 10 12.25l4.5-4.5'
        }
        fill="none"
        stroke={colors.text.primary}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ProfileCheckIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 22 22">
      <Path
        d="m4.75 11.5 4.05 4.05 8.7-9.1"
        fill="none"
        stroke={colors.brand.primary}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ProfileAnimatedCheck({ visible }: { visible: boolean }) {
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    progress.stopAnimation();
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 180 : 130,
      easing: Easing.bezier(0.23, 1, 0.32, 1),
      useNativeDriver: true,
    }).start();
  }, [progress, visible]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        opacity: progress,
        transform: [
          {
            scale: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [0.86, 1],
            }),
          },
        ],
      }}
    >
      <ProfileCheckIcon />
    </Animated.View>
  );
}

export function ProfileAccountCard({
  name,
  onPress,
  subtitle,
}: {
  name: string;
  onPress?: () => void;
  subtitle: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Открыть данные профиля"
      onPress={onPress}
      style={styles.accountCard}
    >
      <View style={styles.accountLayout}>
        <View style={styles.avatar}>
          <Image
            accessible={false}
            resizeMode="cover"
            source={profileAvatarImage}
            style={styles.avatarImage}
          />
        </View>

        <View style={styles.accountCopy}>
          <AppText role="heading" weight="semibold" numberOfLines={1}>
            {name}
          </AppText>
          <AppText
            role="label"
            color={colors.text.secondary}
            numberOfLines={2}
            style={styles.accountSubtitle}
          >
            {subtitle}
          </AppText>
        </View>

        <ProfileSymbol
          name="chevron.right"
          fallback="›"
          size={17}
          tintColor="#A9A5A4"
        />
      </View>
    </Pressable>
  );
}

export function ProfileTabControl({
  activeTab,
  onChange,
}: {
  activeTab: ProfileTab;
  onChange: (tab: ProfileTab) => void;
  unreadCount?: number;
}) {
  return (
    <SegmentedSwitcher
      accessibilityLabel="Раздел профиля"
      options={[
        { value: 'profile', label: 'Профиль' },
        { value: 'notifications', label: 'Уведомления' },
      ]}
      value={activeTab}
      onChange={onChange}
    />
  );
}

export function ProfileSettingsGroup({
  children,
  footer,
  style,
  title,
}: PropsWithChildren<{
  footer?: string;
  style?: StyleProp<ViewStyle>;
  title?: string;
}>) {
  return (
    <View style={[styles.group, style]}>
      {title ? (
        <AppText
          role="caption"
          weight="medium"
          color={colors.text.secondary}
          style={styles.groupTitle}
        >
          {title.toUpperCase()}
        </AppText>
      ) : null}
      <View style={styles.groupShadow}>
        <View style={styles.groupSurface}>{children}</View>
      </View>
      {footer ? (
        <AppText
          role="caption"
          color={colors.text.secondary}
          style={styles.groupFooter}
        >
          {footer}
        </AppText>
      ) : null}
    </View>
  );
}

export type ProfileSettingsRowProps = {
  badge?: number;
  destructive?: boolean;
  disabled?: boolean;
  fallback: string;
  icon: SFSymbol;
  iconAsset?: ComponentType<SvgProps>;
  iconBackground: string;
  iconColor?: string;
  isLast?: boolean;
  label: string;
  onPress?: () => void;
  showChevron?: boolean;
  subtitle?: string;
  trailing?: ReactNode;
  value?: string;
};

export function ProfileSettingsRow({
  badge,
  destructive = false,
  disabled = false,
  fallback,
  icon,
  iconAsset: IconAsset,
  iconBackground,
  iconColor = colors.text.inverse,
  isLast = false,
  label,
  onPress,
  showChevron = Boolean(onPress),
  subtitle,
  trailing,
  value,
}: ProfileSettingsRowProps) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={label}
      disabled={disabled || !onPress}
      onPress={onPress}
      style={[styles.settingsRow, disabled && styles.disabled]}
    >
      <View style={styles.settingsRowLayout}>
        <View
          style={[
            styles.iconTile,
            { backgroundColor: IconAsset ? 'transparent' : iconBackground },
          ]}
        >
          {IconAsset ? (
            <IconAsset
              width={24}
              height={24}
              color={destructive ? colors.state.error : colors.text.primary}
            />
          ) : (
            <ProfileSymbol
              name={icon}
              fallback={fallback}
              tintColor={iconColor}
            />
          )}
        </View>

        <View style={styles.rowBody}>
          <View style={styles.rowTextBlock}>
            <AppText
              role="body"
              weight="regular"
              color={destructive ? colors.state.error : colors.text.primary}
              numberOfLines={1}
            >
              {label}
            </AppText>
            {subtitle ? (
              <AppText
                role="caption"
                color={colors.text.secondary}
                numberOfLines={2}
                style={styles.rowSubtitle}
              >
                {subtitle}
              </AppText>
            ) : null}
          </View>

          <View style={styles.rowTrailing}>
            {value ? (
              <AppText
                role="label"
                color={colors.text.secondary}
                numberOfLines={1}
                style={styles.rowValue}
              >
                {value}
              </AppText>
            ) : null}
            {badge ? (
              <View style={styles.rowBadge}>
                <AppText
                  numeric
                  role="caption"
                  weight="semibold"
                  color={colors.text.inverse}
                >
                  {badge > 99 ? '99+' : String(badge)}
                </AppText>
              </View>
            ) : null}
            {trailing}
            {showChevron ? (
              <ProfileSymbol
                name="chevron.right"
                fallback="›"
                size={15}
                tintColor="#B6B2B1"
              />
            ) : null}
          </View>
        </View>
      </View>

      {!isLast ? <View pointerEvents="none" style={styles.rowDivider} /> : null}
    </Pressable>
  );
}

export function ProfileFieldRow({
  defaultValue,
  disabled = false,
  inputMode = 'text',
  isLast = false,
  label,
  onSubmit,
  placeholder = 'Не указано',
  suffix,
}: {
  defaultValue?: string;
  disabled?: boolean;
  inputMode?: 'text' | 'numeric' | 'email' | 'tel';
  isLast?: boolean;
  label: string;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  suffix?: string;
}) {
  const [value, setValue] = useState(defaultValue ?? '');

  return (
    <View style={[styles.formRow, disabled && styles.disabled]}>
      <AppText
        role="label"
        color={colors.text.secondary}
        style={styles.formLabel}
      >
        {label}
      </AppText>
      <View style={styles.fieldValueWrap}>
        <TextInput
          accessibilityLabel={label}
          editable={!disabled}
          value={value}
          onChangeText={setValue}
          onEndEditing={() => onSubmit?.(value.trim())}
          placeholder={placeholder}
          placeholderTextColor="#989395"
          inputMode={inputMode}
          keyboardType={
            inputMode === 'numeric'
              ? 'number-pad'
              : inputMode === 'email'
                ? 'email-address'
                : inputMode === 'tel'
                  ? 'phone-pad'
                  : 'default'
          }
          style={styles.fieldInput}
        />
        {suffix ? (
          <AppText role="label" color={colors.text.secondary}>
            {suffix}
          </AppText>
        ) : null}
      </View>
      {!isLast ? (
        <View pointerEvents="none" style={styles.formDivider} />
      ) : null}
    </View>
  );
}

function formatProfileDate(date?: Date) {
  if (!date) return 'Не указано';

  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function ProfileDateRow({
  disabled = false,
  isLast = false,
  label,
  maximumDate,
  minimumDate,
  onChange,
  value,
}: {
  disabled?: boolean;
  isLast?: boolean;
  label: string;
  maximumDate?: Date;
  minimumDate?: Date;
  onChange?: (timestamp: number) => void;
  value?: number;
}) {
  const insets = useSafeAreaInsets();
  const initialDate = value ? new Date(value) : undefined;
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(initialDate);
  const [draftDate, setDraftDate] = useState(initialDate ?? maximumDate ?? new Date());
  const [pickerVisible, setPickerVisible] = useState(false);

  useEffect(() => {
    const nextDate = value ? new Date(value) : undefined;
    setSelectedDate(nextDate);
    if (nextDate) setDraftDate(nextDate);
  }, [value]);

  const commitDate = (date: Date) => {
    setSelectedDate(date);
    setDraftDate(date);
    onChange?.(date.getTime());
  };

  const openPicker = () => {
    if (disabled) return;

    const currentDate = selectedDate ?? maximumDate ?? new Date();
    setDraftDate(currentDate);

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: currentDate,
        mode: 'date',
        display: 'default',
        maximumDate,
        minimumDate,
        onChange: (event: DateTimePickerEvent, date?: Date) => {
          if (event.type === 'set' && date) commitDate(date);
        },
      });
      return;
    }

    setPickerVisible(true);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${formatProfileDate(selectedDate)}`}
        accessibilityHint="Открывает выбор даты"
        disabled={disabled}
        onPress={openPicker}
        style={({ pressed }) => [
          styles.dateRow,
          disabled && styles.disabled,
          pressed && !disabled && styles.dateRowPressed,
        ]}
      >
        <View style={styles.dateRowContent}>
          <AppText
            role="label"
            color={colors.text.secondary}
            numberOfLines={1}
            style={styles.formLabel}
          >
            {label}
          </AppText>
          <View style={styles.dateValueWrap}>
            <AppText
              role="label"
              color={selectedDate ? colors.text.primary : '#989395'}
              numberOfLines={1}
              style={styles.dateValue}
            >
              {formatProfileDate(selectedDate)}
            </AppText>
            <ProfileSymbol
              name="calendar"
              fallback="⌄"
              size={16}
              tintColor="#A9A5A4"
            />
          </View>
        </View>
        {!isLast ? (
          <View pointerEvents="none" style={styles.formDivider} />
        ) : null}
      </Pressable>

      {Platform.OS === 'ios' && pickerVisible ? (
        <Modal
          animationType="fade"
          transparent
          visible
          onRequestClose={() => setPickerVisible(false)}
        >
          <View
            style={[
              styles.dateModalRoot,
              { paddingBottom: Math.max(insets.bottom, 12) },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Закрыть выбор даты"
              onPress={() => setPickerVisible(false)}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.dateSheet}>
              <View style={styles.dateSheetHeader}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setPickerVisible(false)}
                  hitSlop={10}
                  style={styles.dateSheetHeaderAction}
                >
                  <AppText
                    role="body"
                    color={colors.text.secondary}
                    style={styles.dateSheetHeaderActionLeft}
                  >
                    Отмена
                  </AppText>
                </Pressable>
                <AppText
                  role="body"
                  weight="semibold"
                  numberOfLines={1}
                  style={styles.dateSheetTitle}
                >
                  {label}
                </AppText>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    commitDate(draftDate);
                    setPickerVisible(false);
                  }}
                  hitSlop={10}
                  style={styles.dateSheetHeaderAction}
                >
                  <AppText
                    role="body"
                    weight="semibold"
                    color={colors.brand.primary}
                    style={styles.dateSheetHeaderActionRight}
                  >
                    Готово
                  </AppText>
                </Pressable>
              </View>
              <DateTimePicker
                value={draftDate}
                mode="date"
                display="spinner"
                locale="ru-RU"
                maximumDate={maximumDate}
                minimumDate={minimumDate}
                themeVariant="light"
                onChange={(_event, date) => {
                  if (date) setDraftDate(date);
                }}
                style={styles.datePicker}
              />
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

export function ProfileToggleRow({
  defaultValue = false,
  disabled = false,
  isLast = false,
  label,
  onChange,
  subtitle,
  testID,
  value,
}: {
  defaultValue?: boolean;
  disabled?: boolean;
  isLast?: boolean;
  label: string;
  onChange?: (value: boolean) => void;
  subtitle?: string;
  testID?: string;
  value?: boolean;
}) {
  const [localValue, setLocalValue] = useState(defaultValue);
  const controlled = typeof value === 'boolean';
  const currentValue = controlled ? value : localValue;

  return (
    <View style={[styles.toggleRow, disabled && styles.disabled]}>
      <View style={styles.toggleRowContent}>
        <View style={styles.toggleCopy}>
          <AppText role="body">{label}</AppText>
          {subtitle ? (
            <AppText
              role="caption"
              color={colors.text.secondary}
              style={styles.rowSubtitle}
            >
              {subtitle}
            </AppText>
          ) : null}
        </View>
        <View style={styles.toggleSwitchSlot}>
          <Switch
            accessibilityLabel={label}
            testID={testID}
            disabled={disabled}
            value={currentValue}
            onValueChange={(next) => {
              if (!controlled) setLocalValue(next);
              onChange?.(next);
            }}
            trackColor={{ false: '#D7D4D5', true: colors.brand.primary }}
            thumbColor={
              Platform.OS === 'android'
                ? currentValue
                  ? '#EA4087'
                  : '#FFFFFF'
                : undefined
            }
          />
        </View>
      </View>
      {!isLast ? (
        <View pointerEvents="none" style={styles.formDivider} />
      ) : null}
    </View>
  );
}

export function ProfileChoiceControl<T extends string>({
  accessibilityLabel,
  defaultValue,
  label,
  onChange,
  options,
  value,
}: {
  accessibilityLabel: string;
  defaultValue: T;
  label?: string;
  onChange?: (value: T) => void;
  options: ReadonlyArray<{ label: string; value: T }>;
  value?: T;
}) {
  const [localValue, setLocalValue] = useState(defaultValue);
  const currentValue = value ?? localValue;

  return (
    <View style={styles.choiceBlock}>
      {label ? (
        <AppText role="label" weight="medium">
          {label}
        </AppText>
      ) : null}
      <SegmentedSwitcher
        accessibilityLabel={accessibilityLabel}
        options={options}
        value={currentValue}
        onChange={(next) => {
          if (value === undefined) setLocalValue(next);
          onChange?.(next);
        }}
      />
    </View>
  );
}

export function ProfileVerticalChoiceControl<T extends string>({
  accessibilityLabel,
  defaultValue,
  disabled = false,
  grouped = false,
  label,
  onChange,
  options,
  value,
}: {
  accessibilityLabel: string;
  defaultValue: T;
  disabled?: boolean;
  grouped?: boolean;
  label?: string;
  onChange?: (value: T) => void;
  options: ReadonlyArray<{ label: string; value: T }>;
  value?: T;
}) {
  const [localValue, setLocalValue] = useState(value ?? defaultValue);

  useEffect(() => {
    if (value !== undefined) setLocalValue(value);
  }, [value]);

  const currentValue = localValue;
  const optionNodes = options.map((option, index) => {
    const selected = option.value === currentValue;
    const isLast = index === options.length - 1;

    return (
      <Pressable
        key={option.value}
        accessibilityLabel={option.label}
        accessibilityRole="radio"
        accessibilityState={{ checked: selected, disabled }}
        disabled={disabled}
        onPress={() => {
          setLocalValue(option.value);
          onChange?.(option.value);
        }}
        style={({ pressed }) => [
          grouped ? styles.groupedChoiceOption : styles.verticalChoiceOption,
          !grouped && selected && styles.verticalChoiceOptionSelected,
          grouped && pressed && styles.rowPressed,
        ]}
      >
        <View
          style={
            grouped
              ? styles.groupedChoiceOptionLayout
              : styles.verticalChoiceOptionLayout
          }
        >
          <AppText
            role="body"
            weight={!grouped && selected ? 'semibold' : 'regular'}
          >
            {option.label}
          </AppText>
          <View style={styles.verticalChoiceCheckSlot}>
            <ProfileAnimatedCheck visible={selected} />
          </View>
        </View>
        {grouped && !isLast ? (
          <View pointerEvents="none" style={styles.groupedChoiceDivider} />
        ) : null}
      </Pressable>
    );
  });

  return (
    <View
      style={[
        grouped ? styles.groupedChoiceBlock : styles.choiceBlock,
        disabled && styles.disabled,
      ]}
    >
      {label ? (
        <AppText
          role={grouped ? 'caption' : 'label'}
          weight="medium"
          color={grouped ? colors.text.secondary : colors.text.primary}
          style={grouped ? styles.groupTitle : undefined}
        >
          {grouped ? label.toUpperCase() : label}
        </AppText>
      ) : null}
      {grouped ? (
        <View style={styles.groupShadow}>
          <View
            accessibilityLabel={accessibilityLabel}
            accessibilityRole="radiogroup"
            style={styles.groupSurface}
          >
            {optionNodes}
          </View>
        </View>
      ) : (
        <View
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="radiogroup"
          style={styles.verticalChoiceList}
        >
          {optionNodes}
        </View>
      )}
    </View>
  );
}

export type ProfileLanguage = 'ru' | 'en';
export type ProfileRegion = 'ru' | 'by' | 'kz' | 'other';

const profileLanguages: ReadonlyArray<{
  value: ProfileLanguage;
  label: string;
  secondaryLabel: string;
}> = [
  { value: 'ru', label: 'Русский', secondaryLabel: 'Russian' },
  { value: 'en', label: 'English', secondaryLabel: 'Английский' },
];

const profileRegions: ReadonlyArray<{
  value: ProfileRegion;
  label: string;
  secondaryLabel: string;
}> = [
  { value: 'ru', label: 'Россия', secondaryLabel: 'Российская Федерация' },
  { value: 'by', label: 'Беларусь', secondaryLabel: 'Республика Беларусь' },
  { value: 'kz', label: 'Казахстан', secondaryLabel: 'Республика Казахстан' },
  { value: 'other', label: 'Другой регион', secondaryLabel: 'Выбрать позднее' },
];

type ProfileSelectionAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function ProfileSelectionPopover<T extends string>({
  anchor,
  closeLabel,
  onClose,
  onSelect,
  options,
  selectedValue,
}: {
  anchor: ProfileSelectionAnchor;
  closeLabel: string;
  onClose: () => void;
  onSelect: (value: T) => void;
  options: ReadonlyArray<{
    value: T;
    label: string;
    secondaryLabel: string;
  }>;
  selectedValue: T;
}) {
  const appear = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(appear, {
      toValue: 1,
      duration: 170,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
      useNativeDriver: true,
    }).start();
  }, [appear]);

  return (
    <Modal
      animationType="none"
      transparent
      statusBarTranslucent
      visible
      onRequestClose={onClose}
    >
      <View style={styles.languageModal}>
        <Pressable
          accessibilityLabel={closeLabel}
          onPress={onClose}
          style={StyleSheet.absoluteFillObject}
        />
        <Animated.View
          style={[
            styles.languagePopover,
            {
              left: anchor.x,
              top: anchor.y + anchor.height + 8,
              width: anchor.width,
              opacity: appear,
              transform: [
                {
                  translateY: appear.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-5, 0],
                  }),
                },
                {
                  scale: appear.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.975, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.languagePopoverMaterial}>
            {Platform.OS === 'android' ? (
              <>
                <BlurView
                  pointerEvents="none"
                  tint="light"
                  intensity={46}
                  experimentalBlurMethod="dimezisBlurView"
                  style={StyleSheet.absoluteFillObject}
                />
                <LinearGradient
                  pointerEvents="none"
                  colors={[
                    'rgba(255,255,255,0.92)',
                    'rgba(255,244,249,0.70)',
                  ]}
                  start={{ x: 0.1, y: 0 }}
                  end={{ x: 0.9, y: 1 }}
                  style={StyleSheet.absoluteFillObject}
                />
                <View
                  pointerEvents="none"
                  style={[
                    StyleSheet.absoluteFillObject,
                    androidMaterials.strong,
                  ]}
                />
              </>
            ) : (
              <>
                <BlurView
                  intensity={82}
                  tint="light"
                  style={StyleSheet.absoluteFillObject}
                />
                <View
                  pointerEvents="none"
                  style={styles.languagePopoverTint}
                />
              </>
            )}
            {options.map((option, index) => {
              const selected = option.value === selectedValue;
              const isLast = index === options.length - 1;

              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityLabel={`${option.label}, ${option.secondaryLabel}`}
                  accessibilityState={{ checked: selected }}
                  onPress={() => onSelect(option.value)}
                  style={({ pressed }) => [
                    styles.languageOption,
                    pressed && styles.languageOptionPressed,
                  ]}
                >
                  <View style={styles.languageOptionLayout}>
                    <AppText role="body" numberOfLines={1}>
                      {option.label}
                    </AppText>
                    <View style={styles.languageIconSlot}>
                      <ProfileAnimatedCheck visible={selected} />
                    </View>
                  </View>
                  {!isLast ? (
                    <View
                      pointerEvents="none"
                      style={styles.languageOptionDivider}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

export function ProfileLanguageSelector({
  defaultValue = 'ru',
  defaultRegion = 'ru',
  onChange,
  onRegionChange,
  regionValue,
  value,
}: {
  defaultValue?: ProfileLanguage;
  defaultRegion?: ProfileRegion;
  onChange?: (value: ProfileLanguage) => void;
  onRegionChange?: (value: ProfileRegion) => void;
  regionValue?: ProfileRegion;
  value?: ProfileLanguage;
}) {
  const regionTriggerRef = useRef<View>(null);
  const languageTriggerRef = useRef<View>(null);
  const [expanded, setExpanded] = useState<'region' | 'language' | null>(null);
  const [anchor, setAnchor] = useState<ProfileSelectionAnchor>({
    x: 16,
    y: 0,
    width: 361,
    height: 62,
  });
  const [localValue, setLocalValue] = useState(defaultValue);
  const [localRegion, setLocalRegion] = useState(defaultRegion);
  const currentValue = value ?? localValue;
  const currentRegion = regionValue ?? localRegion;
  const selectedLanguage =
    profileLanguages.find((language) => language.value === currentValue) ??
    profileLanguages[0];
  const selectedRegion =
    profileRegions.find((region) => region.value === currentRegion) ??
    profileRegions[0];

  const openPopover = (
    kind: 'region' | 'language',
    triggerRef: RefObject<View | null>,
  ) => {
    if (expanded === kind) {
      setExpanded(null);
      return;
    }

    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setExpanded(kind);
    });
  };

  return (
    <View style={styles.languageSelector}>
      <View style={styles.languageSelectorSection}>
        <AppText
          role="caption"
          weight="medium"
          color={colors.text.secondary}
          style={styles.languageLabel}
        >
          РЕГИОН
        </AppText>
        <View style={styles.groupShadow}>
          <View style={styles.groupSurface}>
            <Pressable
              ref={regionTriggerRef}
              accessibilityRole="button"
              accessibilityLabel="Выбрать регион"
              accessibilityState={{ expanded: expanded === 'region' }}
              onPress={() => openPopover('region', regionTriggerRef)}
              style={({ pressed }) => [
                styles.languageTrigger,
                pressed && styles.rowPressed,
              ]}
            >
              <View style={styles.languageTriggerLayout}>
                <AppText role="body">{selectedRegion.label}</AppText>
                <View style={styles.languageIconSlot}>
                  <ProfileChevronIcon expanded={expanded === 'region'} />
                </View>
              </View>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.languageSelectorSection}>
        <AppText
          role="caption"
          weight="medium"
          color={colors.text.secondary}
          style={styles.languageLabel}
        >
          ЯЗЫК ИНТЕРФЕЙСА
        </AppText>
        <View style={styles.groupShadow}>
          <View style={styles.groupSurface}>
            <Pressable
              ref={languageTriggerRef}
              accessibilityRole="button"
              accessibilityLabel="Выбрать язык интерфейса"
              accessibilityState={{ expanded: expanded === 'language' }}
              onPress={() => openPopover('language', languageTriggerRef)}
              style={({ pressed }) => [
                styles.languageTrigger,
                pressed && styles.rowPressed,
              ]}
            >
              <View style={styles.languageTriggerLayout}>
                <AppText role="body">{selectedLanguage.label}</AppText>
                <View style={styles.languageIconSlot}>
                  <ProfileChevronIcon expanded={expanded === 'language'} />
                </View>
              </View>
            </Pressable>
          </View>
        </View>
      </View>

      {expanded === 'region' ? (
        <ProfileSelectionPopover
          anchor={anchor}
          closeLabel="Закрыть выбор региона"
          options={profileRegions}
          selectedValue={currentRegion}
          onClose={() => setExpanded(null)}
          onSelect={(nextRegion) => {
            if (regionValue === undefined) setLocalRegion(nextRegion);
            onRegionChange?.(nextRegion);
            setExpanded(null);
          }}
        />
      ) : null}
      {expanded === 'language' ? (
        <ProfileSelectionPopover
          anchor={anchor}
          closeLabel="Закрыть выбор языка"
          options={profileLanguages}
          selectedValue={currentValue}
          onClose={() => setExpanded(null)}
          onSelect={(nextLanguage) => {
            if (value === undefined) setLocalValue(nextLanguage);
            onChange?.(nextLanguage);
            setExpanded(null);
          }}
        />
      ) : null}
    </View>
  );
}

export function ProfileActionRow({
  destructive = false,
  disabled = false,
  icon,
  label,
  onPress,
  pill = false,
  secondary = false,
  subtitle,
}: {
  destructive?: boolean;
  disabled?: boolean;
  icon?: SFSymbol;
  label: string;
  onPress: () => void;
  pill?: boolean;
  secondary?: boolean;
  subtitle?: string;
}) {
  const foreground = destructive
    ? colors.state.error
    : secondary
      ? colors.text.primary
      : colors.text.inverse;
  return (
    <View
      style={[
        styles.actionRow,
        pill && styles.actionRowPill,
        secondary && styles.actionRowSecondary,
        destructive && styles.actionRowDestructive,
        disabled && styles.disabled,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.actionPressable,
          pressed && styles.actionPressedOverlay,
        ]}
      >
        <View style={styles.actionContent}>
          {icon ? (
            <View style={styles.actionIconSlot}>
              <ProfileSymbol
                name={icon}
                fallback="+"
                size={18}
                tintColor={foreground}
              />
            </View>
          ) : null}
          <View style={styles.actionCopy}>
            <AppText
              role="body"
              weight="semibold"
              color={foreground}
              numberOfLines={2}
              style={styles.actionLabel}
            >
              {label}
            </AppText>
            {subtitle ? (
              <AppText
                role="caption"
                color={
                  destructive
                    ? '#A44A4A'
                    : secondary
                      ? colors.text.secondary
                      : 'rgba(255,255,255,0.76)'
                }
                numberOfLines={2}
                style={styles.actionSubtitle}
              >
                {subtitle}
              </AppText>
            ) : null}
          </View>
        </View>
      </Pressable>
    </View>
  );
}

export function ProfileEmptyMessage({ title }: { title: string }) {
  return (
    <View style={styles.profileEmptyMessage}>
      <AppText
        role="body"
        color={colors.text.secondary}
        style={styles.profileEmptyMessageText}
      >
        {title}
      </AppText>
    </View>
  );
}

export function ProfileEmptyState({
  description,
  icon,
  title,
}: {
  description: string;
  icon: SFSymbol;
  title: string;
}) {
  return (
    <View style={styles.profileEmptyState}>
      <View style={styles.profileEmptyIcon}>
        <ProfileSymbol name={icon} fallback="—" size={22} tintColor="#75666C" />
      </View>
      <View style={styles.profileEmptyCopy}>
        <AppText role="body" weight="medium">
          {title}
        </AppText>
        <AppText
          role="label"
          color={colors.text.secondary}
          style={styles.profileEmptyDescription}
        >
          {description}
        </AppText>
      </View>
    </View>
  );
}

export function ProfileNotificationItem({
  body,
  dateLabel,
  isLast = false,
  onPress,
  read,
  title,
}: {
  body: string;
  dateLabel: string;
  isLast?: boolean;
  onPress?: () => void;
  read: boolean;
  title: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}`}
      accessibilityState={{ selected: !read }}
      onPress={onPress}
      style={styles.notificationRow}
    >
      <View style={styles.notificationLayout}>
        <View
          style={[styles.notificationIcon, read && styles.notificationIconRead]}
        >
          <ProfileSymbol
            name={read ? 'bell' : 'bell.fill'}
            fallback="!"
            tintColor={read ? colors.text.secondary : colors.brand.primary}
            size={20}
          />
        </View>
        <View style={styles.notificationCopy}>
          <View style={styles.notificationTitleRow}>
            <AppText
              role="label"
              weight={read ? 'medium' : 'semibold'}
              numberOfLines={1}
              style={styles.notificationTitle}
            >
              {title}
            </AppText>
            {!read ? <View style={styles.unreadDot} /> : null}
          </View>
          <AppText
            role="label"
            color={colors.text.secondary}
            numberOfLines={3}
            style={styles.notificationBody}
          >
            {body}
          </AppText>
          <AppText
            role="caption"
            color="#9A9694"
            style={styles.notificationDate}
          >
            {dateLabel}
          </AppText>
        </View>
      </View>
      {!isLast ? (
        <View pointerEvents="none" style={styles.notificationDivider} />
      ) : null}
    </Pressable>
  );
}

export function ProfileEmptyNotifications() {
  return (
    <View style={styles.emptyNotifications}>
      <View style={styles.emptyIcon}>
        <ProfileSymbol
          name="bell.slash"
          fallback="—"
          tintColor={colors.brand.primary}
          size={26}
        />
      </View>
      <AppText role="heading" weight="semibold" style={styles.emptyTitle}>
        Уведомлений нет
      </AppText>
      <AppText
        role="label"
        color={colors.text.secondary}
        style={styles.emptyDescription}
      >
        Здесь появятся напоминания, результаты и системные сообщения.
      </AppText>
    </View>
  );
}

export function ProfileKitPreview() {
  return (
    <View style={styles.kitPreview}>
      <ProfileAccountCard
        name="Анна Чехова"
        subtitle="Планирование · профиль заполнен на 62%"
      />
      <ProfileTabControl
        activeTab="profile"
        unreadCount={3}
        onChange={() => undefined}
      />
      <ProfileSettingsGroup title="Здоровье">
        <ProfileSettingsRow
          icon="person.text.rectangle.fill"
          fallback="Я"
          iconBackground="#EA4087"
          label="Основная информация"
          value="Заполнено"
          isLast
        />
      </ProfileSettingsGroup>
      <ProfileSettingsGroup title="Прямое редактирование">
        <ProfileFieldRow label="Имя или псевдоним" defaultValue="Анна" />
        <ProfileDateRow
          label="Дата рождения"
          value={new Date(1996, 4, 18).getTime()}
          maximumDate={new Date()}
        />
        <ProfileFieldRow
          label="Рост"
          placeholder="Добавить"
          suffix="см"
          isLast
        />
      </ProfileSettingsGroup>
      <ProfileVerticalChoiceControl
        accessibilityLabel="Цель использования, вертикальный вариант"
        defaultValue="planning"
        label="Цель использования"
        options={[
          { value: 'planning', label: 'Планирование' },
          { value: 'pregnancy', label: 'Беременность' },
        ]}
      />
      <ProfileLanguageSelector />
      <ProfileSettingsGroup title="Уведомления">
        <ProfileToggleRow label="Результаты анализов" defaultValue isLast />
      </ProfileSettingsGroup>
      <ProfileActionRow
        icon="plus"
        label="Добавить документ"
        onPress={() => undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  symbolFallback: {
    fontSize: 15,
    lineHeight: 18,
    textAlign: 'center',
  },
  accountCard: {
    width: '100%',
    minHeight: 100,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 20,
    backgroundColor: colors.surface.raised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(35, 26, 30, 0.045)',
    shadowColor: '#32131E',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.045,
    shadowRadius: 10,
    elevation: 1,
  },
  accountLayout: {
    width: '100%',
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.99 }],
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: colors.surface.rose,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  accountCopy: {
    minWidth: 0,
    flex: 1,
  },
  accountSubtitle: {
    marginTop: 4,
  },
  tabControl: {
    width: '100%',
    height: 44,
    padding: 4,
    borderRadius: 22,
    backgroundColor: '#E5E3E5',
    flexDirection: 'row',
    gap: 4,
  },
  tabButton: {
    minWidth: 0,
    flex: 1,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  tabButtonActive: {
    backgroundColor: colors.surface.raised,
    shadowColor: '#32131E',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  tabBadge: {
    minWidth: 21,
    height: 21,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeText: {
    fontSize: 11,
    lineHeight: 13,
  },
  group: {
    width: '100%',
  },
  groupTitle: {
    marginBottom: 8,
    marginLeft: 14,
    letterSpacing: 0.35,
  },
  groupShadow: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(35, 26, 30, 0.04)',
    shadowColor: '#32131E',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.035,
    shadowRadius: 10,
    elevation: 1,
  },
  groupSurface: {
    borderRadius: 18,
    backgroundColor: colors.surface.raised,
    overflow: 'hidden',
  },
  groupFooter: {
    marginTop: 8,
    marginHorizontal: 14,
  },
  settingsRow: {
    minHeight: 56,
  },
  settingsRowLayout: {
    width: '100%',
    minHeight: 56,
    paddingLeft: 12,
    paddingRight: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowPressed: {
    backgroundColor: '#F0EDEE',
  },
  disabled: {
    opacity: 0.42,
  },
  iconTile: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    minWidth: 0,
    minHeight: 56,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowTextBlock: {
    minWidth: 0,
    flex: 1,
    paddingVertical: 10,
  },
  rowSubtitle: {
    marginTop: 2,
  },
  rowTrailing: {
    maxWidth: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 7,
  },
  rowValue: {
    flexShrink: 1,
    textAlign: 'right',
  },
  rowBadge: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 7,
    borderRadius: 12,
    backgroundColor: colors.state.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowDivider: {
    position: 'absolute',
    left: 52,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#DEDADA',
  },
  formRow: {
    minHeight: 62,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dateRow: {
    minHeight: 62,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  dateRowPressed: {
    backgroundColor: '#F4F1F2',
  },
  dateRowContent: {
    width: '100%',
    minHeight: 62,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dateValueWrap: {
    minWidth: 0,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 7,
  },
  dateValue: {
    flexShrink: 1,
    textAlign: 'right',
  },
  dateModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    backgroundColor: 'rgba(30, 22, 25, 0.14)',
  },
  dateSheet: {
    overflow: 'hidden',
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(68, 52, 58, 0.12)',
    backgroundColor: '#FFFFFF',
    paddingBottom: 4,
    shadowColor: '#261017',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 30,
    elevation: 12,
  },
  dateSheetHeader: {
    height: 52,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E7E2E4',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateSheetHeaderAction: {
    width: 72,
    height: 44,
    justifyContent: 'center',
  },
  dateSheetHeaderActionLeft: {
    textAlign: 'left',
  },
  dateSheetHeaderActionRight: {
    textAlign: 'right',
  },
  dateSheetTitle: {
    minWidth: 0,
    flex: 1,
    textAlign: 'center',
  },
  datePicker: {
    width: '100%',
    height: 216,
    transform: [{ translateX: 14 }, { translateY: -4 }],
  },
  formLabel: {
    width: '42%',
  },
  fieldValueWrap: {
    minWidth: 0,
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  fieldInput: {
    minWidth: 0,
    flex: 1,
    paddingVertical: 10,
    color: colors.text.primary,
    fontFamily: fonts.sfRegular,
    fontSize: 16,
    lineHeight: 20,
    textAlign: 'right',
  },
  formDivider: {
    position: 'absolute',
    left: 14,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E3DFE0',
  },
  toggleRow: {
    minHeight: 64,
    justifyContent: 'center',
  },
  toggleRowContent: {
    width: '100%',
    minHeight: 64,
    paddingLeft: 14,
    paddingRight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  toggleCopy: {
    minWidth: 0,
    flex: 1,
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  toggleSwitchSlot: {
    width: 52,
    height: 32,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceBlock: {
    width: '100%',
    gap: 9,
  },
  groupedChoiceBlock: {
    width: '100%',
  },
  verticalChoiceList: {
    width: '100%',
    gap: 8,
  },
  verticalChoiceOption: {
    width: '100%',
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: colors.surface.raised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(35, 26, 30, 0.07)',
  },
  verticalChoiceOptionSelected: {
    backgroundColor: '#FFF7FA',
    borderColor: 'rgba(211, 20, 113, 0.28)',
  },
  verticalChoiceOptionLayout: {
    width: '100%',
    minHeight: 52,
    paddingLeft: 16,
    paddingRight: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  groupedChoiceOption: {
    width: '100%',
    minHeight: 56,
  },
  groupedChoiceOptionLayout: {
    width: '100%',
    minHeight: 56,
    paddingLeft: 16,
    paddingRight: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  groupedChoiceDivider: {
    position: 'absolute',
    left: 16,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E3DFE0',
  },
  verticalChoiceCheckSlot: {
    width: 22,
    height: 22,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  languageSelector: {
    width: '100%',
    gap: spacing.lg,
  },
  languageSelectorSection: {
    width: '100%',
    gap: 8,
  },
  languageLabel: {
    marginLeft: 14,
    letterSpacing: 0.35,
  },
  languageTrigger: {
    width: '100%',
    minHeight: 62,
  },
  languageTriggerLayout: {
    width: '100%',
    minHeight: 62,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  languageIconSlot: {
    width: 24,
    height: 24,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  languageModal: {
    flex: 1,
  },
  languagePopover: {
    position: 'absolute',
    borderRadius: 16,
    ...(Platform.OS === 'android'
      ? androidShadows.floating
      : {
          shadowColor: '#21151A',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.16,
          shadowRadius: 26,
          elevation: 14,
        }),
  },
  languagePopoverMaterial: {
    width: '100%',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.72)',
    overflow: 'hidden',
  },
  languagePopoverTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(250,248,249,0.68)',
  },
  languageOption: {
    width: '100%',
    minHeight: 54,
  },
  languageOptionPressed: {
    backgroundColor:
      Platform.OS === 'android'
        ? 'rgba(234,64,135,0.07)'
        : 'rgba(120,112,116,0.12)',
  },
  languageOptionLayout: {
    width: '100%',
    minHeight: 54,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  languageOptionCopy: {
    minWidth: 0,
    flex: 1,
    paddingVertical: 10,
    gap: 2,
  },
  languageOptionDivider: {
    position: 'absolute',
    left: 16,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E3DFE0',
  },
  actionRow: {
    width: '100%',
    height: 56,
    paddingHorizontal: 18,
    borderRadius: 18,
    backgroundColor: colors.brand.primary,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPressable: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPressedOverlay: {
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  actionContent: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  actionRowSecondary: {
    backgroundColor: colors.surface.raised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DCD7D9',
  },
  actionRowDestructive: {
    backgroundColor: '#F7E8E8',
  },
  actionRowPill: {
    borderRadius: radii.pill,
  },
  actionCopy: {
    flexShrink: 1,
    alignItems: 'center',
    gap: 2,
  },
  actionLabel: {
    textAlign: 'center',
  },
  actionSubtitle: {
    textAlign: 'center',
  },
  actionIconSlot: {
    width: 24,
    height: 24,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileEmptyState: {
    width: '100%',
    minHeight: 92,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#ECE9EA',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  profileEmptyMessage: {
    width: '100%',
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  profileEmptyMessageText: {
    textAlign: 'center',
  },
  profileEmptyIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#E1DCDE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileEmptyCopy: {
    minWidth: 0,
    flex: 1,
  },
  profileEmptyDescription: {
    marginTop: 3,
    lineHeight: 19,
  },
  notificationRow: {
    minHeight: 116,
  },
  notificationLayout: {
    width: '100%',
    minHeight: 116,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  notificationIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FDE8F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationIconRead: {
    backgroundColor: '#F0EEEE',
  },
  notificationCopy: {
    minWidth: 0,
    flex: 1,
  },
  notificationTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  notificationTitle: {
    minWidth: 0,
    flex: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brand.primary,
  },
  notificationBody: {
    marginTop: 4,
    lineHeight: 19,
  },
  notificationDate: {
    marginTop: 7,
  },
  notificationDivider: {
    position: 'absolute',
    left: 66,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#DEDADA',
  },
  emptyNotifications: {
    minHeight: 250,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#FDE8F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    marginTop: spacing.md,
  },
  emptyDescription: {
    maxWidth: 270,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  kitPreview: {
    width: '100%',
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface.canvas,
    gap: spacing.md,
  },
});
