import { DIMENSIONS, type Adapter, type DayCounts, type PageView } from '../core/types';

/**
 * Keeps page views in process memory: for tests, demos and trying things out. Everything is
 * gone when the process restarts, and serverless functions don't share it between instances.
 */
export function memory(): Adapter & { views: PageView[] } {
  const views: PageView[] = [];
  return {
    views,
    async record(view) {
      views.push(view);
    },
    async days(from, to) {
      const byDay = new Map<string, { day: DayCounts; visitors: Set<string> }>();
      for (const view of views) {
        if ((from !== null && view.day < from) || view.day > to) continue;
        let entry = byDay.get(view.day);
        if (!entry) {
          entry = { day: { day: view.day, views: 0, visitors: 0, lists: {} }, visitors: new Set() };
          byDay.set(view.day, entry);
        }
        entry.day.views += 1;
        if (view.visitor) entry.visitors.add(view.visitor);
        for (const dimension of DIMENSIONS) {
          const value = view.values[dimension];
          if (!value) continue;
          const counts = (entry.day.lists[dimension] ??= {});
          counts[value] = (counts[value] ?? 0) + 1;
        }
      }
      return [...byDay.values()]
        .map(({ day, visitors }) => ({ ...day, visitors: visitors.size }))
        .sort((a, b) => a.day.localeCompare(b.day));
    },
    async visitors(days) {
      const wanted = new Set(days);
      return new Set(views.filter((view) => wanted.has(view.day) && view.visitor).map((view) => view.visitor)).size;
    },
    async firstDay() {
      return views.reduce<string | null>((first, view) => (first === null || view.day < first ? view.day : first), null);
    },
  };
}
