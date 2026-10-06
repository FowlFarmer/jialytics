import { DIMENSIONS, type Adapter, type Dimension, type History, type ListRow, type Summary } from './types';
import { dayOf } from './parse';

const DAY_MS = 24 * 60 * 60 * 1000;
export const TOP_N = 10;

/**
 * Build the dashboard's summary for the last `range` days (today included, UTC), or all time
 * for `0`. Every number is a sum over days. An imported history day replaces the adapter's
 * counts for that date, so no day is counted twice. Visitors: unique across the tracked days
 * in range, plus each imported day's visitors (Vercel's ids reset daily, so those are
 * visitor-days, which is also how Vercel adds them up).
 */
export async function summarize(adapter: Adapter, range: number, history?: History, now = new Date()): Promise<Summary> {
  const today = dayOf(now);
  const from = range > 0 ? dayOf(new Date(Date.parse(today) - (range - 1) * DAY_MS)) : null;
  const imported = history?.days ?? {};

  const tracked = (await adapter.days(from, today)).filter((row) => !imported[row.day]);
  const importedDays = Object.keys(imported).filter((day) => (from === null || day >= from) && day <= today);
  const trackedVisitors = tracked.length ? await adapter.visitors(tracked.map((row) => row.day)) : 0;

  const daily = [
    ...tracked.map(({ day, views, visitors }) => ({ day, views, visitors })),
    ...importedDays.map((day) => ({ day, views: imported[day].views, visitors: imported[day].visitors })),
  ].sort((a, b) => a.day.localeCompare(b.day));

  const lists = {} as Record<Dimension, ListRow[]>;
  for (const dimension of DIMENSIONS) {
    const totals = new Map<string, number>();
    const add = (counts: Record<string, number> | undefined) => {
      for (const [key, views] of Object.entries(counts ?? {})) totals.set(key, (totals.get(key) ?? 0) + views);
    };
    tracked.forEach((row) => add(row.lists[dimension]));
    importedDays.forEach((day) => add(imported[day][dimension]));
    lists[dimension] = [...totals]
      .map(([key, views]) => ({ key, views }))
      .sort((a, b) => b.views - a.views || a.key.localeCompare(b.key))
      .slice(0, TOP_N);
  }

  // The slider's span needs the first day ever, whatever the range.
  const firstDay =
    [await adapter.firstDay(), Object.keys(imported).sort()[0]].filter((day): day is string => !!day).sort()[0] ?? null;

  return {
    range,
    firstDay,
    totals: {
      views: daily.reduce((sum, row) => sum + row.views, 0),
      visitors: trackedVisitors + importedDays.reduce((sum, day) => sum + imported[day].visitors, 0),
    },
    daily,
    lists,
  };
}
