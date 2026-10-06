// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { inject as Inject } from '../src/client/index';

let inject: typeof Inject;

const sent = () =>
  (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map(([url, init]) => ({
    url,
    ...JSON.parse(init.body),
  }));
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('inject', () => {
  let stop = () => {};
  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
    localStorage.clear();
    history.replaceState(null, '', '/');
    // The tracker remembers the last page across inject() calls; start each test fresh.
    vi.resetModules();
    ({ inject } = await import('../src/client/index'));
  });
  afterEach(() => {
    stop();
    vi.unstubAllGlobals();
  });

  it('skips development hosts unless asked', () => {
    // jsdom's page is on localhost.
    stop = inject();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends the landing page with its referrer, then each navigation without one', async () => {
    Object.defineProperty(document, 'referrer', { value: 'https://news.ycombinator.com/', configurable: true });
    stop = inject({ trackLocalhost: true, endpoint: '/track' });
    history.pushState(null, '', '/blog?utm_source=hn');
    await tick();
    history.replaceState(null, '', '/blog?utm_source=hn#comments'); // same path: not a new view
    await tick();
    history.pushState(null, '', '/about');
    await tick();
    const views = sent();
    expect(views.map((v) => v.path)).toEqual(['/', '/blog', '/about']);
    expect(views[0].url).toBe('/track');
    expect(views[0].referrer).toBe('https://news.ycombinator.com/');
    expect(views[1].referrer).toBe('');
    expect(views[1].query).toBe('?utm_source=hn');
    // One visitor id, kept for next time.
    expect(new Set(views.map((v) => v.visitor)).size).toBe(1);
    expect(localStorage.getItem('jialytics_visitor')).toBe(views[0].visitor);
  });

  it('skips the dashboard and other ignored paths', async () => {
    stop = inject({ trackLocalhost: true });
    history.pushState(null, '', '/jialytics');
    await tick();
    history.pushState(null, '', '/jialytics/settings');
    await tick();
    expect(sent().map((v) => v.path)).toEqual(['/']);
  });

  it("doesn't count the same page twice when restarted (React StrictMode)", async () => {
    stop = inject({ trackLocalhost: true });
    stop();
    stop = inject({ trackLocalhost: true });
    history.pushState(null, '', '/next');
    await tick();
    expect(sent().map((v) => v.path)).toEqual(['/', '/next']);
  });

  it('puts the history API back when stopped', () => {
    const original = history.pushState;
    stop = inject({ trackLocalhost: true });
    expect(history.pushState).not.toBe(original);
    stop();
    expect(history.pushState).toBe(original);
  });
});
