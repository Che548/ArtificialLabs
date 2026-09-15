import { colors as lightColors } from '../design-system/tokens';
import { fontStyle } from '../lib/font-style';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppText } from '../design-system/components';
import { useAppTheme } from '../lib/theme';
import { pregnancySizeForWeek } from '../lib/pregnancy-size';
import { AppSheet } from './AppSheet';

export function PregnancySizeLabel({ week }: { week: number }) {
  const { colors } = useAppTheme();
  const [detailsVisible, setDetailsVisible] = useState(false);
  const size = pregnancySizeForWeek(week);
  if (!size) return null;
  return (
    <View pointerEvents="box-none" style={styles.position}>
      <Pressable testID="pregnancy-week-size" accessibilityRole="button" accessibilityLabel={`${week} неделя. ${size.label}. ${size.method}`} accessibilityHint="Открыть пояснение к ориентировочному размеру" onPress={() => setDetailsVisible(true)} style={styles.label}>
        <Text maxFontSizeMultiplier={1.2} style={[styles.value, { color: lightColors.text.primary }]}>{size.label}</Text>
        <Text maxFontSizeMultiplier={1.2} style={[styles.method, { color: lightColors.text.secondary }]}>{size.method}</Text>
      </Pressable>
      <AppSheet visible={detailsVisible} onClose={() => setDetailsVisible(false)} title="Размер на этой неделе">
        <View style={styles.details}>
          <AppText>{size.label} · {week} неделя</AppText>
          <AppText>Это ориентир из справочника NHS, а не результат вашего УЗИ. Размеры ребёнка могут отличаться.</AppText>
          <AppText>До 20-й недели указана длина от головы до копчика, с 20-й — от головы до пяток. Из-за смены способа измерения число заметно увеличивается.</AppText>
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(size.source)} style={styles.source}>
            <AppText color={colors.brand.primary}>Источник: NHS ↗</AppText>
          </Pressable>
        </View>
      </AppSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  position: { position: 'absolute', top: -2, left: 0, right: 0, zIndex: 5, alignItems: 'center' },
  label: { minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12 },
  value: { ...fontStyle('SFProDisplay-Medium'), fontSize: 17, lineHeight: 21 },
  method: { ...fontStyle('SFProDisplay-Regular'), fontSize: 11, lineHeight: 15 },
  details: { gap: 16 },
  source: { minHeight: 44, justifyContent: 'center' },
});
