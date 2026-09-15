import { useAppTheme, useThemeStyles, type ThemeColors } from '../lib/theme';
import { useRef } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../design-system/components';
import { colors } from '../design-system/tokens';
import type { TodayArticle } from '../lib/today-articles';
import { AppSheet } from './AppSheet';

/** Full-width article reader with the shared presentation and backdrop dismissal. */
export function TodayArticleSheet({
  article,
  onClose,
}: {
  article: TodayArticle | null;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);
  const insets = useSafeAreaInsets();
  const lastArticle = useRef(article);
  if (article) lastArticle.current = article;
  const content = article ?? lastArticle.current;
  return (
    <AppSheet
      visible={article !== null}
      title="Статья"
      onClose={onClose}
      scroll={false}
      fullWidth
      containsLiquidGlass
    >
      <View
        style={[
          styles.root,
          { paddingTop: Platform.OS === 'ios' ? 12 : insets.top },
        ]}
      >
        <ScrollView
          key={content?.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, 20) + 24 },
          ]}
        >
          {content ? (
            <>
              <AppText role="title" weight="semibold" style={styles.title}>
                {content.title}
              </AppText>
              <AppText style={styles.intro} color={colors.text.secondary}>
                {content.intro}
              </AppText>
              {content.sections.map((section) => (
                <View key={section.title} style={styles.section}>
                  <AppText
                    role="heading"
                    weight="semibold"
                    style={styles.sectionTitle}
                  >
                    {section.title}
                  </AppText>
                  <AppText style={styles.body}>{section.text}</AppText>
                </View>
              ))}
            </>
          ) : null}
        </ScrollView>
      </View>
    </AppSheet>
  );
}
const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: { flexShrink: 1, backgroundColor: colors.surface.raised },
    content: { paddingHorizontal: 24, paddingTop: 16, gap: 24 },
    title: { fontSize: 28, lineHeight: 34 },
    intro: { fontSize: 18, lineHeight: 27 },
    section: { gap: 10 },
    sectionTitle: { fontSize: 20, lineHeight: 26 },
    body: { fontSize: 17, lineHeight: 26 },
  });
