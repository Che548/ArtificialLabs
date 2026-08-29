export function parseResendQuotaHeader(value: string | null) {
  const match = value?.match(/^\s*(\d+)(?:\s*\/\s*(\d+))?\s*$/);
  if (!match) return {};
  const used = Number(match[1]);
  const limit = match[2] ? Number(match[2]) : undefined;
  return {
    used: Number.isSafeInteger(used) ? used : undefined,
    limit:
      limit !== undefined && Number.isSafeInteger(limit) ? limit : undefined,
  };
}
