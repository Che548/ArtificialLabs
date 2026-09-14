// Synthetic in-memory CMS fixture. No requests, auth tokens or production writes.
import { useSyncExternalStore } from 'react';
import {
  defaultTodayArticles,
  defaultArticleMarkdown,
} from '../../shared/today-content';
let revision = 0;
let initialized = !new URL(location.href).searchParams
  .get('fixture')
  ?.includes('uninitialized');
const listeners = new Set<() => void>();
let rows: any[] = defaultTodayArticles.map((article, i) => {
  const version = {
    ...article,
    _id: `version-${i}`,
    version: 1,
    status: 'published',
    markdown: defaultArticleMarkdown(article),
  };
  return {
    _id: `article-${i}`,
    key: article.id,
    updatedAt: i + 1,
    currentPublishedVersionId: version._id,
    latestVersion: version,
    publishedVersion: version,
  };
});
export function useTodayFixture() {
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => revision,
  );
}
export function todayQuery(name: string) {
  if (name === 'todayContent:status') return { initialized };
  return undefined;
}
export function todayRows() {
  return initialized ? rows : [];
}
export async function todayMutation(name: string, args: any) {
  if (!name.startsWith('todayContent:'))
    throw new Error('Writes disabled in UI fixture');
  if (new URL(location.href).searchParams.get('fixture') === 'content-fail')
    throw new Error('Fixture offline');
  let result: any;
  if (name === 'todayContent:initialize') initialized = true;
  if (name === 'todayContent:save') {
    let row = rows.find((row) => row._id === args.itemId);
    if (!row) {
      row = {
        _id: `article-new-${rows.length}`,
        key: `new-${rows.length}`,
        updatedAt: 1,
      };
      rows = [...rows, row];
    }
    const version = {
      ...args,
      _id: `version-${revision}`,
      version: (row.latestVersion?.version ?? 0) + 1,
      status: args.publish ? 'published' : 'draft',
    };
    row.latestVersion = version;
    row.updatedAt++;
    if (args.publish) {
      row.publishedVersion = version;
      row.currentPublishedVersionId = version._id;
    }
    result = { itemId: row._id, version: version.version };
  }
  if (name === 'todayContent:remove') {
    if (args.delete) rows = rows.filter((row) => row._id !== args.itemId);
    else {
      const row = rows.find((row) => row._id === args.itemId);
      row.currentPublishedVersionId = undefined;
      row.publishedVersion = null;
      row.latestVersion.status = 'unpublished';
      row.updatedAt++;
    }
  }
  revision++;
  listeners.forEach((fn) => fn());
  return result;
}
