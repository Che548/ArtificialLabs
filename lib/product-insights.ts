export function calculateCompletionScore(
  plannedIds: readonly string[],
  completedIds: ReadonlySet<string>,
) {
  if (plannedIds.length === 0) return 0;
  const completed = plannedIds.filter((id) => completedIds.has(id)).length;
  return Math.round((completed / plannedIds.length) * 100);
}
