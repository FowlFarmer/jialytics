import { vi } from 'vitest';

type Value = string | Set<string> | Map<string, number>;

/** Just enough of Redis for the adapter, with exact (not estimated) HyperLogLog counts. */
export function createFakeRedis() {
  const data = new Map<string, Value>();
  const zset = (key: string) => {
    let value = data.get(key) as Map<string, number> | undefined;
    if (!value) data.set(key, (value = new Map()));
    return value;
  };
  const run = (command: (string | number)[]): unknown => {
    const [name, ...args] = command.map(String);
    switch (name.toUpperCase()) {
      case 'INCR': {
        const next = Number(data.get(args[0]) ?? 0) + 1;
        data.set(args[0], String(next));
        return next;
      }
      case 'GET':
        return (data.get(args[0]) as string | undefined) ?? null;
      case 'PFADD': {
        let set = data.get(args[0]) as Set<string> | undefined;
        if (!set) data.set(args[0], (set = new Set()));
        args.slice(1).forEach((member) => set!.add(member));
        return 1;
      }
      case 'PFCOUNT':
        return new Set(args.flatMap((key) => [...((data.get(key) as Set<string> | undefined) ?? [])])).size;
      case 'HINCRBY': {
        const hash = zset(args[0]);
        hash.set(args[1], (hash.get(args[1]) ?? 0) + Number(args[2]));
        return hash.get(args[1]);
      }
      case 'HGETALL':
        return [...((data.get(args[0]) as Map<string, number> | undefined) ?? [])].flatMap(([k, v]) => [k, String(v)]);
      case 'ZADD':
        zset(args[0]).set(args[2], Number(args[1]));
        return 1;
      case 'ZRANGE': {
        const entries = [...((data.get(args[0]) as Map<string, number> | undefined) ?? [])].sort((a, b) => a[1] - b[1]);
        if (args.includes('BYSCORE')) {
          const bound = (value: string) => (value === '-inf' ? -Infinity : value === '+inf' ? Infinity : Number(value));
          return entries.filter(([, score]) => score >= bound(args[1]) && score <= bound(args[2])).map(([member]) => member);
        }
        const stop = Number(args[2]);
        return entries.slice(Number(args[1]), stop === -1 ? undefined : stop + 1).map(([member]) => member);
      }
      default:
        throw new Error(`fake redis: unsupported ${name}`);
    }
  };
  return { data, run };
}

/** Route fetches to `url` through a fake Upstash REST API. Returns a function that undoes it. */
export function fakeUpstash(url: string, token: string) {
  const redis = createFakeRedis();
  const realFetch = globalThis.fetch;
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const target = String(input instanceof Request ? input.url : input);
    if (!target.startsWith(url)) return realFetch(input as RequestInfo, init);
    if (new Headers(init?.headers).get('authorization') !== `Bearer ${token}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    const commands = JSON.parse(String(init?.body)) as (string | number)[][];
    return Response.json(
      commands.map((command) => {
        try {
          return { result: redis.run(command) };
        } catch (error) {
          return { error: (error as Error).message };
        }
      }),
    );
  });
  return () => spy.mockRestore();
}
