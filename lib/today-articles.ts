import type { ImageSourcePropType } from 'react-native';
import {
  defaultTodayArticles,
  defaultArticleMarkdown,
  type TodayCardKind,
  type TodayCoverPreset,
} from '../shared/today-content';

export type TodayArticle = {
  id: string;
  cardTitle: string;
  cardKind: TodayCardKind;
  background: ImageSourcePropType;
  fallbackBackground: ImageSourcePropType;
  title: string;
  markdown: string;
};
export const todayCovers = {
  nutrition: require('../assets/today/articles/nutrition.png'),
  'care-plan': require('../assets/today/articles/care-plan.png'),
} as const;
export type PublishedTodayArticle = {
  id: string;
  cardTitle: string;
  cardKind: TodayCardKind;
  coverPreset: TodayCoverPreset;
  title: string;
  markdown: string;
  sortOrder: number;
  imageUrl: string | null;
};
export function mapTodayArticle(article: PublishedTodayArticle): TodayArticle {
  const fallbackBackground = todayCovers[article.coverPreset];
  return {
    ...article,
    background: article.imageUrl
      ? { uri: article.imageUrl }
      : fallbackBackground,
    fallbackBackground,
  };
}
export const todayArticles: readonly TodayArticle[] = defaultTodayArticles.map(
  (article) =>
    mapTodayArticle({
      ...article,
      markdown: defaultArticleMarkdown(article),
      imageUrl: null,
    }),
);
