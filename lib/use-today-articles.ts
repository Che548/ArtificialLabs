import { useEffect, useState } from 'react';
import { api } from '../convex/_generated/api';
import { convex } from './convex';
import {
  todayArticles,
  mapTodayArticle,
  type TodayArticle,
  type PublishedTodayArticle,
} from './today-articles';
import {
  readTodayContentCache,
  writeTodayContentCache,
} from './today-content-cache';
import { parseArticleMarkdown } from '../shared/article-markdown';
import { TODAY_ARTICLE_LIMIT } from '../shared/today-content';

let lastArticles: readonly TodayArticle[] | undefined;
function decode(value: unknown): readonly TodayArticle[] | undefined {
  if (value === null) return todayArticles;
  if (!Array.isArray(value) || value.length > TODAY_ARTICLE_LIMIT) return;
  try {
    return value.map((article: PublishedTodayArticle) => {
      if (
        !article ||
        !['nutrition', 'care-plan'].includes(article.coverPreset) ||
        !['article', 'care-plan'].includes(article.cardKind) ||
        typeof article.id !== 'string' ||
        typeof article.title !== 'string' ||
        typeof article.cardTitle !== 'string' ||
        typeof article.markdown !== 'string' ||
        (article.imageUrl !== null &&
          (typeof article.imageUrl !== 'string' ||
            !article.imageUrl.startsWith('https://')))
      )
        throw new Error('INVALID_PUBLIC_CONTENT');
      parseArticleMarkdown(article.markdown);
      return mapTodayArticle(article);
    });
  } catch {
    return;
  }
}

export function useTodayArticles() {
  const [articles, setArticles] = useState(lastArticles ?? todayArticles);
  useEffect(() => {
    let active = true;
    let received = false;
    void readTodayContentCache().then((value) => {
      const cached = decode(value);
      if (active && !received && cached) setArticles((lastArticles = cached));
    });
    const watch = convex.watchQuery(api.todayContent.published, {});
    const update = () => {
      try {
        const value = watch.localQueryResult();
        const next = decode(value);
        if (active && next) {
          received = true;
          setArticles((lastArticles = next));
          writeTodayContentCache(value);
        }
      } catch {
        /* Offline or older server: keep the last public content. */
      }
    };
    const unsubscribe = watch.onUpdate(update);
    update();
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  return articles;
}
