![Jialytics dashboard](https://raw.githubusercontent.com/FowlFarmer/jialytics/main/docs/screenshot.png)

# jialytics

**so you don't have to pay $22 just to see all-time analytics**

Vercel Web Analytics is great, until you want to look further back than 31 days. jialytics is
the same idea, kept in your own database, forever: drop a component into your layout, mount one
route, and get a dashboard of visitors, page views, pages, referrers, UTM sources, countries,
cities, devices, browsers and operating systems over any range from 1 day to all time.

- **One line to track.** `<Jialytics />` counts every page view, client-side navigations included.
- **Your database.** MongoDB, Postgres (pg, Neon, Supabase, PGlite…), Redis (Upstash, Vercel KV,
  ioredis), or [your own](#bring-your-own-database) in four methods.
- **Keep your Vercel history.** `npx jialytics import-vercel` pulls Vercel's per-day data, so the
  days before you switched aren't lost.
- **A dashboard worth opening.** Smoked glass over a blue sky with falling sakura petals that
  scatter in your cursor's wind, a petal trail, and a slider from 1 day to all time.
- **No cookies, no IPs, no user agents stored.** A random id in localStorage counts returning
  visitors; that's it.

## Quick start (Next.js)

```bash
npm install jialytics three
```

`three` is only for the falling petals on the dashboard; leave it out and pass `petals={false}`.

**1. Track** — in `app/layout.tsx`:

```tsx
import { Jialytics } from 'jialytics/react';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Jialytics />
      </body>
    </html>
  );
}
```

**2. Store** — `app/api/jialytics/route.ts`, with the database you use (see [Databases](#databases)):

```ts
import { createJialytics } from 'jialytics';
import { mongodb } from 'jialytics/mongodb';

export const dynamic = 'force-dynamic';
export const { GET, POST, OPTIONS } = createJialytics({
  adapter: mongodb({ uri: process.env.MONGODB_URI! }),
  readToken: process.env.JIALYTICS_TOKEN, // optional: lock the dashboard
});
```

**3. Look** — `app/jialytics/page.tsx`:

```tsx
import { JialyticsDashboard } from 'jialytics/dashboard';

export default function Page() {
  return <JialyticsDashboard />;
}
```

Deploy, visit a few pages, and open `/jialytics` (or `/jialytics?token=…` with a `readToken`).
Visits from localhost aren't counted unless you pass `<Jialytics trackLocalhost />`.

A runnable app is in [`examples/nextjs`](examples/nextjs).

## Databases

Each adapter is its own import, so you only ship the one you use.

| Database | Import | Setup |
| --- | --- | --- |
| MongoDB | `jialytics/mongodb` | `mongodb({ uri })` or `mongodb({ collection })` |
| Postgres | `jialytics/postgres` | `postgres({ client })`: any `pg`-style client |
| Redis | `jialytics/redis` | `redis()` for Upstash / Vercel KV from env, `redis({ client })` for ioredis |
| In memory | `jialytics/memory` | `memory()`: tests and demos only |

```ts
// MongoDB: one document per view, in its own collection (default jialytics_views).
import { mongodb } from 'jialytics/mongodb';
mongodb({ uri: process.env.MONGODB_URI! }); // npm install mongodb

// Postgres: one row per view; the table (default jialytics_views) is created on first use.
import { Pool } from 'pg';
import { postgres } from 'jialytics/postgres';
postgres({ client: new Pool({ connectionString: process.env.DATABASE_URL }) });

// Redis: per-day counters and HyperLogLogs, nothing ever expires. No dependency for Upstash:
import { redis } from 'jialytics/redis';
redis(); // reads KV_REST_API_URL / KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_*)
redis({ client: new Redis(process.env.REDIS_URL) }); // ioredis
```

### Bring your own database

An adapter is four methods ([`src/core/types.ts`](src/core/types.ts)):

```ts
import type { Adapter } from 'jialytics';

const myAdapter: Adapter = {
  async record(view) {},          // store one page view
  async days(from, to) {},        // per-day counts and breakdowns for days in [from, to]
  async visitors(days) {},        // unique visitors across those days
  async firstDay() {},            // the earliest day with data
};
```

The [adapter tests](test/adapters.test.ts) are a ready-made contract: add yours to the list and
they check it the same way as the built-in ones. Pull requests for new databases are welcome.

## Other frameworks

The handler is a plain `(Request) => Promise<Response>`, so anything built on web standards takes
it directly:

```ts
const jialytics = createJialytics({ adapter });

// Hono, Bun, Deno, Remix, SvelteKit, Astro…
app.all('/api/jialytics', (c) => jialytics.handler(c.req.raw));

// Express or Node's http
import { toNodeHandler } from 'jialytics/node';
app.all('/api/jialytics', toNodeHandler(jialytics.handler));
```

Not using React? Track with the vanilla client:

```ts
import { inject } from 'jialytics/client';
inject();
```

## Keeping your Vercel history

Vercel keeps 31 days on Hobby and 12 months on Pro. Pull it before it expires:

```bash
npx jialytics import-vercel --until 2026-10-06
```

Run it in a directory linked to your Vercel project (`vercel link`) with the Vercel CLI logged
in. It writes `jialytics-history.json`, one entry per UTC day; pass it to the handler:

```ts
import history from './jialytics-history.json';
createJialytics({ adapter, history });
```

- `--until` is the day your tracker went live: imports stop before it, so a day is never
  counted by both. (If one ever is, the imported day wins.)
- Running it again merges: pulled days replace the same days, everything else is kept. Upgrade
  to Pro for a month, run `--days 365`, downgrade, and the whole year stays.
- Vercel has no city or UTM source, so imported days don't either.

## Options

### `createJialytics(options)`

| Option | Default | |
| --- | --- | --- |
| `adapter` | required | Where page views are kept |
| `history` | — | Imported per-day history |
| `readToken` | — | Required to read the summary (`?token=` or `Authorization: Bearer`) |
| `ignorePaths` | `[]` | Paths never recorded (exact, `/prefix/`, or RegExp) |
| `botPattern` | common bots | User agents never recorded |
| `geo` | Vercel, Cloudflare, Netlify headers | `(headers) => ({ country, city })` |
| `allowOrigin` | — | CORS origin, for a tracker on another domain |
| `onError` | `console.error` | Called when storing or summarizing fails |

Returns `{ GET, POST, OPTIONS, handler }`. `POST` records a view, `GET ?days=N` returns the
summary (`0` = all time).

### `<Jialytics />` / `inject()`

| Option | Default | |
| --- | --- | --- |
| `endpoint` | `/api/jialytics` | Where the handler is mounted |
| `ignore` | `['/jialytics']` | Paths never sent |
| `trackLocalhost` | `false` | Count visits on localhost and `.local`/`.test` hosts |
| `debug` | `false` | Log each page view |

### `<JialyticsDashboard />`

| Prop | Default | |
| --- | --- | --- |
| `endpoint` | `/api/jialytics` | Where the handler is mounted |
| `token` | the page's `?token=` | The handler's `readToken` |
| `title` | `Jialytics` | The heading |
| `defaultDays` | `30` | Range the slider starts on (`0` = all time) |
| `petals` | `true` | Falling sakura petals (needs `three`) |
| `cursor` | `true` | The star cursor and its petal trail |

## How counting works

- Everything is counted per UTC day; a range is whole days, today included.
- **Page views**: one per page load or client-side navigation to a new path.
- **Visitors**: unique random ids within the range. Imported Vercel days add their own daily
  visitors (Vercel's ids reset every day, so those are visitor-days, the way Vercel sums them).
- **Referrers** count only on the landing page, and only from other sites.
- Bots, crawlers and link previews are dropped. Geo comes from your host's edge headers.

## Development

```bash
npm install
npm test          # real Postgres (PGlite) and MongoDB (mongodb-memory-server), no setup
npm run typecheck
npm run build
```

## Credits

Built by [Theodore Zhu](https://tzhu.dev) for [tzhu.dev](https://tzhu.dev) and
[waterloo.careers](https://waterloo.careers). MIT licensed.
