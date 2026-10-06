import type { PageView } from './types';

/** Crawlers, link previews, headless browsers and scripts: never counted. */
export const DEFAULT_BOT_PATTERN =
  /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|embedly|curl|wget|python-requests|node-fetch|axios/i;

const firstMatch = (ua: string, table: [string, RegExp][]) =>
  table.find(([, pattern]) => pattern.test(ua))?.[0] ?? 'Other';

/** Coarse browser family, the way analytics dashboards group them. */
export const browserOf = (ua: string) =>
  firstMatch(ua, [
    ['Edge', /Edg\//],
    ['Opera', /OPR\/|Opera/],
    ['Samsung Internet', /SamsungBrowser/],
    ['Firefox', /Firefox\/|FxiOS/],
    ['Chrome', /Chrome\/|CriOS/],
    ['Safari', /Safari\//],
  ]);

export const osOf = (ua: string) =>
  firstMatch(ua, [
    ['iOS', /iPhone|iPad|iPod/],
    ['Android', /Android/],
    ['Windows', /Windows/],
    ['macOS', /Mac OS X|Macintosh/],
    ['ChromeOS', /CrOS/],
    ['Linux', /Linux/],
  ]);

export const deviceOf = (ua: string) => {
  if (/iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) return 'tablet';
  return /Mobi|iPhone|iPod|Android/.test(ua) ? 'mobile' : 'desktop';
};

/** The referring site's host, `www.` dropped; `null` for direct visits and internal links. */
export const referrerHost = (referrer: string, ownHost: string) => {
  try {
    const host = new URL(referrer).hostname;
    if (!host || host === ownHost) return null;
    return host.replace(/^www\./, '');
  } catch {
    return null;
  }
};

const decoded = (value: string | null) => {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/** Country and city from the edge's geo headers: Vercel, Cloudflare and Netlify out of the box. */
export function geoFromHeaders(headers: Headers): { country: string | null; city: string | null } {
  const country = headers.get('x-vercel-ip-country') ?? headers.get('cf-ipcountry') ?? headers.get('x-country');
  const city = headers.get('x-vercel-ip-city') ?? headers.get('cf-ipcity') ?? headers.get('x-city');
  return {
    country: country && country !== 'XX' && country !== 'T1' ? country.toUpperCase() : null,
    city: decoded(city),
  };
}

export const dayOf = (time: Date) => time.toISOString().slice(0, 10);

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : '');

/** What the browser tracker sends. */
export interface Beacon {
  path?: unknown;
  query?: unknown;
  referrer?: unknown;
  visitor?: unknown;
}

/** Turn a tracker beacon plus its request into a page view. */
export function toPageView(
  beacon: Beacon,
  request: { url: string; headers: Headers },
  geo: (headers: Headers) => { country: string | null; city: string | null } = geoFromHeaders,
  now = new Date(),
): PageView {
  const ua = request.headers.get('user-agent') ?? '';
  const query = new URLSearchParams(text(beacon.query, 2000));
  const ownHost = new URL(request.url).hostname;
  const { country, city } = geo(request.headers);
  return {
    time: now,
    day: dayOf(now),
    visitor: text(beacon.visitor, 64) || null,
    values: {
      pages: text(beacon.path, 500) || '/',
      referrers: referrerHost(text(beacon.referrer, 2000), ownHost),
      utm_sources: query.get('utm_source')?.slice(0, 100) || null,
      countries: country,
      cities: city,
      devices: deviceOf(ua),
      browsers: browserOf(ua),
      os: osOf(ua),
    },
  };
}
