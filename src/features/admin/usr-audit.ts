/** The India calendar date (yyyy-mm-dd) `days - 1` days before today, and today. Used for the quick ranges on the audit screen. */
export function lastDays(days: number, now: Date = new Date()): { from: string; to: string } {
  const day = (offset: number) => new Date(now.getTime() + 330 * 60_000 - offset * 86_400_000).toISOString().slice(0, 10);
  return { from: day(days - 1), to: day(0) };
}
