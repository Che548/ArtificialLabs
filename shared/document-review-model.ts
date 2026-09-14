import type { DocumentExtraction } from './document-policy';
import { normalizeDocumentDate } from './document-structure';
/** Unknown date lists in legacy drafts are not evidence of collection dates. */
export function documentCollectionDates(draft?: DocumentExtraction) {
  const values =
    draft?.pages.flatMap(
      (p) =>
        p.structure?.dates
          .filter((d) => d.kind === 'collection')
          .map((d) => d.text) ?? [],
    ) ?? [];
  values.push(...(draft?.analytes?.map((r) => r.date ?? '') ?? []));
  return [
    ...new Set(
      values.map(normalizeDocumentDate).filter((d): d is string => Boolean(d)),
    ),
  ];
}
export function documentReportBlocks(draft?: DocumentExtraction) {
  return (
    draft?.pages.flatMap(
      (p) =>
        p.structure?.blocks
          .filter((b) => b.kind !== 'heading')
          .map((b) => ({ ...b, page: p.page })) ?? [],
    ) ?? []
  );
}
export function documentIssueLabel(code: string) {
  return (
    (
      {
        collection_date_not_supported:
          'Дата строки не подтверждается источником',
        collection_date_requires_review: 'Уточните дату взятия материала',
        missing_observation_field: 'Заполните неразборчивые поля',
      } as Record<string, string>
    )[code] ?? code
  );
}
