import { DEFAULT_BOT_PATTERN, geoFromHeaders, toPageView, type Beacon } from '../core/parse';
import { summarize } from '../core/summary';
import type { Adapter, History } from '../core/types';

export interface JialyticsOptions {
  /** Where page views are kept: `memory()`, `mongodb()`, `postgres()`, `redis()`, or your own. */
  adapter: Adapter;
  /** Per-day history from before the tracker ran (`npx jialytics import-vercel`). */
  history?: History;
  /**
   * Required to read the summary (`GET`). The dashboard sends it as `?token=` or an
   * `Authorization: Bearer` header. Without one, anyone who finds the endpoint can read the
   * totals; nothing personal is ever returned either way.
   */
  readToken?: string;
  /** Paths never recorded, e.g. the dashboard's own page. Strings match exactly or as a `/prefix/`. */
  ignorePaths?: (string | RegExp)[];
  /** User agents never recorded. Defaults to common bots, crawlers and scripts. */
  botPattern?: RegExp;
  /** Country and city for a request. Defaults to Vercel, Cloudflare and Netlify geo headers. */
  geo?: (headers: Headers) => { country: string | null; city: string | null };
  /** Let a tracker on another origin post here (e.g. `'https://example.com'` or `'*'`). */
  allowOrigin?: string;
  /** Called when storing or summarizing fails. Defaults to `console.error`. */
  onError?: (error: unknown) => void;
}

const MAX_BODY = 8 * 1024;

const ignored = (path: string, rules: (string | RegExp)[]) =>
  rules.some((rule) =>
    typeof rule === 'string' ? path === rule || path.startsWith(rule.endsWith('/') ? rule : `${rule}/`) : rule.test(path),
  );

/**
 * One handler for both halves: `POST` records a page view from the tracker, `GET` returns the
 * dashboard's summary. Web-standard `Request` -> `Response`, so it drops into Next.js route
 * handlers, Hono, Remix, SvelteKit, Bun or Deno as is (and Node/Express via `jialytics/node`).
 *
 * ```ts
 * // app/api/jialytics/route.ts
 * export const { GET, POST, OPTIONS } = createJialytics({ adapter: postgres({ client: pool }) });
 * ```
 */
export function createJialytics(options: JialyticsOptions) {
  const {
    adapter,
    history,
    readToken,
    ignorePaths = [],
    botPattern = DEFAULT_BOT_PATTERN,
    geo = geoFromHeaders,
    allowOrigin,
    onError = (error) => console.error('[jialytics]', error),
  } = options;

  const cors = (headers: Record<string, string> = {}) =>
    allowOrigin
      ? {
          ...headers,
          'Access-Control-Allow-Origin': allowOrigin,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          Vary: 'Origin',
        }
      : headers;

  async function POST(request: Request): Promise<Response> {
    const ua = request.headers.get('user-agent') ?? '';
    if (!botPattern.test(ua)) {
      try {
        const raw = await request.text();
        if (raw.length <= MAX_BODY) {
          const beacon = JSON.parse(raw || '{}') as Beacon;
          const view = toPageView(beacon, request, geo);
          if (!ignored(view.values.pages ?? '/', ignorePaths)) await adapter.record(view);
        }
      } catch (error) {
        onError(error);
      }
    }
    // Always 204: the tracker never needs to know, and a beacon can't read it anyway.
    return new Response(null, { status: 204, headers: cors() });
  }

  async function GET(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const headers = cors({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
    if (readToken) {
      const given = url.searchParams.get('token') ?? request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
      if (given !== readToken) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers });
    }
    const range = Math.max(0, Math.floor(Number(url.searchParams.get('days') ?? 30)) || 0);
    try {
      return new Response(JSON.stringify(await summarize(adapter, range, history)), { headers });
    } catch (error) {
      onError(error);
      return new Response(JSON.stringify({ error: 'summary_failed' }), { status: 500, headers });
    }
  }

  async function OPTIONS(): Promise<Response> {
    return new Response(null, { status: 204, headers: cors() });
  }

  /** Routes by method, for frameworks that take a single handler. */
  async function handler(request: Request): Promise<Response> {
    if (request.method === 'POST') return POST(request);
    if (request.method === 'GET' || request.method === 'HEAD') return GET(request);
    if (request.method === 'OPTIONS') return OPTIONS();
    return new Response(null, { status: 405, headers: cors({ Allow: 'GET, POST, OPTIONS' }) });
  }

  return { GET, POST, OPTIONS, handler };
}
