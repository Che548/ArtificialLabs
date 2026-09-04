import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { AppText } from './components';
import { colors, motion, radii, shadows, spacing } from './tokens';

export type AnalysisKnowledgeItem = {
  id: string;
  category: string;
  duration: string;
  image: ImageSourcePropType;
  summary: string;
  title: string;
  tone: string;
};

export function AnalysisKnowledgeCarousel({
  items,
  onPress,
}: {
  items: AnalysisKnowledgeItem[];
  onPress?: (item: AnalysisKnowledgeItem) => void;
}) {
  const listRef = useRef<FlatList<AnalysisKnowledgeItem>>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [cardWidth, setCardWidth] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (reduceMotion || cardWidth <= 0 || items.length < 2) return undefined;

    const timer = setInterval(() => {
      const nextIndex = (activeIndex + 1) % items.length;
      listRef.current?.scrollToOffset({
        animated: true,
        offset: nextIndex * cardWidth,
      });
      setActiveIndex(nextIndex);
    }, 4600);

    return () => clearInterval(timer);
  }, [activeIndex, cardWidth, items.length, reduceMotion]);

  const finishScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!cardWidth) return;
    setActiveIndex(
      Math.max(
        0,
        Math.min(
          items.length - 1,
          Math.round(event.nativeEvent.contentOffset.x / cardWidth),
        ),
      ),
    );
  };

  return (
    <View style={styles.knowledgeBlock}>
      <View style={styles.knowledgeHeader}>
        <AppText role="heading" weight="semibold">
          Полезно знать
        </AppText>
        <AppText numeric role="caption" color={colors.text.secondary}>
          {activeIndex + 1} / {items.length}
        </AppText>
      </View>

      <View
        style={styles.carouselViewport}
        onLayout={(event) => setCardWidth(event.nativeEvent.layout.width)}
      >
        {cardWidth > 0 ? (
          <FlatList
            ref={listRef}
            horizontal
            pagingEnabled
            bounces={false}
            data={items}
            decelerationRate="fast"
            keyExtractor={(item) => item.id}
            onMomentumScrollEnd={finishScroll}
            showsHorizontalScrollIndicator={false}
            getItemLayout={(_data, index) => ({
              index,
              length: cardWidth,
              offset: cardWidth * index,
            })}
            renderItem={({ item }) => (
              <View style={{ width: cardWidth }}>
                <Pressable
                  cssInterop={false}
                  accessibilityRole="button"
                  accessibilityLabel={item.title}
                  onPress={() => onPress?.(item)}
                  style={({ pressed }) => [
                    styles.knowledgeCard,
                    { backgroundColor: item.tone },
                    pressed && styles.pressed,
                  ]}
                >
                  <Image
                    source={item.image}
                    resizeMode="contain"
                    style={styles.knowledgeImage}
                  />
                  <LinearGradient
                    pointerEvents="none"
                    colors={[
                      item.tone,
                      item.tone,
                      `${item.tone}E8`,
                      `${item.tone}28`,
                    ]}
                    locations={[0, 0.42, 0.66, 1]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={StyleSheet.absoluteFill}
                  />

                  <View style={styles.knowledgeCopy}>
                    <AppText
                      role="caption"
                      weight="semibold"
                      color={colors.brand.primary}
                      style={styles.knowledgeCategory}
                    >
                      {item.category.toUpperCase()}
                    </AppText>
                    <AppText
                      role="heading"
                      weight="semibold"
                      numberOfLines={3}
                      style={styles.knowledgeTitle}
                    >
                      {item.title}
                    </AppText>
                    <AppText
                      role="caption"
                      color={colors.text.secondary}
                      numberOfLines={3}
                      style={styles.knowledgeSummary}
                    >
                      {item.summary}
                    </AppText>
                    <View style={styles.knowledgeFooter}>
                      <AppText role="caption" color={colors.text.secondary}>
                        {item.duration}
                      </AppText>
                      <View style={styles.knowledgeArrow}>
                        <AppText role="body" color={colors.brand.primary}>
                          →
                        </AppText>
                      </View>
                    </View>
                  </View>
                </Pressable>
              </View>
            )}
          />
        ) : null}
      </View>

      <View style={styles.pagination}>
        {items.map((item, index) => (
          <View
            key={item.id}
            style={[
              styles.paginationDot,
              index === activeIndex && styles.paginationDotActive,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

export function AnalysisCountsBlock({
  completed,
  missed,
  upcoming,
}: {
  completed: number;
  missed: number;
  upcoming: number;
}) {
  const items = [
    { label: 'Ближайшие', value: upcoming, color: colors.brand.primary },
    { label: 'Пропущено', value: missed, color: colors.state.error },
    { label: 'Сдано', value: completed, color: colors.brand.success },
  ];

  return (
    <View style={styles.countsBlock}>
      {items.map((item, index) => (
        <View key={item.label} style={styles.countCell}>
          {index > 0 ? <View style={styles.countDivider} /> : null}
          <AppText
            numeric
            role="title"
            weight="medium"
            color={item.color}
          >
            {item.value}
          </AppText>
          <AppText role="caption" color={colors.text.secondary}>
            {item.label}
          </AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: motion.pressedOpacity,
    transform: [{ scale: 0.994 }],
  },
  knowledgeBlock: {
    width: '100%',
  },
  knowledgeHeader: {
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  carouselViewport: {
    width: '100%',
    height: 208,
    overflow: 'hidden',
    borderRadius: 28,
  },
  knowledgeCard: {
    width: '100%',
    height: 208,
    overflow: 'hidden',
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(46,31,38,0.05)',
    ...shadows.card,
  },
  knowledgeImage: {
    position: 'absolute',
    top: 4,
    right: -18,
    width: '58%',
    height: '100%',
  },
  knowledgeCopy: {
    width: '64%',
    height: '100%',
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  knowledgeCategory: {
    letterSpacing: 0.45,
  },
  knowledgeTitle: {
    marginTop: 7,
  },
  knowledgeSummary: {
    marginTop: 7,
    lineHeight: 16,
  },
  knowledgeFooter: {
    marginTop: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  knowledgeArrow: {
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pagination: {
    height: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  paginationDot: {
    width: 5,
    height: 5,
    borderRadius: radii.pill,
    backgroundColor: '#D8D3D5',
  },
  paginationDotActive: {
    width: 18,
    backgroundColor: colors.brand.primary,
  },
  countsBlock: {
    width: '100%',
    height: 94,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(46,31,38,0.06)',
    backgroundColor: colors.surface.raised,
    flexDirection: 'row',
    ...shadows.card,
  },
  countCell: {
    position: 'relative',
    minWidth: 0,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  countDivider: {
    position: 'absolute',
    left: 0,
    top: 19,
    bottom: 19,
    width: StyleSheet.hairlineWidth,
    backgroundColor: '#E6E1E3',
  },
});
