import { useThemeStyles, type ThemeColors } from '../lib/theme';
import { useRef } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../design-system/components';
import type { TodayArticle } from '../lib/today-articles';
import { SheetHeader } from './AppSheet';
import { TodayArticleBody } from './TodayArticleBody';
import { useProfileReducedMotion } from './ProfileMotion';

/** Native iPhone sheet: full width, system upward presentation and swipe dismissal. */
export function TodayArticleSheet({
  article,
  onClose,
}: {
  article: TodayArticle | null;
  onClose: () => void;
}) {
  const styles = useThemeStyles(createStyles);
  const insets = useSafeAreaInsets();
  const reduceMotion = useProfileReducedMotion();
  const lastArticle = useRef(article);
  if (article) lastArticle.current = article;
  const content = article ?? lastArticle.current;
  return (
    <Modal
      visible={article !== null}
      presentationStyle="pageSheet"
      animationType={reduceMotion ? 'none' : 'slide'}
      allowSwipeDismissal
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.root,
          { paddingTop: Platform.OS === 'ios' ? 12 : insets.top },
        ]}
      >
        <SheetHeader title="Статья" onClose={onClose} />
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
              <TodayArticleBody markdown={content.markdown} />
            </>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}
const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.surface.raised },
    content: { paddingHorizontal: 24, paddingTop: 16, gap: 24 },
    title: { fontSize: 28, lineHeight: 34 },
  });
