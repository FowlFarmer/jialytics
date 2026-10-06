/** The breakdowns every page view is counted under, in dashboard order. */
export const DIMENSIONS = [
  'pages',
  'referrers',
  'utm_sources',
  'countries',
  'cities',
  'devices',
  'browsers',
  'os',
] as const;

export type Dimension = (typeof DIMENSIONS)[number];

/** One page view, parsed and ready to store. Nothing here identifies a person: no IP address,
 * no user agent string; `visitor` is a random id the browser keeps in localStorage. */
export interface PageView {
  time: Date;
  /** UTC date, `YYYY-MM-DD`. Every count is kept per UTC day. */
  day: string;
  visitor: string | null;
  values: Record<Dimension, string | null>;
}

/** One UTC day of counts, as an adapter returns it. */
export interface DayCounts {
  day: string;
  views: number;
  /** Unique visitors that day. */
  visitors: number;
  /** View counts per value, for each breakdown. */
  lists: Partial<Record<Dimension, Record<string, number>>>;
}

/**
 * Where page views are kept. Implement these four methods to add a database; see
 * `src/adapters` for MongoDB, Postgres, Redis and in-memory versions.
 */
export interface Adapter {
  /** Store one page view. */
  record(view: PageView): Promise<void>;
  /** Counts for every day in `[from, to]` that has views (`from: null` = since the start). */
  days(from: string | null, to: string): Promise<DayCounts[]>;
  /** Unique visitors across all of `days` together (a visitor on several days counts once). */
  visitors(days: string[]): Promise<number>;
  /** The earliest day with any views, or `null` when there are none. */
  firstDay(): Promise<string | null>;
}

/**
 * Per-day history from before the tracker ran, e.g. pulled from Vercel Web Analytics by
 * `npx jialytics import-vercel`. A day here replaces the adapter's counts for that date.
 */
export interface History {
  days: Record<string, { views: number; visitors: number } & Partial<Record<Dimension, Record<string, number>>>>;
}

export interface ListRow {
  key: string;
  views: number;
}

/** What `GET` returns and the dashboard draws. */
export interface Summary {
  /** Days in range, `0` = all time. */
  range: number;
  /** First day with any data, all time; `null` when there's none. */
  firstDay: string | null;
  totals: { views: number; visitors: number };
  daily: { day: string; views: number; visitors: number }[];
  lists: Record<Dimension, ListRow[]>;
}
