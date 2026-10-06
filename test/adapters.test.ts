import { PGlite } from '@electric-sql/pglite';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { memory } from '../src/adapters/memory';
import { mongodb } from '../src/adapters/mongodb';
import { postgres } from '../src/adapters/postgres';
import { redis } from '../src/adapters/redis';
import { summarize } from '../src/core/summary';
import type { Adapter, PageView } from '../src/core/types';
import { createFakeRedis, fakeUpstash } from './fakeRedis';

const view = (day: string, visitor: string | null, page: string, extra: Partial<PageView['values']> = {}): PageView => ({
  time: new Date(`${day}T12:00:00Z`),
  day,
  visitor,
  values: {
    pages: page,
    referrers: null,
    utm_sources: null,
    countries: 'CA',
    cities: 'Waterloo',
    devices: 'desktop',
    browsers: 'Chrome',
    os: 'macOS',
    ...extra,
  },
});

// Three days of traffic: visitor "a" comes back on day 3, and one view has no visitor id.
const VIEWS: PageView[] = [
  view('2026-01-01', 'a', '/', { referrers: 'google.com' }),
  view('2026-01-01', 'a', '/about'),
  view('2026-01-01', 'b', '/', { countries: 'US', cities: null, devices: 'mobile', browsers: 'Safari', os: 'iOS' }),
  view('2026-01-02', 'c', '/', { utm_sources: 'newsletter' }),
  view('2026-01-03', 'a', '/blog'),
  view('2026-01-03', null, '/blog'),
];

function contract(name: string, make: () => Promise<{ adapter: Adapter; cleanup?: () => Promise<void> }>) {
  describe(name, () => {
    let adapter: Adapter;
    let cleanup: (() => Promise<void>) | undefined;
    beforeAll(async () => {
      ({ adapter, cleanup } = await make());
      for (const v of VIEWS) await adapter.record(v);
    }, 120_000);
    afterAll(async () => cleanup?.());

    it('counts each day', async () => {
      const days = await adapter.days(null, '2026-12-31');
      expect(days.map(({ day, views, visitors }) => ({ day, views, visitors }))).toEqual([
        { day: '2026-01-01', views: 3, visitors: 2 },
        { day: '2026-01-02', views: 1, visitors: 1 },
        { day: '2026-01-03', views: 2, visitors: 1 },
      ]);
    });

    it('breaks each day down', async () => {
      const [first] = await adapter.days('2026-01-01', '2026-01-01');
      expect(first.lists.pages).toEqual({ '/': 2, '/about': 1 });
      expect(first.lists.referrers).toEqual({ 'google.com': 1 });
      expect(first.lists.countries).toEqual({ CA: 2, US: 1 });
      expect(first.lists.cities).toEqual({ Waterloo: 2 });
      expect(first.lists.devices).toEqual({ desktop: 2, mobile: 1 });
      expect(first.lists.utm_sources ?? {}).toEqual({});
    });

    it('limits days to the range', async () => {
      expect((await adapter.days('2026-01-02', '2026-01-02')).map((d) => d.day)).toEqual(['2026-01-02']);
      expect(await adapter.days('2025-01-01', '2025-12-31')).toEqual([]);
    });

    it('counts a visitor once across days', async () => {
      expect(await adapter.visitors(['2026-01-01', '2026-01-02', '2026-01-03'])).toBe(3);
      expect(await adapter.visitors(['2026-01-01', '2026-01-03'])).toBe(2);
      expect(await adapter.visitors([])).toBe(0);
    });

    it('knows the first day', async () => {
      expect(await adapter.firstDay()).toBe('2026-01-01');
    });

    it('summarizes with imported history replacing its days', async () => {
      const history = {
        days: {
          '2025-12-31': { views: 10, visitors: 7, pages: { '/': 10 } },
          '2026-01-02': { views: 5, visitors: 4, pages: { '/old': 5 } },
        },
      };
      const summary = await summarize(adapter, 0, history, new Date('2026-01-03T20:00:00Z'));
      expect(summary.firstDay).toBe('2025-12-31');
      expect(summary.daily.map((d) => [d.day, d.views])).toEqual([
        ['2025-12-31', 10],
        ['2026-01-01', 3],
        ['2026-01-02', 5],
        ['2026-01-03', 2],
      ]);
      // 2 tracked views of "/" on day 1, plus 10 imported; day 2's tracked "/" is replaced.
      expect(summary.lists.pages[0]).toEqual({ key: '/', views: 12 });
      expect(summary.lists.pages.find((row) => row.key === '/old')).toEqual({ key: '/old', views: 5 });
      // Tracked days 1 and 3 have visitors a, b (a once), imported days add 7 + 4.
      expect(summary.totals).toEqual({ views: 20, visitors: 2 + 11 });

      const lastTwo = await summarize(adapter, 2, history, new Date('2026-01-03T20:00:00Z'));
      expect(lastTwo.daily.map((d) => d.day)).toEqual(['2026-01-02', '2026-01-03']);
      expect(lastTwo.totals).toEqual({ views: 7, visitors: 1 + 4 });
    });
  });
}

contract('memory', async () => ({ adapter: memory() }));

contract('postgres (PGlite)', async () => {
  const db = new PGlite();
  return { adapter: postgres({ client: db }), cleanup: () => db.close() };
});

contract('mongodb', async () => {
  const server = await MongoMemoryServer.create();
  const adapter = mongodb({ uri: server.getUri(), db: 'jialytics_test' });
  return {
    adapter,
    cleanup: async () => {
      await adapter.close();
      await server.stop();
    },
  };
});

contract('redis (Upstash REST)', async () => {
  const restore = fakeUpstash('https://fake.upstash.io', 'secret');
  return { adapter: redis({ url: 'https://fake.upstash.io', token: 'secret' }), cleanup: async () => restore() };
});

contract('redis (ioredis client)', async () => {
  const fake = createFakeRedis();
  // ioredis-shaped: pipeline(commands).exec() -> [error, result][], HGETALL as an object.
  const client = {
    pipeline: (commands: (string | number)[][]) => ({
      exec: async () =>
        commands.map((command): [Error | null, unknown] => {
          const result = fake.run(command);
          if (String(command[0]).toUpperCase() !== 'HGETALL') return [null, result];
          const flat = result as string[];
          return [null, Object.fromEntries(flat.flatMap((_, i) => (i % 2 ? [] : [[flat[i], flat[i + 1]]])))];
        }),
    }),
  };
  return { adapter: redis({ client }) };
});

describe('postgres options', () => {
  it('rejects unsafe table names', () => {
    expect(() => postgres({ client: { query: async () => ({ rows: [] }) }, table: 'views; DROP TABLE x' })).toThrow();
  });
});
