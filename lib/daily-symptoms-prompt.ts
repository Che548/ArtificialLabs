export function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Serialize foreground events so a slow storage read cannot open two prompts. */
export function createDailyPromptClaim(
  read: () => Promise<string | null | undefined>,
  write: (day: string) => Promise<void>,
) {
  let pending = false;
  let shownDay: string | undefined;
  return async (date: Date): Promise<boolean> => {
    const day = localDayKey(date);
    if (pending || shownDay === day) return false;
    pending = true;
    try {
      if (await read() === day) {
        shownDay = day;
        return false;
      }
      await write(day);
      shownDay = day;
      return true;
    } finally {
      pending = false;
    }
  };
}
