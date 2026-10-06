import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { memory } from '../src/adapters/memory';
import { browserOf, deviceOf, osOf, referrerHost } from '../src/core/parse';
import type { Summary } from '../src/core/types';
import { createJialytics } from '../src/server/handler';
import { toNodeHandler } from '../src/server/node';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const MAC_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const post = (body: object, headers: Record<string, string> = {}) =>
  new Request('https://example.com/api/jialytics', {
    method: 'POST',
    headers: { 'user-agent': MAC_CHROME, 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

describe('user agents and referrers', () => {
  it('groups browsers, systems and devices', () => {
    expect([browserOf(IPHONE), osOf(IPHONE), deviceOf(IPHONE)]).toEqual(['Safari', 'iOS', 'mobile']);
    expect([browserOf(MAC_CHROME), osOf(MAC_CHROME), deviceOf(MAC_CHROME)]).toEqual(['Chrome', 'macOS', 'desktop']);
    const edge = `${MAC_CHROME} Edg/130.0`;
    expect(browserOf(edge)).toBe('Edge');
    const tablet = 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/130 Safari/537.36';
    expect(deviceOf(tablet)).toBe('tablet');
  });

  it('keeps only external referrer hosts', () => {
    expect(referrerHost('https://www.google.com/search?q=x', 'example.com')).toBe('google.com');
    expect(referrerHost('https://example.com/other', 'example.com')).toBeNull();
    expect(referrerHost('', 'example.com')).toBeNull();
    expect(referrerHost('not a url', 'example.com')).toBeNull();
  });
});

describe('createJialytics', () => {
  it('records a page view from the tracker', async () => {
    const adapter = memory();
    const { POST } = createJialytics({ adapter });
    const response = await POST(
      post(
        { path: '/blog', query: '?utm_source=reddit', referrer: 'https://www.reddit.com/r/x', visitor: 'v1' },
        { 'user-agent': IPHONE, 'x-vercel-ip-country': 'CA', 'x-vercel-ip-city': 'Qu%C3%A9bec' },
      ),
    );
    expect(response.status).toBe(204);
    expect(adapter.views).toHaveLength(1);
    expect(adapter.views[0].visitor).toBe('v1');
    expect(adapter.views[0].values).toEqual({
      pages: '/blog',
      referrers: 'reddit.com',
      utm_sources: 'reddit',
      countries: 'CA',
      cities: 'Québec',
      devices: 'mobile',
      browsers: 'Safari',
      os: 'iOS',
    });
  });

  it('reads Cloudflare geo headers too', async () => {
    const adapter = memory();
    await createJialytics({ adapter }).POST(post({ path: '/' }, { 'cf-ipcountry': 'de', 'cf-ipcity': 'Berlin' }));
    expect(adapter.views[0].values.countries).toBe('DE');
    expect(adapter.views[0].values.cities).toBe('Berlin');
  });

  it('drops bots, ignored paths, oversized and broken bodies, without failing', async () => {
    const adapter = memory();
    const errors: unknown[] = [];
    const { POST } = createJialytics({ adapter, ignorePaths: ['/admin', /^\/private/], onError: (e) => errors.push(e) });
    const responses = await Promise.all([
      POST(post({ path: '/' }, { 'user-agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' })),
      POST(post({ path: '/admin' })),
      POST(post({ path: '/admin/users' })),
      POST(post({ path: '/private-notes' })),
      POST(post({ path: '/x'.repeat(5000) })),
      POST(new Request('https://example.com/api/jialytics', { method: 'POST', body: '{not json' })),
    ]);
    expect(responses.every((r) => r.status === 204)).toBe(true);
    expect(adapter.views).toHaveLength(0);
    expect(errors).toHaveLength(1);
    // "/administrator" isn't under "/admin/".
    await POST(post({ path: '/administrator' }));
    expect(adapter.views).toHaveLength(1);
  });

  it('serves the summary', async () => {
    const adapter = memory();
    const { POST, GET } = createJialytics({ adapter });
    await POST(post({ path: '/', visitor: 'a' }));
    await POST(post({ path: '/', visitor: 'b' }));
    await POST(post({ path: '/about', visitor: 'a' }));
    const response = await GET(new Request('https://example.com/api/jialytics?days=7'));
    expect(response.headers.get('cache-control')).toBe('no-store');
    const summary = (await response.json()) as Summary;
    expect(summary.range).toBe(7);
    expect(summary.totals).toEqual({ views: 3, visitors: 2 });
    expect(summary.daily).toHaveLength(1);
    expect(summary.lists.pages).toEqual([
      { key: '/', views: 2 },
      { key: '/about', views: 1 },
    ]);
    expect(Object.keys(summary.lists)).toHaveLength(8);
  });

  it('guards the summary with a read token', async () => {
    const { GET } = createJialytics({ adapter: memory(), readToken: 's3cret' });
    expect((await GET(new Request('https://example.com/api/jialytics'))).status).toBe(401);
    expect((await GET(new Request('https://example.com/api/jialytics?token=nope'))).status).toBe(401);
    expect((await GET(new Request('https://example.com/api/jialytics?token=s3cret'))).status).toBe(200);
    const bearer = new Request('https://example.com/api/jialytics', { headers: { Authorization: 'Bearer s3cret' } });
    expect((await GET(bearer)).status).toBe(200);
  });

  it('answers cross-origin trackers when allowed', async () => {
    const { handler } = createJialytics({ adapter: memory(), allowOrigin: 'https://blog.example.com' });
    const preflight = await handler(new Request('https://example.com/api/jialytics', { method: 'OPTIONS' }));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('https://blog.example.com');
    expect((await handler(new Request('https://example.com/api/jialytics', { method: 'DELETE' }))).status).toBe(405);
  });

  it('runs on Node http through toNodeHandler', async () => {
    const adapter = memory();
    const { handler } = createJialytics({ adapter });
    const server = createServer(toNodeHandler(handler));
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/jialytics`;
    try {
      const posted = await fetch(base, {
        method: 'POST',
        headers: { 'user-agent': MAC_CHROME },
        body: JSON.stringify({ path: '/node', visitor: 'n' }),
      });
      expect(posted.status).toBe(204);
      const summary = (await (await fetch(`${base}?days=0`)).json()) as Summary;
      expect(summary.totals.views).toBe(1);
      expect(summary.lists.pages[0].key).toBe('/node');
    } finally {
      server.close();
    }
  });
});
