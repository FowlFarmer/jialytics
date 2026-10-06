// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { memory } from '../src/adapters/memory';
import { JialyticsDashboard } from '../src/dashboard/Dashboard';
import { createJialytics } from '../src/server/handler';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  // jsdom has no layout: give the chart a width so it draws.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private callback: ResizeObserverCallback) {}
      observe() {
        this.callback([{ contentRect: { width: 800 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      disconnect() {}
    },
  );
});
afterEach(() => {
  document.body.innerHTML = '';
});

async function serve(readToken?: string) {
  const adapter = memory();
  const { handler, POST } = createJialytics({ adapter, readToken });
  const today = new Date().toISOString().slice(0, 10);
  for (const [path, visitor] of [['/', 'a'], ['/', 'b'], ['/pricing', 'a']]) {
    await POST(new Request('https://example.com/api/jialytics', { method: 'POST', body: JSON.stringify({ path, visitor }) }));
  }
  const fetchSpy = vi.fn((input: RequestInfo, init?: RequestInit) =>
    handler(new Request(new URL(String(input), 'https://example.com'), init)),
  );
  vi.stubGlobal('fetch', fetchSpy);
  return { today, fetchSpy };
}

async function render(props: Parameters<typeof JialyticsDashboard>[0] = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    createRoot(container).render(<JialyticsDashboard petals={false} cursor={false} {...props} />);
  });
  // Let the fetches resolve and the slider settle (it waits briefly before fetching a new range).
  for (let i = 0; i < 50; i++) {
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
    const body = container.querySelector('.jl-body');
    if (i > 10 && (!body || body.getAttribute('aria-busy') === 'false')) break;
  }
  return container;
}

describe('JialyticsDashboard', () => {
  it('draws totals, the line chart and the lists', async () => {
    const { fetchSpy } = await serve();
    const page = await render();
    expect(page.querySelector('h1')?.textContent).toBe('Jialytics');
    expect([...page.querySelectorAll('.jl-totals dd')].map((dd) => dd.textContent)).toEqual(['2', '3']);
    // All the data is from today, so the slider's whole span is one day: all time.
    expect(page.querySelector('.jl-range output')?.textContent).toBe('All time');
    expect(page.querySelector('svg circle.jl-dot')).not.toBeNull(); // one day: a dot, not a line
    const pages = [...page.querySelectorAll('.jl-list')][0];
    expect([...pages.querySelectorAll('.jl-key')].map((el) => el.textContent)).toEqual(['/', '/pricing']);
    expect(String(fetchSpy.mock.calls[0][0])).toBe('/api/jialytics?days=30');
    expect(document.head.querySelector('style[data-jialytics]')).not.toBeNull();
  });

  it('sends the page token and explains a missing one', async () => {
    const { fetchSpy } = await serve('s3cret');
    const locked = await render();
    expect(locked.textContent).toContain('This dashboard needs its token.');
    document.body.innerHTML = '';
    const open = await render({ token: 's3cret' });
    expect(open.querySelectorAll('.jl-totals dd')).toHaveLength(2);
    expect(new Headers(fetchSpy.mock.calls.at(-1)![1]?.headers).get('authorization')).toBe('Bearer s3cret');
  });
});
