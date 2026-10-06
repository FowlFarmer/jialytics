import { DIMENSIONS, type Adapter, type DayCounts, type Dimension } from '../core/types';

/** Anything with a `pg`-style `query`: `pg`'s Pool or Client, Neon's Pool, Supabase's pooler, PGlite. */
export interface PostgresClient {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

export interface PostgresOptions {
  client: PostgresClient;
  /** Table name. Created on first use if missing. Default `jialytics_views`. */
  table?: string;
  /** Create the table and its index if they don't exist. Default `true`. */
  migrate?: boolean;
}

// Breakdown -> column. One row per page view; no IPs or user agents are stored.
const COLUMNS: Record<Dimension, string> = {
  pages: 'page',
  referrers: 'referrer',
  utm_sources: 'utm_source',
  countries: 'country',
  cities: 'city',
  devices: 'device',
  browsers: 'browser',
  os: 'os',
};

/**
 * Postgres (or anything that speaks it). Bring your own client:
 *
 * ```ts
 * import { Pool } from 'pg';
 * postgres({ client: new Pool({ connectionString: process.env.DATABASE_URL }) });
 * ```
 */
export function postgres({ client, table = 'jialytics_views', migrate = true }: PostgresOptions): Adapter {
  if (!/^[a-z_][a-z0-9_]*$/i.test(table)) throw new Error(`jialytics: invalid table name "${table}"`);
  const columns = DIMENSIONS.map((dimension) => COLUMNS[dimension]);

  let ready: Promise<unknown> | null = null;
  const ensureTable = () =>
    (ready ??= migrate
      ? client
          .query(
            `CREATE TABLE IF NOT EXISTS ${table} (
              id BIGSERIAL PRIMARY KEY,
              ts TIMESTAMPTZ NOT NULL,
              day DATE NOT NULL,
              visitor TEXT,
              ${columns.map((column) => `${column} TEXT`).join(',\n              ')}
            )`,
          )
          .then(() => client.query(`CREATE INDEX IF NOT EXISTS ${table}_day_idx ON ${table} (day)`))
          .catch((error) => {
            ready = null;
            throw error;
          })
      : Promise.resolve());

  return {
    async record(view) {
      await ensureTable();
      const values = DIMENSIONS.map((dimension) => view.values[dimension]);
      const placeholders = values.map((_, index) => `$${index + 4}`).join(', ');
      await client.query(
        `INSERT INTO ${table} (ts, day, visitor, ${columns.join(', ')}) VALUES ($1, $2, $3, ${placeholders})`,
        [view.time.toISOString(), view.day, view.visitor, ...values],
      );
    },

    async days(from, to) {
      await ensureTable();
      const where = `($1::date IS NULL OR day >= $1::date) AND day <= $2::date`;
      const parts = [
        `SELECT to_char(day, 'YYYY-MM-DD') AS day, '' AS dim, NULL AS key, count(*)::int AS n, count(DISTINCT visitor)::int AS v
         FROM ${table} WHERE ${where} GROUP BY day`,
        ...DIMENSIONS.map(
          (dimension) =>
            `SELECT to_char(day, 'YYYY-MM-DD'), '${dimension}', ${COLUMNS[dimension]}, count(*)::int, 0
             FROM ${table} WHERE ${where} AND ${COLUMNS[dimension]} IS NOT NULL GROUP BY day, ${COLUMNS[dimension]}`,
        ),
      ];
      const { rows } = await client.query(parts.join('\nUNION ALL\n'), [from, to]);
      const byDay = new Map<string, DayCounts>();
      const dayOf = (day: string) => {
        let entry = byDay.get(day);
        if (!entry) byDay.set(day, (entry = { day, views: 0, visitors: 0, lists: {} }));
        return entry;
      };
      for (const row of rows) {
        const entry = dayOf(row.day);
        if (row.dim === '') {
          entry.views = Number(row.n);
          entry.visitors = Number(row.v);
        } else {
          (entry.lists[row.dim as Dimension] ??= {})[row.key] = Number(row.n);
        }
      }
      return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
    },

    async visitors(days) {
      if (!days.length) return 0;
      await ensureTable();
      const { rows } = await client.query(
        `SELECT count(DISTINCT visitor)::int AS n FROM ${table} WHERE day = ANY($1::date[])`,
        [days],
      );
      return Number(rows[0]?.n ?? 0);
    },

    async firstDay() {
      await ensureTable();
      const { rows } = await client.query(`SELECT to_char(min(day), 'YYYY-MM-DD') AS day FROM ${table}`);
      return rows[0]?.day ?? null;
    },
  };
}
