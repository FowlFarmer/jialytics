import {
  lazy,
  Suspense,
  useEffect,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import type { Dimension, ListRow, Summary } from '../core/types';
import { STYLES } from './styles';

const PetalFall = lazy(() => import('./petals/PetalFall'));
const CursorTrail = lazy(() => import('./CursorTrail'));

export interface DashboardProps {
  /** Where the handler is mounted. Default `/api/jialytics`. */
  endpoint?: string;
  /** The handler's `readToken`, if it has one. Defaults to the page's own `?token=`. */
  token?: string;
  /** The heading. Default `Jialytics`. */
  title?: string;
  /** Range the slider starts on, in days. Default `30`. */
  defaultDays?: number;
  /** Falling sakura petals behind the cards (needs `three`). Default `true`. */
  petals?: boolean;
  /** The star cursor and its petal trail. Default `true`. */
  cursor?: boolean;
}

// The range slider runs exponentially from 1 day to all time (its far end), so short ranges get
// most of its travel. A range is fetched once the slider rests briefly; seen ranges are cached.
const SLIDER_STEPS = 1000;
const FETCH_DELAY_MS = 150;
const DAY_MS = 24 * 60 * 60 * 1000;
const CHART_HEIGHT = 200;
const AXIS_WIDTH = 36;
const AXIS_HEIGHT = 24;
// Room at each end of the line so the hover dot isn't clipped.
const LINE_INSET = 6;
const LISTS: [string, Dimension][] = [
  ['Pages', 'pages'],
  ['Referrers', 'referrers'],
  ['UTM sources', 'utm_sources'],
  ['Countries', 'countries'],
  ['Cities', 'cities'],
  ['Devices', 'devices'],
  ['Browsers', 'browsers'],
  ['Operating systems', 'os'],
];

type Day = Summary['daily'][number];

const formatNumber = (value: number) => value.toLocaleString('en-US');
const formatDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const todayTime = () => Date.parse(new Date().toISOString().slice(0, 10));

// The API leaves out days with no views; the chart needs every day in the range, at zero.
function fillDays(summary: Summary): Day[] {
  const { daily, range } = summary;
  if (!daily.length && !range) return [];
  const byDay = new Map(daily.map((row) => [row.day, row]));
  const today = todayTime();
  const start = range ? today - (range - 1) * DAY_MS : Date.parse(daily[0].day);
  const filled: Day[] = [];
  for (let time = start; time <= today; time += DAY_MS) {
    const day = new Date(time).toISOString().slice(0, 10);
    filled.push(byDay.get(day) ?? { day, views: 0, visitors: 0 });
  }
  return filled;
}

// Round axis ticks: 0 and up to three steps of 1, 2 or 5 x 10^n covering the peak.
function ticksFor(peak: number) {
  const rough = Math.max(peak, 1) / 3;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= rough)!;
  const top = Math.ceil(Math.max(peak, 1) / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= top; value += step) ticks.push(value);
  return ticks;
}

function useWidth(ref: RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

function DailyChart({ daily }: { daily: Day[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const width = useWidth(wrapRef);
  const [active, setActive] = useState<number | null>(null);

  const ticks = ticksFor(Math.max(0, ...daily.map((d) => d.views)));
  const top = ticks[ticks.length - 1];
  const plotWidth = Math.max(width - AXIS_WIDTH - 2 * LINE_INSET, 0);
  const step = daily.length > 1 ? plotWidth / (daily.length - 1) : 0;
  const x = (index: number) => AXIS_WIDTH + LINE_INSET + (daily.length > 1 ? index * step : plotWidth / 2);
  const y = (value: number) => CHART_HEIGHT - (value / top) * CHART_HEIGHT;
  const labelEvery = Math.max(1, Math.ceil(daily.length / Math.max(1, Math.floor(plotWidth / 64))));
  const line = daily.map((d, index) => `${index ? 'L' : 'M'}${x(index)},${y(d.views)}`).join('');
  const area = `${line}L${x(daily.length - 1)},${CHART_HEIGHT}L${x(0)},${CHART_HEIGHT}Z`;
  const gradientId = `jl-area-${useMemo(() => Math.random().toString(36).slice(2, 8), [])}`;

  // The crosshair finds the nearest day: the reader aims at a date, not at the line.
  const indexAt = (clientX: number) => {
    if (!daily.length || !wrapRef.current) return null;
    const bounds = wrapRef.current.getBoundingClientRect();
    const offset = clientX - bounds.left - AXIS_WIDTH - LINE_INSET;
    if (offset < -LINE_INSET || offset > plotWidth + LINE_INSET) return null;
    return step ? Math.min(daily.length - 1, Math.max(0, Math.round(offset / step))) : 0;
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (!daily.length) return;
    const move = ({ ArrowLeft: -1, ArrowRight: 1, Home: -Infinity, End: Infinity } as Record<string, number>)[event.key];
    if (move === undefined) return;
    event.preventDefault();
    setActive((current) => Math.min(daily.length - 1, Math.max(0, (current ?? daily.length - 1) + move)));
  };

  const point = active !== null ? daily[active] : null;
  const tipLeft = active !== null ? x(active) : 0;

  return (
    <div
      ref={wrapRef}
      className="jl-chart"
      tabIndex={daily.length ? 0 : -1}
      onPointerMove={(event) => setActive(indexAt(event.clientX))}
      onPointerLeave={() => setActive(null)}
      onFocus={() => setActive((current) => current ?? daily.length - 1)}
      onBlur={() => setActive(null)}
      onKeyDown={onKeyDown}
    >
      {daily.length === 0 && <p className="jl-empty">No data</p>}
      {width > 0 && daily.length > 0 && (
        <svg width={width} height={CHART_HEIGHT + AXIS_HEIGHT} aria-hidden="true">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" className="jl-area-top" />
              <stop offset="1" className="jl-area-bottom" />
            </linearGradient>
          </defs>
          {ticks.map((tick) => (
            <g key={tick}>
              <line className="jl-grid" x1={AXIS_WIDTH} x2={width} y1={y(tick) + 0.5} y2={y(tick) + 0.5} />
              <text className="jl-tick" x={AXIS_WIDTH - 8} y={y(tick)} dy="0.32em" textAnchor="end">
                {formatNumber(tick)}
              </text>
            </g>
          ))}
          {daily.length > 1 && <path d={area} fill={`url(#${gradientId})`} />}
          {daily.length > 1 && <path className="jl-line" d={line} />}
          {point && active !== null && (
            <line className="jl-crosshair" x1={x(active)} x2={x(active)} y1={0} y2={CHART_HEIGHT} />
          )}
          {(point || daily.length === 1) && (
            <circle className="jl-dot" cx={x(active ?? 0)} cy={y((point ?? daily[0]).views)} r={4.5} />
          )}
          {/* Counted back from today, so the latest day always has a label and they never crowd. */}
          {daily.map(
            (d, index) =>
              (daily.length - 1 - index) % labelEvery === 0 && (
                <text
                  key={d.day}
                  className="jl-tick"
                  x={x(index)}
                  y={CHART_HEIGHT + 16}
                  textAnchor={
                    daily.length > 1 && index === daily.length - 1 ? 'end' : index === 0 && daily.length > 1 ? 'start' : 'middle'
                  }
                >
                  {formatDay(d.day)}
                </text>
              ),
          )}
        </svg>
      )}
      {point && (
        <div
          className="jl-tip"
          role="status"
          style={{ left: tipLeft, transform: `translateX(${tipLeft > width / 2 ? 'calc(-100% - 12px)' : '12px'})` }}
        >
          <span className="jl-tip-day">{formatDay(point.day)}</span>
          <span>
            <strong>{formatNumber(point.visitors)}</strong> visitors
          </span>
          <span>
            <strong>{formatNumber(point.views)}</strong> views
          </span>
        </div>
      )}
    </div>
  );
}

function TopList({ title, rows }: { title: string; rows: ListRow[] }) {
  const max = Math.max(1, ...rows.map((row) => row.views));
  return (
    <section className="jl-card jl-list">
      <h2>{title}</h2>
      {rows.length === 0 && <p className="jl-empty">No data</p>}
      <ol>
        {rows.map((row) => (
          <li key={row.key} title={`${row.key}: ${formatNumber(row.views)} views`}>
            <span className="jl-fill" style={{ width: `${(row.views / max) * 100}%` }} />
            <span className="jl-key">{row.key}</span>
            <span className="jl-num">{formatNumber(row.views)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

const daysAt = (position: number, span: number) =>
  position >= SLIDER_STEPS ? 0 : Math.min(span, Math.max(1, Math.round(span ** (position / SLIDER_STEPS))));
const positionOf = (days: number, span: number) =>
  span <= 1 ? SLIDER_STEPS : Math.min(SLIDER_STEPS, Math.round((Math.log(days) / Math.log(span)) * SLIDER_STEPS));
const rangeLabel = (days: number) => (days === 0 ? 'All time' : days === 1 ? '1 day' : `${days} days`);

let styleRefs = 0;
let styleElement: HTMLStyleElement | null = null;
function useStyles() {
  useInsertionEffect(() => {
    if (styleRefs++ === 0) {
      styleElement = document.createElement('style');
      styleElement.dataset.jialytics = '';
      styleElement.textContent = STYLES;
      document.head.appendChild(styleElement);
    }
    return () => {
      if (--styleRefs === 0) styleElement?.remove();
    };
  }, []);
}

/**
 * The dashboard: totals, a daily line chart, and the top pages, referrers, places and devices,
 * over any range from 1 day to all time. Render it on its own page; it fills the viewport.
 *
 * ```tsx
 * <JialyticsDashboard />
 * ```
 */
export function JialyticsDashboard({
  endpoint = '/api/jialytics',
  token,
  title = 'Jialytics',
  defaultDays = 30,
  petals = true,
  cursor = true,
}: DashboardProps) {
  useStyles();
  // Days from the first recorded day to today: the slider's span. Known after the first fetch.
  const [span, setSpan] = useState<number | null>(null);
  const [position, setPosition] = useState(0);
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cache = useRef(new Map<number, Summary>());
  const days = span === null ? defaultDays : daysAt(position, span);

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  // Only ever called from effects, so window is there (the page may render on a server first).
  const load = (range: number) => {
    const cached = cache.current.get(range);
    if (cached) return Promise.resolve(cached);
    const auth = token ?? new URLSearchParams(window.location.search).get('token') ?? undefined;
    const url = `${endpoint}${endpoint.includes('?') ? '&' : '?'}days=${range}`;
    return fetch(url, { headers: auth ? { Authorization: `Bearer ${auth}` } : {} }).then(async (response) => {
      if (!response.ok) throw new Error(response.status === 401 ? 'unauthorized' : `HTTP ${response.status}`);
      const summary = (await response.json()) as Summary;
      cache.current.set(range, summary);
      return summary;
    });
  };

  useEffect(() => {
    let live = true;
    setLoading(true);
    const timer = window.setTimeout(
      () => {
        load(days)
          .then((summary) => {
            if (!live) return;
            setData(summary);
            setError(null);
            if (span === null) {
              const first = summary.firstDay ? Date.parse(summary.firstDay) : todayTime();
              const nextSpan = Math.max(1, Math.round((todayTime() - first) / DAY_MS) + 1);
              setSpan(nextSpan);
              setPosition(positionOf(Math.min(defaultDays || nextSpan, nextSpan), nextSpan));
            }
          })
          .catch((reason: Error) => live && setError(reason.message))
          .finally(() => live && setLoading(false));
      },
      cache.current.has(days) || span === null ? 0 : FETCH_DELAY_MS,
    );
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, endpoint, token]);

  const daily = useMemo(() => (data ? fillDays(data) : []), [data]);

  return (
    <div className={`jl-page${cursor ? ' jl-cursor' : ''}`}>
      {petals && (
        <Suspense fallback={null}>
          <PetalFall />
        </Suspense>
      )}
      {cursor && (
        <Suspense fallback={null}>
          <CursorTrail />
        </Suspense>
      )}
      <div className="jl-shell">
        <header className="jl-head">
          <h1>{title}</h1>
          {span !== null && (
            <label className="jl-range">
              <output>{rangeLabel(days)}</output>
              <input
                type="range"
                min={0}
                max={SLIDER_STEPS}
                value={position}
                aria-label="Range"
                aria-valuetext={rangeLabel(days)}
                style={{ '--jl-range-fill': `${(position / SLIDER_STEPS) * 100}%` } as CSSProperties}
                onChange={(event) => setPosition(Number(event.target.value))}
              />
            </label>
          )}
        </header>

        {error && (
          <p className="jl-empty">{error === 'unauthorized' ? 'This dashboard needs its token.' : "Couldn't load analytics."}</p>
        )}
        {!data && !error && <p className="jl-empty">Loading…</p>}
        {data && (
          <main className={`jl-body${loading ? ' is-loading' : ''}`} aria-busy={loading}>
            <section className="jl-card jl-overview">
              <dl className="jl-totals">
                <div>
                  <dt>Visitors</dt>
                  <dd>{formatNumber(data.totals.visitors)}</dd>
                </div>
                <div>
                  <dt>Page views</dt>
                  <dd>{formatNumber(data.totals.views)}</dd>
                </div>
              </dl>
              <DailyChart daily={daily} />
            </section>
            <div className="jl-lists">
              {LISTS.map(([heading, key]) => (
                <TopList key={key} title={heading} rows={data.lists[key] ?? []} />
              ))}
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
