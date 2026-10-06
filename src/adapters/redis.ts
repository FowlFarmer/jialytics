import { DIMENSIONS, type Adapter, type DayCounts } from '../core/types';

type Command = (string | number)[];
/** Runs commands in one round trip and returns each result, in order. */
export type RedisExec = (commands: Command[]) => Promise<unknown[]>;

export type RedisOptions = {
  /** Key prefix. Every key shares one hash slot (`{prefix}`), so this works on Redis Cluster too. */
  prefix?: string;
} & (
  | {
      /** An Upstash / Vercel KV REST URL and token. Defaults to `KV_REST_API_URL` /
       * `UPSTASH_REDIS_REST_URL` and their tokens from the environment. */
      url?: string;
      token?: string;
    }
  | {
      /** An ioredis client (or anything with ioredis's `pipeline(commands).exec()`). */
      client: { pipeline(commands: Command[]): { exec(): Promise<[Error | null, unknown][] | null> } };
    }
  | {
      /** Your own executor, for any other client. */
      exec: RedisExec;
    }
);

const DAY_MS = 24 * 60 * 60 * 1000;
const epochDay = (day: string) => Math.round(Date.parse(day) / DAY_MS);
// Upstash's pipeline endpoint takes up to about a thousand commands comfortably.
const CHUNK = 900;

function upstash(url: string, token: string): RedisExec {
  const base = url.replace(/\/$/, '');
  return async (commands) => {
    const response = await fetch(`${base}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`jialytics: Redis REST request failed with ${response.status}`);
    const results = (await response.json()) as { result?: unknown; error?: string }[];
    const failure = results.find((item) => item.error);
    if (failure) throw new Error(`jialytics: ${failure.error}`);
    return results.map((item) => item.result);
  };
}

function executor(options: RedisOptions): RedisExec {
  if ('exec' in options) return options.exec;
  if ('client' in options) {
    const { client } = options;
    return async (commands) => {
      const results = (await client.pipeline(commands).exec()) ?? [];
      const failure = results.find(([error]) => error);
      if (failure) throw failure[0];
      return results.map(([, result]) => result);
    };
  }
  const env = typeof process === 'undefined' ? {} : process.env;
  const url = options.url ?? env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = options.token ?? env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('jialytics: redis() needs a REST url and token, a client, or an exec function');
  return upstash(url, token);
}

// HGETALL comes back as a flat [field, value, ...] list over REST and as an object from ioredis.
const hash = (value: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (Array.isArray(value)) for (let i = 0; i + 1 < value.length; i += 2) out[String(value[i])] = Number(value[i + 1]);
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) out[k] = Number(v);
  return out;
};

/**
 * Redis, as per-day counters: a view count, a HyperLogLog of visitors and a hash per breakdown
 * for each UTC day. Small and fast, and nothing ever expires.
 *
 * ```ts
 * redis(); // Upstash or Vercel KV, from the environment
 * redis({ client: new Redis(process.env.REDIS_URL) }); // ioredis
 * ```
 */
export function redis(options: RedisOptions = {}): Adapter {
  const exec = executor(options);
  const prefix = `{${options.prefix ?? 'jialytics'}}`;
  const key = (day: string, part: string) => `${prefix}:day:${day}:${part}`;
  const daysKey = `${prefix}:days`;

  const run = async (commands: Command[]) => {
    const results: unknown[] = [];
    for (let i = 0; i < commands.length; i += CHUNK) results.push(...(await exec(commands.slice(i, i + CHUNK))));
    return results;
  };

  return {
    async record(view) {
      const commands: Command[] = [
        ['ZADD', daysKey, epochDay(view.day), view.day],
        ['INCR', key(view.day, 'views')],
      ];
      if (view.visitor) commands.push(['PFADD', key(view.day, 'visitors'), view.visitor]);
      for (const dimension of DIMENSIONS) {
        const value = view.values[dimension];
        if (value) commands.push(['HINCRBY', key(view.day, dimension), value, 1]);
      }
      await run(commands);
    },

    async days(from, to) {
      const [list] = await exec([
        ['ZRANGE', daysKey, from === null ? '-inf' : epochDay(from), epochDay(to), 'BYSCORE'],
      ]);
      const days = (Array.isArray(list) ? list : []).map(String);
      const perDay = 2 + DIMENSIONS.length;
      const results = await run(
        days.flatMap((day) => [
          ['GET', key(day, 'views')],
          ['PFCOUNT', key(day, 'visitors')],
          ...DIMENSIONS.map((dimension): Command => ['HGETALL', key(day, dimension)]),
        ]),
      );
      return days.map((day, index): DayCounts => {
        const at = index * perDay;
        const lists: DayCounts['lists'] = {};
        DIMENSIONS.forEach((dimension, d) => {
          const counts = hash(results[at + 2 + d]);
          if (Object.keys(counts).length) lists[dimension] = counts;
        });
        return { day, views: Number(results[at] ?? 0), visitors: Number(results[at + 1] ?? 0), lists };
      });
    },

    async visitors(days) {
      if (!days.length) return 0;
      const [count] = await exec([['PFCOUNT', ...days.map((day) => key(day, 'visitors'))]]);
      return Number(count ?? 0);
    },

    async firstDay() {
      const [first] = await exec([['ZRANGE', daysKey, 0, 0]]);
      return Array.isArray(first) && first.length ? String(first[0]) : null;
    },
  };
}
